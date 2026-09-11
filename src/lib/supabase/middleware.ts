import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Rafraîchit la session Supabase à chaque requête et propage les cookies mis
 * à jour. Sans cela, un Server Component ne peut pas réécrire les cookies :
 * la session expirerait silencieusement et l'utilisateur serait déconnecté.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // `getUser()` et non `getSession()` : seul le premier revalide le jeton
  // auprès du serveur Auth. `getSession()` fait confiance au cookie, qui est
  // manipulable côté client.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Garde d'accès à l'espace partenaire. Faite ici plutôt que dans un layout
  // pour que la redirection ait lieu avant tout rendu.
  // `/mot-de-passe` est volontairement absent : on y arrive avec une session
  // de récupération, et la page gère elle-même le cas du lien expiré avec un
  // message utile plutôt qu'une redirection muette.
  const guarded = ["/partenaire", "/admin", "/mes-demandes", "/compte"];

  if (!user && guarded.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("suivant", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
