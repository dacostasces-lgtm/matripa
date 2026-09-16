/**
 * Modèle de domaine Matripa.
 * Les libellés métier sont volontairement centralisés ici : le reste de
 * l'application ne manipule que des slugs stables (compatibles enums Postgres).
 */

/* -------------------------------------------------------------------------- */
/*                                   Villes                                   */
/* -------------------------------------------------------------------------- */

export const CITIES = [
  { slug: "brazzaville", label: "Brazzaville", region: "Pool" },
  { slug: "pointe-noire", label: "Pointe-Noire", region: "Kouilou" },
  { slug: "dolisie", label: "Dolisie", region: "Niari" },
  { slug: "nkayi", label: "Nkayi", region: "Bouenza" },
  { slug: "ouesso", label: "Ouesso", region: "Sangha" },
  { slug: "oyo", label: "Oyo", region: "Cuvette" },
] as const;

export type CitySlug = (typeof CITIES)[number]["slug"];

const CITY_MAP = new Map(CITIES.map((c) => [c.slug, c]));

export const cityLabel = (slug: CitySlug | string): string =>
  CITY_MAP.get(slug as CitySlug)?.label ?? slug;

export const isCitySlug = (v: unknown): v is CitySlug =>
  typeof v === "string" && CITY_MAP.has(v as CitySlug);

/* -------------------------------------------------------------------------- */
/*                                 Catégories                                 */
/* -------------------------------------------------------------------------- */

export const CATEGORIES = [
  {
    slug: "categorie-a",
    code: "A",
    label: "Rencontres",
    short: "Rencontres",
    /** Unité tarifaire par défaut pour cette catégorie. */
    defaultUnit: "night",
  },
  {
    slug: "categorie-b",
    code: "B",
    label: "Massages",
    short: "Massages",
    defaultUnit: "service",
  },
  {
    slug: "categorie-c",
    code: "C",
    label: "Escortes",
    short: "Escortes",
    defaultUnit: "hour",
  },
] as const satisfies readonly {
  slug: string;
  code: string;
  label: string;
  short: string;
  defaultUnit: PriceUnit;
}[];

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const categoryShort = (slug: CategorySlug | string): string =>
  CATEGORY_MAP.get(slug as CategorySlug)?.short ?? slug;

export const isCategorySlug = (v: unknown): v is CategorySlug =>
  typeof v === "string" && CATEGORY_MAP.has(v as CategorySlug);

/* -------------------------------------------------------------------------- */
/*                          Type d'offre & mobilité                           */
/* -------------------------------------------------------------------------- */

/**
 * Les slugs restent `option_*` : ils sont figés par l'enum Postgres
 * `listing_option` et par les URLs déjà partagées. Seuls les libellés suivent
 * le vocabulaire produit (« Formule »).
 */
export const OPTION_TYPES = [
  { slug: "option_1", label: "Formule 1" },
  { slug: "option_2", label: "Formule 2" },
  { slug: "option_3", label: "Formule 3" },
] as const;

export type OptionType = (typeof OPTION_TYPES)[number]["slug"];

export const MOBILITIES = [
  { slug: "sur_place", label: "Sur place" },
  { slug: "a_domicile", label: "À domicile" },
  { slug: "les_deux", label: "Les deux" },
] as const;

export type Mobility = (typeof MOBILITIES)[number]["slug"];

export const mobilityLabel = (slug: Mobility | string): string =>
  MOBILITIES.find((m) => m.slug === slug)?.label ?? slug;

export const optionLabel = (slug: OptionType | string): string =>
  OPTION_TYPES.find((o) => o.slug === slug)?.label ?? slug;

export type PriceUnit = "hour" | "night" | "service";

export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  hour: "heure",
  night: "nuit",
  service: "prestation",
};

/* -------------------------------------------------------------------------- */
/*                                  Annonce                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ligne de la table `public.listings`.
 *
 * Déclaré en alias de type et non en `interface` : postgrest-js contraint les
 * lignes à `Record<string, unknown>`, or une interface n'a pas d'index
 * signature implicite et ferait échouer la contrainte — le client retomberait
 * alors sur un typage permissif, sans aucune erreur visible.
 */
export type Listing = {
  id: string;
  slug: string;
  title: string;
  /** Accroche courte affichée sur la carte, ex. « Massages sensuels & relaxation ». */
  highlight: string | null;
  description: string;

  category: CategorySlug;
  option_type: OptionType;
  mobility: Mobility;

  city: CitySlug;
  district: string | null;

  /** Tarif de référence en XAF (entier, la devise n'a pas de sous-unité). */
  price_xaf: number;
  price_unit: PriceUnit;
  /** Grille tarifaire complète affichée en page détail. */
  rates: Rate[];

  cover_url: string;
  images: string[];

  /** Aperçu vertical (shorts). `null` tant qu'aucune vidéo n'est jointe. */
  video_url: string | null;
  /** Vignette du lecteur : évite une frame noire avant le premier `play`. */
  video_poster_url: string | null;

  rating: number | null;
  reviews_count: number;

  is_vip: boolean;
  is_verified: boolean;
  /** Pastille verte « Disponible immédiatement » sur la carte. */
  is_available_now: boolean;

  /** Services inclus, ex. « Service 24/7 », « Salon privé ». */
  amenities: string[];
  languages: string[];
  availability: string[];

  /** Identifiant du propriétaire (compte partenaire / membre). */
  user_id?: string;
  /** Expiration du boost pour priorité d'affichage. */
  boosted_until?: string | null;
  /** Numéro WhatsApp direct au format international ex: "+242061234567". */
  whatsapp_phone?: string | null;
  /** Badge spécifique vérifié par selfie vidéo. */
  is_video_verified?: boolean;
  /** Galerie de photos et vidéos privées verrouillées. */
  private_media?: PrivateMediaItem[];

  created_at: string;
};

export interface PrivateMediaItem {
  id: string;
  listing_id: string;
  type: "image" | "video";
  preview_blur_url: string;
  full_url: string;
  price_xaf: number;
  is_locked: boolean;
}

export interface VirtualGift {
  id: string;
  name: string;
  emoji: string;
  amount_xaf: number;
  description: string;
}

export interface BoostOption {
  id: "boost_24h" | "boost_7d";
  duration_hours: number;
  price_xaf: number;
  label: string;
  badge: string;
}

export type Rate = {
  label: string;
  amount_xaf: number;
  unit: PriceUnit;
};

/** Projection légère utilisée par la grille d'accueil. */
export type ListingCardData = Pick<
  Listing,
  | "id"
  | "slug"
  | "title"
  | "highlight"
  | "city"
  | "district"
  | "category"
  | "price_xaf"
  | "price_unit"
  | "cover_url"
  | "rating"
  | "is_vip"
  | "is_verified"
  | "is_available_now"
  // La carte n'affiche que le badge « Vidéo 4K » : l'URL sert uniquement à
  // savoir qu'un aperçu existe, elle n'est jamais chargée à ce niveau.
  | "video_url"
> & {
  boosted_until?: string | null;
  is_video_verified?: boolean;
};

export const LISTING_CARD_COLUMNS =
  "id, slug, title, highlight, city, district, category, price_xaf, price_unit, cover_url, rating, is_vip, is_verified, is_available_now, video_url, boosted_until, is_video_verified";

/* -------------------------------------------------------------------------- */
/*                              Aperçus vidéo                                 */
/* -------------------------------------------------------------------------- */

/**
 * Élément du carrousel « Aperçus » en tête de page (format vertical 9/16).
 * Projection délibérément minimale : un rail de shorts n'a besoin ni des
 * tarifs, ni de la description.
 */
export type VideoStory = Pick<
  Listing,
  | "id"
  | "slug"
  | "title"
  | "city"
  | "category"
  | "cover_url"
  | "video_url"
  | "video_poster_url"
  | "is_vip"
> & { video_url: string };

export const VIDEO_STORY_COLUMNS =
  "id, slug, title, city, category, cover_url, video_url, video_poster_url, is_vip";

/** Au-delà, le rail devient un mur : on préfère une sélection courte. */
export const VIDEO_STORY_LIMIT = 12;

/* -------------------------------------------------------------------------- */
/*                                  Filtres                                   */
/* -------------------------------------------------------------------------- */

export interface ListingFilters {
  city: CitySlug | null;
  category: CategorySlug | null;
  option_type: OptionType | null;
  mobility: Mobility | null;
  /** Budget maximum en XAF. */
  price_max: number | null;
  query: string | null;
  page: number;
}

export const PRICE_BOUNDS = { min: 0, max: 500_000, step: 5_000 } as const;

export const PAGE_SIZE = 24;

export const EMPTY_FILTERS: ListingFilters = {
  city: null,
  category: null,
  option_type: null,
  mobility: null,
  price_max: null,
  query: null,
  page: 1,
};
