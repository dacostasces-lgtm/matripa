"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteUserVerificationFiles } from "@/lib/verification-storage";
import { LISTINGS_TAG } from "@/lib/listings";
import type { AuthFormState } from "@/lib/auth-form";

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
  const confirmation = String(formData.get("confirmation") ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/compte");

  if (confirmation !== (user.email ?? "").toLowerCase()) {
    return {
      status: "error",
      message: "Saisissez exactement l'adresse e-mail de votre compte pour confirmer.",
    };
  }

  // Une suspension en cours d'examen ne doit pas pouvoir être contournée en
  // supprimant son compte : la cascade ferait disparaître l'annonce signalée et
  // l'équipe n'aurait plus personne à bloquer. En cas d'erreur du contrôle, on
  // refuse (fail closed).
  const { data: underReview, error: moderationError } = await supabase.rpc(
    "account_has_open_moderation",
  );

  if (moderationError) {
    console.error("[account] moderation check failed", moderationError);
  }

  if (moderationError || underReview) {
    return {
      status: "error",
      message:
        "Votre compte fait l'objet d'un examen par l'équipe Matripa : la suppression n'est pas possible pour l'instant. Écrivez-nous pour connaître la suite donnée.",
    };
  }

  // `deleteUser` exige la clé service_role : c'est le seul endroit du parcours
  // utilisateur qui l'emprunte, et l'identité supprimée est strictement celle
  // de la session en cours.
  // La cascade SQL supprime les demandes de vérification, pas les fichiers du
  // bucket. On s'arrête plutôt que de laisser une pièce d'identité orpheline.
  if (!(await deleteUserVerificationFiles(user.id))) {
    return { status: "error", message: "La suppression a échoué. Réessayez dans un instant." };
  }

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
