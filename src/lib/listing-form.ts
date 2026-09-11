/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export interface ListingFormState {
  status: "idle" | "error";
  message: string | null;
  errors: Partial<
    Record<"title" | "description" | "price_xaf" | "city" | "cover_url", string>
  >;
}

export const INITIAL_LISTING_STATE: ListingFormState = {
  status: "idle",
  message: null,
  errors: {},
};

/**
 * Slug URL à partir du titre : minuscules, accents retirés, ponctuation
 * remplacée par des tirets. Le même calcul est fait côté serveur, la valeur
 * envoyée par le client n'étant jamais digne de confiance.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
