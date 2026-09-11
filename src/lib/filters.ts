import {
  EMPTY_FILTERS,
  MOBILITIES,
  OPTION_TYPES,
  PRICE_BOUNDS,
  isCategorySlug,
  isCitySlug,
  type ListingFilters,
  type Mobility,
  type OptionType,
} from "@/types/listing";

/** Forme brute d'un `searchParams` Next.js 15 (résolu depuis la Promise). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const isOptionType = (v: unknown): v is OptionType =>
  OPTION_TYPES.some((o) => o.slug === v);

const isMobility = (v: unknown): v is Mobility => MOBILITIES.some((m) => m.slug === v);

/**
 * Parse et *valide* l'URL. Toute valeur inconnue est ignorée plutôt que
 * propagée jusqu'à la requête SQL — l'URL est une entrée non fiable.
 */
export function parseFilters(params: RawSearchParams): ListingFilters {
  const city = first(params.city);
  const category = first(params.category);
  const option = first(params.option_type);
  const mobility = first(params.mobility);
  const priceMax = Number.parseInt(first(params.price_max) ?? "", 10);
  const page = Number.parseInt(first(params.page) ?? "", 10);
  const query = first(params.q)?.trim();

  return {
    city: isCitySlug(city) ? city : null,
    category: isCategorySlug(category) ? category : null,
    option_type: isOptionType(option) ? option : null,
    mobility: isMobility(mobility) ? mobility : null,
    price_max:
      Number.isFinite(priceMax) && priceMax > PRICE_BOUNDS.min && priceMax < PRICE_BOUNDS.max
        ? priceMax
        : null,
    query: query ? query.slice(0, 80) : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Sérialise les filtres en query string canonique (valeurs nulles omises). */
export function serializeFilters(filters: Partial<ListingFilters>): string {
  const search = new URLSearchParams();
  const merged = { ...EMPTY_FILTERS, ...filters };

  if (merged.city) search.set("city", merged.city);
  if (merged.category) search.set("category", merged.category);
  if (merged.option_type) search.set("option_type", merged.option_type);
  if (merged.mobility) search.set("mobility", merged.mobility);
  if (merged.price_max) search.set("price_max", String(merged.price_max));
  if (merged.query) search.set("q", merged.query);
  // La page 1 reste implicite pour garder des URLs propres et partageables.
  if (merged.page > 1) search.set("page", String(merged.page));

  return search.toString();
}

/** Clé stable servant à réinitialiser les <Suspense> lors d'un changement de filtre. */
export const filtersKey = (filters: ListingFilters): string => serializeFilters(filters) || "all";

export const activeFilterCount = (filters: ListingFilters): number =>
  [filters.category, filters.option_type, filters.mobility, filters.price_max, filters.query].filter(
    Boolean,
  ).length;
