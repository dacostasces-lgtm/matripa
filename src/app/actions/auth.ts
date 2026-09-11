"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/lib/auth-form";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = (formData: FormData, key: string): string =>
  typeof formData.get(key) === "string" ? (formData.get(key) as string).trim() : "";

/** N'autorise que des chemins internes : bloque les redirections ouvertes. */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/partenaire";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const next = safeNext(text(formData, "suivant"));

  if (!EMAIL_RE.test(email) || password.length === 0) {
    return { status: "error", message: "Adresse e-mail ou mot de passe manquant." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Message volontairement identique pour un e-mail inconnu et un mot de
    // passe erroné : ne pas révéler quels comptes existent.
    return { status: "error", message: "Identifiants incorrects." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const next = safeNext(text(formData, "suivant"));

  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "Adresse e-mail invalide." };
  }
  if (password.length < 8) {
    return { status: "error", message: "Le mot de passe doit faire au moins 8 caractères." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { status: "error", message: "La création du compte a échoué. Réessayez." };
  }

  // Si la confirmation par e-mail est active, aucune session n'est ouverte.
  if (!data.session) {
    return {
      status: "success",
      message: "Compte créé. Confirmez votre adresse via le lien reçu par e-mail.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

/**
 * Envoi du lien de réinitialisation.
 *
 * La réponse est **toujours** la même, que l'adresse existe ou non : sinon ce
 * formulaire devient un oracle permettant d'énumérer les comptes, exactement
 * ce que `signIn` prend soin d'éviter.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email");

  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "Adresse e-mail invalide." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?suivant=/mot-de-passe`,
  });

  if (error) console.error("[auth] reset request failed", error);

  return {
    status: "success",
    message:
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
  };
}

/**
 * Définition du nouveau mot de passe.
 *
 * Suppose une session de récupération déjà ouverte par `/auth/callback` :
 * `updateUser` s'applique à l'utilisateur courant, il n'y a pas de jeton à
 * repasser ici.
 */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = text(formData, "password");
  const confirmation = text(formData, "password_confirmation");

  if (password.length < 8) {
    return { status: "error", message: "Le mot de passe doit faire au moins 8 caractères." };
  }
  if (password !== confirmation) {
    return { status: "error", message: "Les deux mots de passe ne correspondent pas." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "Lien expiré ou déjà utilisé. Demandez-en un nouveau.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[auth] password update failed", error);
    return { status: "error", message: "La mise à jour a échoué. Réessayez." };
  }

  revalidatePath("/", "layout");
  redirect("/partenaire?mdp=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
