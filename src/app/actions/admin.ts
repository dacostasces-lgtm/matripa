"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";
import {
  hasAllApprovalChecks,
  planVideoPurge,
  verificationErrorMessage,
  VERIFICATION_BUCKET,
  type VerificationFormState,
  type VideoReference,
} from "@/lib/verification";
import { deleteVerificationVideos, listVerificationVideos } from "@/lib/verification-storage";
import { isRejectionReason, isVerificationDecision } from "@/types/verification";

/**
 * Mise en avant VIP d'une annonce.
 *
 * Le badge « Certifié » n'est plus modifiable ici : il découle de la
 * vérification d'identité du compte (migration 0010).
 */
export async function setCertification(formData: FormData) {
  const listingId = formData.get("listing_id");
  const field = formData.get("field");
  const value = formData.get("value") === "true";

  if (typeof listingId !== "string" || field !== "is_vip") return;

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_listing_certification", {
    p_listing_id: listingId,
    p_is_verified: null,
    p_is_vip: value,
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

/**
 * Décision sur une vérification, puis suppression immédiate de la vidéo.
 *
 * La décision est écrite d'abord, en une transaction. Si la suppression du
 * fichier échoue ensuite, elle reste acquise : `video_path` n'est pas remis à
 * null et la vidéo apparaît dans la file de purge.
 */
async function decide(formData: FormData): Promise<VerificationFormState> {
  const requestId = formData.get("request_id");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  const note = formData.get("note");

  if (typeof requestId !== "string" || !requestId || !isVerificationDecision(decision)) {
    return { status: "error", message: "Décision invalide." };
  }
  if (decision === "approve" && !hasAllApprovalChecks(formData)) {
    return { status: "error", message: "Cochez les quatre contrôles avant d'approuver." };
  }

  const supabase = await createClient();

  const { data: videoPath, error } = await supabase.rpc("review_verification", {
    p_id: requestId,
    p_decision: decision,
    p_reason: decision === "reject" && isRejectionReason(reason) ? reason : null,
    p_note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
  });

  if (error) {
    console.error("[admin] verification review failed", error);
    revalidatePath("/admin");
    return { status: "error", message: verificationErrorMessage(error.message) };
  }

  if (videoPath && (await deleteVerificationVideos([videoPath]))) {
    const { error: clearError } = await supabase.rpc("clear_verification_video", { p_id: requestId });
    if (clearError) console.error("[admin] clearing video path failed", clearError);
  }

  revalidatePath("/admin");
  revalidateTag(LISTINGS_TAG);
  return { status: "success", message: null };
}

export async function reviewVerification(
  _prev: VerificationFormState,
  formData: FormData,
): Promise<VerificationFormState> {
  return decide(formData);
}

/** Révocation depuis la liste des comptes vérifiés (formulaire sans JavaScript). */
export async function revokeVerification(formData: FormData) {
  formData.set("decision", "revoke");
  await decide(formData);
}

/**
 * Constat de minorité sur un compte déjà vérifié (formulaire sans JavaScript).
 * La case de confirmation est revérifiée ici : l'attribut `required` du
 * navigateur ne protège rien.
 */
export async function blockMinorVerification(formData: FormData) {
  if (formData.get("confirm_minor") !== "on") return;
  formData.set("decision", "block_minor");
  await decide(formData);
}

/**
 * URL signée de 5 minutes, générée au clic : le lien ne figure jamais dans le
 * HTML et une page laissée ouverte n'expose rien. Le client de session suffit,
 * la policy `verifications_admin_read` autorisant la lecture à l'équipe.
 */
export async function getVerificationVideoUrl(requestId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;

  const { data } = await supabase
    .from("verification_requests")
    .select("video_path")
    .eq("id", requestId)
    .maybeSingle<{ video_path: string | null }>();

  if (!data?.video_path) return null;

  const { data: signed, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(data.video_path, 300);

  if (error) {
    console.error("[admin] signed url failed", error);
    return null;
  }
  return signed.signedUrl;
}

/** Supprime les vidéos jugées ou abandonnées que la décision n'a pas pu effacer. */
export async function purgeVerificationVideos(_formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return;

  const [{ data: refs }, files] = await Promise.all([
    supabase
      .from("verification_requests")
      .select("id, status, video_path")
      .not("video_path", "is", null)
      .returns<VideoReference[]>(),
    listVerificationVideos(),
  ]);

  const plan = planVideoPurge(files, refs ?? [], new Date());

  if (await deleteVerificationVideos(plan.paths)) {
    for (const id of plan.clearRequestIds) {
      const { error } = await supabase.rpc("clear_verification_video", { p_id: id });
      if (error) console.error("[admin] clearing video path failed", error);
    }
  }

  revalidatePath("/admin");
}
