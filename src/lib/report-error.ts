/**
 * Remontée d'erreurs, indépendante du fournisseur.
 *
 * POST JSON vers `NEXT_PUBLIC_ERROR_REPORT_URL` — une route d'ingestion Sentry,
 * un webhook Logflare, ou n'importe quel collecteur maison. Sans variable
 * configurée, la fonction journalise et s'arrête : comme pour les
 * notifications, une supervision absente ne doit jamais casser le parcours.
 */
export function reportError(error: Error & { digest?: string }, context: string) {
  console.error(`[${context}]`, error);

  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
  if (!endpoint || typeof window === "undefined") return;

  const payload = {
    context,
    message: error.message,
    digest: error.digest ?? null,
    stack: error.stack ?? null,
    url: window.location.href,
    user_agent: navigator.userAgent,
    at: new Date().toISOString(),
  };

  // `keepalive` : le signalement doit survivre à la navigation qui suit
  // souvent une erreur. On avale l'échec — signaler l'échec du signalement
  // n'apporterait rien à l'utilisateur.
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
