import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /*
   * Restreint aux routes qui ont réellement besoin d'une session.
   *
   * `updateSession` appelle `supabase.auth.getUser()`, soit un aller-retour
   * réseau vers le serveur Auth. L'appliquer au catalogue public annulerait
   * l'essentiel du bénéfice de la mise en cache : une page servie depuis le
   * cache attendrait quand même cette requête.
   *
   * Le jeton de rafraîchissement est longue durée : un partenaire qui parcourt
   * le site public pendant une heure verra simplement sa session renouvelée
   * en arrivant sur `/partenaire`.
   */
  matcher: [
    "/partenaire/:path*",
    "/admin/:path*",
    "/mes-demandes/:path*",
    "/compte/:path*",
    "/signaler/:path*",
    "/mot-de-passe",
    "/connexion",
  ],
};
