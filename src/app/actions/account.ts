"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";
import type { AuthFormState } from "@/lib/auth-form";
import { accountIdentifier, matchesAccountIdentifier } from "@/lib/auth-providers";

/**
 * Suppression définitive du compte.
 *
 * La confirmation par saisie de l'adresse est exigée côté serveur, et pas
 * seulement côté client : c'est une action irréversible, un double clic
 * accidentel ne doit pas suffire.
 *
 * Les effets en cascade sont ceux déclarés dans le schéma :
 *   — `listings.owner_id`  → cascade : les offres publiées disparaissent ;
 *   — `reviews.author_id`  → cascade : les avis disparaissent, et le trigger
 *     recalcule la note des annonces concernées ;
 *   — `requests.author_id` → set null : les demandes sont conservées mais
 *     détachées, le partenaire garde l'historique nécessaire à son activité.
 */
export async function deleteMyAccount(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const confirmation = String(formData.get("confirmation") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/compte");

  // Un compte créé par WhatsApp n'a pas d'e-mail : il confirme avec son numéro.
  const identifier = accountIdentifier(user);
  if (!matchesAccountIdentifier(identifier, confirmation)) {
    return {
      status: "error",
      message:
        identifier?.kind === "phone"
          ? "Saisissez exactement le numéro de téléphone de votre compte pour confirmer."
          : "Saisissez exactement l'adresse e-mail de votre compte pour confirmer.",
    };
  }

  // `deleteUser` exige la clé service_role : c'est le seul endroit du parcours
  // utilisateur qui l'emprunte, et l'identité supprimée est strictement celle
  // de la session en cours.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error("[account] deletion failed", error);
    return { status: "error", message: "La suppression a échoué. Réessayez dans un instant." };
  }

  await supabase.auth.signOut();

  // Des offres ont pu disparaître : le catalogue public doit être repurgé.
  revalidateTag(LISTINGS_TAG);
  redirect("/?compte=supprime");
}
