"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  verificationErrorCode,
  verificationErrorMessage,
  type VerificationFormState,
} from "@/lib/verification";
import { isVerificationDocument } from "@/types/verification";

/**
 * Émet un code de défi. Le code est généré en base : un code choisi par le
 * client permettrait de réutiliser une vidéo tournée à l'avance.
 */
export async function startVerification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire/verification");

  const { error } = await supabase.rpc("start_verification");

  if (error) {
    console.error("[verification] start failed", error);
    redirect(`/partenaire/verification?erreur=${verificationErrorCode(error.message) ?? "inconnue"}`);
  }

  revalidatePath("/partenaire/verification");
  redirect("/partenaire/verification");
}

/**
 * Soumission après dépôt du fichier. Le chemin est revérifié ici puis par
 * `submit_verification`, qui contrôle aussi l'existence de l'objet : un
 * client ne peut pas soumettre une vidéo qu'il n'a pas déposée.
 */
export async function submitVerification(input: {
  requestId: string;
  documentType: string;
  videoPath: string;
}): Promise<VerificationFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };

  if (!isVerificationDocument(input.documentType)) {
    return { status: "error", message: "Choisissez le type de pièce d'identité." };
  }
  if (!input.videoPath.startsWith(`${user.id}/${input.requestId}.`)) {
    return { status: "error", message: verificationErrorMessage("invalid_path") };
  }

  const { error } = await supabase.rpc("submit_verification", {
    p_id: input.requestId,
    p_document: input.documentType,
    p_video_path: input.videoPath,
  });

  if (error) {
    console.error("[verification] submit failed", error);
    return { status: "error", message: verificationErrorMessage(error.message) };
  }

  revalidatePath("/partenaire");
  revalidatePath("/partenaire/verification");
  return { status: "success", message: null };
}
