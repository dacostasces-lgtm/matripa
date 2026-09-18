/**
 * Favoris enregistrés sur l'appareil (localStorage), sans compte.
 *
 * Choix délibéré pour une plateforme où la discrétion compte : aucune trace
 * des profils aimés n'est conservée sur un serveur, et rien ne nécessite de
 * migration de base. Seuls des identifiants sont stockés ; les fiches sont
 * relues à jour depuis Supabase à l'affichage.
 */

export const FAVORITES_KEY = "matripa:favoris";
export const MAX_FAVORITES = 200;

/** Longueur d'un UUID ; au-delà, la valeur n'est pas un identifiant d'annonce. */
const MAX_ID_LENGTH = 64;

/** Relit la valeur stockée en ignorant tout ce qui n'est pas une liste d'identifiants. */
export function parseFavoriteIds(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const ids = parsed.filter(
    (id): id is string => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH,
  );
  return Array.from(new Set(ids)).slice(0, MAX_FAVORITES);
}

/** Ajoute en tête (le plus récent d'abord) ou retire l'annonce. */
export function toggleFavoriteId(ids: string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [id, ...ids].slice(0, MAX_FAVORITES);
}
