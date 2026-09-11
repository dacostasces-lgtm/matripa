"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";
import type { ReviewFormState } from "@/lib/review-form";

/**
 * Dépôt d'un avis.
 *
 * Toute l'éligibilité est vérifiée en base par `submit_review` : la demande
 * doit appartenir à l'appelant et être `confirmed`. On ne la redouble pas ici
 * — un contrôle applicatif qui diverge de la règle SQL est pire que pas de
 * contrôle du tout.
 */
export async function submitReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const requestId = String(formData.get("request_id") ?? "");
  const rating = Number.parseInt(String(formData.get("rating") ?? ""), 10);
  const comment = String(formData.get("comment") ?? "").trim();

  if (!requestId) {
    return { status: "error", message: "Demande introuvable." };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: "error", message: "Choisissez une note de 1 à 5 étoiles." };
  }
  if (comment.length > 1000) {
    return { status: "error", message: "Commentaire trop long (1000 caractères maximum)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/mes-demandes");

  const { error } = await supabase.rpc("submit_review", {
    p_request_id: requestId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error) {
    console.error("[reviews] submit failed", error);

    if (error.message.includes("already_reviewed")) {
      return { status: "error", message: "Vous avez déjà déposé un avis sur cette prestation." };
    }
    if (error.message.includes("not_eligible")) {
      return {
        status: "error",
        message: "Seule une prestation confirmée par le partenaire peut être notée.",
      };
    }
    return { status: "error", message: "L'envoi a échoué. Réessayez dans un instant." };
  }

  // La note portée par l'annonce vient d'être recalculée par le trigger :
  // le fil et la fiche publique doivent être repurgés.
  revalidateTag(LISTINGS_TAG);
  revalidatePath("/mes-demandes");

  return { status: "success", message: "Merci, votre avis est publié." };
}
