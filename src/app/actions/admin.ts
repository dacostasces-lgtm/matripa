"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";

/**
 * Certification d'une annonce (badges « Vérifié » et VIP).
 *
 * Passe par `set_listing_certification`, fonction SECURITY DEFINER qui
 * contrôle l'appartenance à `admins`. Les colonnes concernées sont hors des
 * GRANT du rôle `authenticated` : c'est le seul chemin d'écriture, y compris
 * pour un administrateur.
 */
export async function setCertification(formData: FormData) {
  const listingId = formData.get("listing_id");
  const field = formData.get("field");
  const value = formData.get("value") === "true";

  if (typeof listingId !== "string" || (field !== "is_verified" && field !== "is_vip")) {
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_listing_certification", {
    p_listing_id: listingId,
    p_is_verified: field === "is_verified" ? value : null,
    p_is_vip: field === "is_vip" ? value : null,
  });

  if (error) console.error("[admin] certification failed", error);

  revalidatePath("/admin");
  revalidateTag(LISTINGS_TAG);
}

/**
 * Retrait d'un avis par la modération.
 *
 * Passe par `moderate_review`, qui vérifie l'appartenance à `admins`, journalise
 * l'opération et laisse le trigger recalculer la note de l'annonce.
 */
export async function removeReview(formData: FormData) {
  const reviewId = formData.get("review_id");
  const reason = formData.get("reason");

  if (typeof reviewId !== "string" || !reviewId) return;

  const supabase = await createClient();

  const { error } = await supabase.rpc("moderate_review", {
    p_review_id: reviewId,
    p_reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  });

  if (error) console.error("[admin] review moderation failed", error);

  revalidatePath("/admin");
  revalidateTag(LISTINGS_TAG);
}
