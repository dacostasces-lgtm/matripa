import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";
import {
  LISTING_CARD_COLUMNS,
  LISTING_EXPLORER_COLUMNS,
  PAGE_SIZE,
  VIDEO_STORY_COLUMNS,
  VIDEO_STORY_LIMIT,
  type CitySlug,
  type Listing,
  type ListingCardData,
  type ListingExplorerData,
  type ListingFilters,
  type VideoStory,
} from "@/types/listing";

/**
 * Toutes les lectures de ce module portent sur des données publiques et
 * filtrent explicitement `status = 'published'`. Elles passent donc par le
 * client anonyme sans cookies : lire les cookies rendrait `/` et les fiches
 * dynamiques, interdisant toute mise en cache alors que le catalogue bouge à
 * peine. Le périmètre visible est identique — RLS n'expose de toute façon que
 * les annonces publiées à `anon`.
 *
 * Le rendu de `/` reste dynamique — lire `searchParams` l'impose en Next 15 —
 * mais les requêtes elles-mêmes sont mémoïsées via `unstable_cache`. C'est là
 * qu'est le coût réel : l'aller-retour base, pas le rendu. Toutes les entrées
 * portent l'étiquette `listings`, invalidée par `revalidateTag` dès qu'une
 * annonce change ; le `revalidate` n'est qu'un filet de sécurité.
 */
export const LISTINGS_TAG = "listings";

const CACHE_TTL = 300;
export interface ListingPage {
  listings: ListingCardData[];
  total: number;
  hasMore: boolean;
}

/**
 * Fil d'annonces filtré.
 *
 * Le tri place les offres VIP en tête (`is_vip desc`) puis les plus récentes :
 * c'est l'ordre attendu côté produit, et il s'appuie sur l'index composite
 * `(city, category, is_vip desc, created_at desc)` défini dans les migrations.
 */
async function fetchListingsUncached(filters: ListingFilters): Promise<ListingPage> {
  const supabase = createPublicClient();

  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("listings")
    .select(LISTING_CARD_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.city) query = query.eq("city", filters.city);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.option_type) query = query.eq("option_type", filters.option_type);
  if (filters.price_max) query = query.lte("price_xaf", filters.price_max);

  // « Les deux » couvre sur place *et* à domicile : une annonce polyvalente
  // doit remonter quel que soit le mode demandé.
  if (filters.mobility && filters.mobility !== "les_deux") {
    query = query.in("mobility", [filters.mobility, "les_deux"]);
  } else if (filters.mobility === "les_deux") {
    query = query.eq("mobility", "les_deux");
  }

  if (filters.query) {
    // `websearch` tolère les fautes de saisie et les opérateurs naturels.
    query = query.textSearch("search_vector", filters.query, {
      type: "websearch",
      config: "french",
    });
  }

  const { data, error, count } = await query.returns<ListingCardData[]>();

  if (error) {
    // On journalise puis on dégrade : une grille vide vaut mieux qu'un écran d'erreur.
    console.error("[listings] fetch failed", error);
    return { listings: [], total: 0, hasMore: false };
  }

  const now = Date.now();
  const sorted = [...(data ?? [])].sort((a, b) => {
    const aBoosted = a.boosted_until ? new Date(a.boosted_until).getTime() > now : false;
    const bBoosted = b.boosted_until ? new Date(b.boosted_until).getTime() > now : false;
    if (aBoosted && !bBoosted) return -1;
    if (!aBoosted && bBoosted) return 1;
    return 0;
  });

  const total = count ?? 0;
  return { listings: sorted, total, hasMore: to + 1 < total };
}

async function fetchListingBySlugUncached(slug: string): Promise<Listing | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<Listing>();

  if (error) {
    console.error("[listings] detail fetch failed", error);
    return null;
  }
  return data;
}

/** Annonces similaires affichées en bas de la fiche détail. */
async function fetchRelatedListingsUncached(listing: Listing, limit = 6): Promise<ListingCardData[]> {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("listings")
    .select(LISTING_CARD_COLUMNS)
    .eq("status", "published")
    .eq("city", listing.city)
    .eq("category", listing.category)
    .neq("id", listing.id)
    .order("is_vip", { ascending: false })
    .limit(limit)
    .returns<ListingCardData[]>();

  return data ?? [];
}

/**
 * Aperçus vidéo du carrousel d'accueil.
 *
 * Volontairement indépendant des filtres, à l'exception de la ville : le rail
 * est une vitrine, pas un résultat de recherche. Le lier au filtre de
 * catégorie le viderait dès la première sélection, alors que c'est justement
 * le moment où l'on veut donner envie d'explorer.
 */
async function fetchVideoStoriesUncached(city: CitySlug | null): Promise<VideoStory[]> {
  const supabase = createPublicClient();

  let query = supabase
    .from("listings")
    .select(VIDEO_STORY_COLUMNS)
    .eq("status", "published")
    .not("video_url", "is", null)
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(VIDEO_STORY_LIMIT);

  if (city) query = query.eq("city", city);

  const { data, error } = await query.returns<VideoStory[]>();

  if (error) {
    // Le rail est un agrément : en cas d'échec on le masque, sans bruit.
    console.error("[listings] stories fetch failed", error);
    return [];
  }
  return data ?? [];
}

export interface ListingReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
}

/** Avis publiés sur une annonce, du plus récent au plus ancien. */
async function fetchListingReviewsUncached(
  listingId: string,
  limit = 20,
): Promise<ListingReview[]> {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ListingReview[]>();

  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*                          Enveloppes mises en cache                         */
/* -------------------------------------------------------------------------- */

/**
 * La clé de cache doit refléter *toutes* les entrées de la requête : deux
 * combinaisons de filtres différentes ne doivent jamais partager une entrée.
 */
const filtersKeyParts = (f: ListingFilters): string[] => [
  f.city ?? "-",
  f.category ?? "-",
  f.option_type ?? "-",
  f.mobility ?? "-",
  String(f.price_max ?? "-"),
  f.query ?? "-",
  String(f.page),
];

export const fetchListings = (filters: ListingFilters): Promise<ListingPage> =>
  unstable_cache(
    () => fetchListingsUncached(filters),
    ["listings:feed", ...filtersKeyParts(filters)],
    { revalidate: CACHE_TTL, tags: [LISTINGS_TAG] },
  )();

/**
 * Au-delà, l'accueil pèserait trop lourd sur une connexion mobile lente : tout
 * ce qui est chargé ici est sérialisé dans le HTML. Si le catalogue publié
 * dépasse ce plafond, l'explorateur l'annonce (cf. `total`) — ce sera le
 * signal pour passer à une pagination côté serveur.
 */
export const EXPLORER_LIMIT = 200;

export interface ExplorerCatalogue {
  listings: ListingExplorerData[];
  /** Nombre d'annonces publiées en base, y compris au-delà du plafond. */
  total: number;
}

/**
 * Catalogue utilisé par l'explorateur client de l'accueil : ville, catégorie,
 * recherche et filtres avancés y réagissent sans aller-retour réseau.
 */
async function fetchExplorerListingsUncached(): Promise<ExplorerCatalogue> {
  const supabase = createPublicClient();
  const { data, error, count } = await supabase
    .from("listings")
    .select(LISTING_EXPLORER_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(EXPLORER_LIMIT)
    .returns<ListingExplorerData[]>();

  if (error) {
    console.error("[listings] explorer fetch failed", error);
    return { listings: [], total: 0 };
  }
  const listings = data ?? [];
  return { listings, total: count ?? listings.length };
}

export const fetchExplorerListings = (): Promise<ExplorerCatalogue> =>
  // Clé versionnée : le cache de données Vercel survit aux déploiements, une
  // entrée à l'ancien format (simple tableau) serait sinon relue telle quelle.
  unstable_cache(fetchExplorerListingsUncached, ["listings:explorer:v2"], {
    revalidate: CACHE_TTL,
    tags: [LISTINGS_TAG],
  })();

export const fetchVideoStories = (city: CitySlug | null): Promise<VideoStory[]> =>
  unstable_cache(
    () => fetchVideoStoriesUncached(city),
    ["listings:stories", city ?? "-"],
    { revalidate: CACHE_TTL, tags: [LISTINGS_TAG] },
  )();

export const fetchListingBySlug = (slug: string): Promise<Listing | null> =>
  unstable_cache(
    () => fetchListingBySlugUncached(slug),
    ["listings:detail", slug],
    { revalidate: CACHE_TTL, tags: [LISTINGS_TAG] },
  )();

export const fetchRelatedListings = (
  listing: Listing,
  limit = 6,
): Promise<ListingCardData[]> =>
  unstable_cache(
    () => fetchRelatedListingsUncached(listing, limit),
    ["listings:related", listing.id, String(limit)],
    { revalidate: CACHE_TTL, tags: [LISTINGS_TAG] },
  )();

export const fetchListingReviews = (
  listingId: string,
  limit = 20,
): Promise<ListingReview[]> =>
  unstable_cache(
    () => fetchListingReviewsUncached(listingId, limit),
    ["listings:reviews", listingId, String(limit)],
    { revalidate: CACHE_TTL, tags: [LISTINGS_TAG] },
  )();
