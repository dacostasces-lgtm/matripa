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

  // Google ou Facebook renvoient `error` quand l'utilisateur annule ou que la
  // configuration du fournisseur est incomplète : ce n'est pas un lien e-mail
  // à renvoyer.
  if (searchParams.get("error")) {
    console.error("[auth] provider error", searchParams.get("error"), searchParams.get("error_description"));
    return NextResponse.redirect(`${origin}/connexion?erreur=connexion_externe`);
  }

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
