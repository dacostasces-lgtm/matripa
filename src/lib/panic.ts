export const PANIC_EXIT_URL = "https://news.google.com";

/**
 * Quitte immédiatement Matripa vers une page d'actualité neutre.
 *
 * `replace` et non `href` : la page courante est remplacée dans l'historique,
 * un appui sur « retour » ne ramène donc pas sur Matripa.
 */
export function panicExit(location: Pick<Location, "replace"> = window.location) {
  location.replace(PANIC_EXIT_URL);
}

/** Délai maximal entre deux appuis sur Échap pour déclencher la sortie. */
export const DOUBLE_TAP_MS = 500;

/** Vrai si cet appui suit le précédent d'assez près pour former un double appui. */
export const isDoubleTap = (previous: number | null, now: number, windowMs = DOUBLE_TAP_MS): boolean =>
  previous !== null && now - previous <= windowMs;
