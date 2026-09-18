import {
  categoryShort,
  cityLabel,
  type ListingExplorerData,
  type ListingFilters,
} from "@/types/listing";

/** Minuscules, sans accents ni espaces superflus : « Kintélé » se trouve en tapant « kintele ». */
export const normalizeSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const haystack = (listing: ListingExplorerData): string =>
  normalizeSearch(
    [
      listing.title,
      listing.highlight,
      listing.district,
      cityLabel(listing.city),
      categoryShort(listing.category),
      listing.description,
      ...listing.amenities,
    ]
      .filter(Boolean)
      .join(" "),
  );

/**
 * Équivalent client de la requête du catalogue (`fetchListings`) : mêmes
 * critères, appliqués sans aller-retour réseau à l'explorateur de l'accueil.
 * La recherche texte exige que *chaque* mot figure quelque part dans l'annonce.
 */
export function matchesFilters(listing: ListingExplorerData, filters: ListingFilters): boolean {
  if (filters.city && listing.city !== filters.city) return false;
  if (filters.category && listing.category !== filters.category) return false;
  if (filters.option_type && listing.option_type !== filters.option_type) return false;
  if (filters.price_max && listing.price_xaf > filters.price_max) return false;

  // « Les deux » couvre sur place *et* à domicile : une annonce polyvalente
  // remonte quel que soit le mode demandé (même règle que la requête serveur).
  if (filters.mobility === "les_deux" && listing.mobility !== "les_deux") return false;
  if (
    filters.mobility &&
    filters.mobility !== "les_deux" &&
    listing.mobility !== filters.mobility &&
    listing.mobility !== "les_deux"
  ) {
    return false;
  }

  if (filters.query) {
    const text = haystack(listing);
    return normalizeSearch(filters.query)
      .split(" ")
      .every((word) => text.includes(word));
  }
  return true;
}
