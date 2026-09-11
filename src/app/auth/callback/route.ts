import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** N'autorise que des chemins internes : bloque les redirections ouvertes. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/partenaire";
}

/**
 * Échange le code reçu par e-mail contre une session.
 *
 * Sert la réinitialisation de mot de passe et la confirmation d'adresse :
 * Supabase envoie l'utilisateur ici avec un `code`, qu'il faut convertir en
 * session avant de pouvoir appeler `updateUser`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("suivant"));

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] code exchange failed", error);
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_expire`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
