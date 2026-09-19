"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";
import { slugify, type ListingFormState } from "@/lib/listing-form";
import { whatsAppForStorage } from "@/lib/whatsapp";
import {
  CATEGORIES,
  CITIES,
  MOBILITIES,
  OPTION_TYPES,
  type CategorySlug,
  type CitySlug,
  type Mobility,
  type OptionType,
  type PriceUnit,
  type Rate,
} from "@/types/listing";

const text = (fd: FormData, key: string): string =>
  typeof fd.get(key) === "string" ? (fd.get(key) as string).trim() : "";

const PRICE_UNITS: PriceUnit[] = ["hour", "night", "service"];

/**
 * Préfixe public du bucket `listings`. Les URL d'images arrivent par des
 * champs cachés du formulaire : sans cette vérification, un partenaire
 * pourrait faire pointer sa couverture vers n'importe quel domaine — hotlink,
 * pixel de suivi, ou contenu qu'il substituerait après validation.
 */
const STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/listings/`;

const isOwnStorageUrl = (url: string): boolean =>
  STORAGE_PREFIX.length > "/storage/v1/object/public/listings/".length &&
  url.startsWith(STORAGE_PREFIX);

/** Découpe une saisie « Français, Lingala , Anglais » en liste propre. */
const list = (value: string, max = 12): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);

interface ParsedListing {
  values: {
    title: string;
    highlight: string | null;
    description: string;
    category: CategorySlug;
    option_type: OptionType;
    mobility: Mobility;
    city: CitySlug;
    district: string | null;
    price_xaf: number;
    price_unit: PriceUnit;
    rates: Rate[];
    cover_url: string;
    images: string[];
    video_url: string | null;
    whatsapp_phone: string | null;
    amenities: string[];
    is_available_now: boolean;
    languages: string[];
    availability: string[];
    status: "draft" | "published";
  };
  errors: ListingFormState["errors"];
  enumsOk: boolean;
}

/** Lecture et validation communes à la création et à la modification. */
function parseListing(formData: FormData): ParsedListing {
  const title = text(formData, "title");
  const description = text(formData, "description");
  const priceXaf = Number.parseInt(text(formData, "price_xaf"), 10);
  const priceUnit = text(formData, "price_unit") as PriceUnit;

  const category = text(formData, "category") as CategorySlug;
  const optionType = text(formData, "option_type") as OptionType;
  const mobility = text(formData, "mobility") as Mobility;
  const city = text(formData, "city") as CitySlug;

  const coverUrl = text(formData, "cover_url");

  // Même règle que les images : l'aperçu vidéo doit vivre dans notre bucket.
  // Une URL libre permettrait le hotlink, le pistage, ou la substitution du
  // contenu après validation — et elle finit dans un `<video src>`.
  const videoUrlRaw = text(formData, "video_url");
  const videoUrl = videoUrlRaw && isOwnStorageUrl(videoUrlRaw) ? videoUrlRaw : null;
  const images = formData
    .getAll("images")
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .filter(isOwnStorageUrl)
    .slice(0, 10);

  // Lignes tarifaires : trois tableaux parallèles issus du formulaire, filtrés
  // sur les lignes réellement remplies.
  const labels = formData.getAll("rate_label").map(String);
  const amounts = formData.getAll("rate_amount").map(String);
  const units = formData.getAll("rate_unit").map(String);

  const rates: Rate[] = labels
    .map((label, i) => ({
      label: label.trim(),
      amount_xaf: Number.parseInt(amounts[i] ?? "", 10),
      unit: (PRICE_UNITS.includes(units[i] as PriceUnit) ? units[i] : priceUnit) as PriceUnit,
    }))
    .filter((r) => r.label.length > 0 && Number.isInteger(r.amount_xaf) && r.amount_xaf >= 0)
    .slice(0, 8);

  const errors: ListingFormState["errors"] = {};

  if (title.length < 5 || title.length > 90) {
    errors.title = "Le titre doit faire entre 5 et 90 caractères.";
  }
  if (description.length < 30) {
    errors.description = "Décrivez le profil en 30 caractères au minimum.";
  }
  if (!Number.isInteger(priceXaf) || priceXaf < 0 || priceXaf > 100_000_000) {
    errors.price_xaf = "Tarif invalide.";
  }
  if (!CITIES.some((c) => c.slug === city)) errors.city = "Ville invalide.";
  // Facultatif, mais s'il est saisi il doit ouvrir une vraie conversation :
  // c'est le lien que suivront les clients.
  const whatsapp = whatsAppForStorage(text(formData, "whatsapp_phone"));
  if (!whatsapp.ok) {
    errors.whatsapp_phone = "Numéro WhatsApp invalide. Exemple : 06 912 34 56 ou +242 06 912 34 56.";
  }
  if (!coverUrl) {
    errors.cover_url = "Ajoutez au moins une image de couverture.";
  } else if (!isOwnStorageUrl(coverUrl)) {
    errors.cover_url = "Image invalide : téléversez-la depuis ce formulaire.";
  }

  const enumsOk =
    CATEGORIES.some((c) => c.slug === category) &&
    OPTION_TYPES.some((o) => o.slug === optionType) &&
    MOBILITIES.some((m) => m.slug === mobility) &&
    PRICE_UNITS.includes(priceUnit);

  return {
    enumsOk,
    errors,
    values: {
      title,
      highlight: text(formData, "highlight") || null,
      description,
      category,
      option_type: optionType,
      mobility,
      city,
      district: text(formData, "district") || null,
      price_xaf: priceXaf,
      price_unit: priceUnit,
      // À défaut de grille saisie, le tarif de référence tient lieu de ligne.
      rates: rates.length > 0
        ? rates
        : [{ label: "Tarif de référence", amount_xaf: priceXaf, unit: priceUnit }],
      cover_url: coverUrl,
      images,
      video_url: videoUrl,
      whatsapp_phone: whatsapp.ok ? whatsapp.value : null,
      amenities: list(text(formData, "amenities")),
      is_available_now: formData.get("is_available_now") === "on",
      languages: list(text(formData, "languages")),
      availability: list(text(formData, "availability")),
      status: formData.get("publish") === "on" ? "published" : "draft",
    },
  };
}

/**
 * Création d'une annonce par un partenaire.
 *
 * `owner_id` est forcé à l'utilisateur de la session : il n'est jamais lu
 * depuis le formulaire. `is_vip`, `is_verified`, `rating` et `reviews_count`
 * ne sont pas renseignés — les GRANT de colonne les refuseraient de toute
 * façon, la certification relevant de `/admin`.
 */
export async function createListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire/annonces/nouvelle");

  const { values, errors, enumsOk } = parseListing(formData);

  if (!enumsOk) return { status: "error", message: "Formulaire invalide.", errors };
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Veuillez corriger les champs signalés.", errors };
  }

  // Unicité du slug : suffixe aléatoire court plutôt qu'une boucle de
  // vérification, sujette à une course entre deux créations simultanées.
  const slug = `${slugify(values.title)}-${Math.random().toString(36).slice(2, 7)}`;

  const { error } = await supabase
    .from("listings")
    .insert({ ...values, slug, owner_id: user.id });

  if (error) {
    console.error("[listings] create failed", error);
    return {
      status: "error",
      message: "L'enregistrement a échoué. Réessayez dans un instant.",
      errors: {},
    };
  }

  revalidatePath("/partenaire");
  revalidateTag(LISTINGS_TAG);
  redirect("/partenaire?cree=1");
}

/**
 * Modification d'une annonce existante.
 *
 * Le `slug` n'est pas régénéré : il sert d'URL publique et peut déjà être
 * partagé. Le filtre `owner_id` est explicite — `listings_public_read` rend
 * toute annonce publiée lisible et les policies se combinent en OU.
 */
export async function updateListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const listingId = text(formData, "listing_id");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire");
  if (!listingId) {
    return { status: "error", message: "Profil introuvable.", errors: {} };
  }

  const { values, errors, enumsOk } = parseListing(formData);

  if (!enumsOk) return { status: "error", message: "Formulaire invalide.", errors };
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Veuillez corriger les champs signalés.", errors };
  }

  const { error, count } = await supabase
    .from("listings")
    .update(values, { count: "exact" })
    .eq("id", listingId)
    .eq("owner_id", user.id);

  if (error) {
    console.error("[listings] update failed", error);
    return {
      status: "error",
      message: "L'enregistrement a échoué. Réessayez dans un instant.",
      errors: {},
    };
  }
  if (count === 0) {
    return { status: "error", message: "Profil introuvable.", errors: {} };
  }

  revalidatePath("/partenaire");
  revalidateTag(LISTINGS_TAG);
  revalidatePath(`/annonces/${text(formData, "slug")}`);
  redirect("/partenaire?modifie=1");
}

/**
 * Bascule brouillon / publiée / archivée.
 *
 * Le filtre `owner_id` est explicite, pour la même raison que ci-dessus.
 */
export async function setListingStatus(formData: FormData) {
  const listingId = text(formData, "listing_id");
  const status = text(formData, "status");

  if (!["draft", "published", "archived"].includes(status)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire");

  const { error } = await supabase
    .from("listings")
    .update({ status: status as "draft" | "published" | "archived" })
    .eq("id", listingId)
    .eq("owner_id", user.id);

  if (error) console.error("[listings] status update failed", error);

  revalidatePath("/partenaire");
  revalidateTag(LISTINGS_TAG);
}
