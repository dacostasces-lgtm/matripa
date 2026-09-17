"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";

import { LISTINGS_TAG } from "@/lib/listings";
import { sendReportAlert } from "@/lib/notifications";
import {
  checkReportDetails,
  MAX_RESOLUTION_NOTE,
  parseAlertRecipients,
  reportErrorMessage,
  type ReportFormState,
  type ReviewReportState,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";
import { isReportDecision, isReportReason, reportReason } from "@/types/reports";

/**
 * Signalement d'une annonce par un compte connecté.
 *
 * Toutes les règles (visibilité, propre annonce, doublon, limite horaire,
 * suspension immédiate des motifs urgents) sont appliquées par
 * `submit_report` ; les contrôles ci-dessous ne servent qu'à répondre vite.
 */
export async function submitReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const listingId = formData.get("listing_id");
  const slug = formData.get("slug");
  const reason = formData.get("reason");
  const rawDetails = formData.get("details");
  const details = typeof rawDetails === "string" ? rawDetails.trim() : "";

  if (typeof listingId !== "string" || !listingId || typeof slug !== "string" || !slug) {
    return { status: "error", urgent: false, message: "Formulaire invalide. Rechargez la page." };
  }
  if (!isReportReason(reason)) {
    return { status: "error", urgent: false, message: reportErrorMessage("invalid_reason") };
  }

  const detailsError = checkReportDetails(reason, details);
  if (detailsError) return { status: "error", urgent: false, message: detailsError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/connexion?suivant=/signaler/${encodeURIComponent(slug)}`);

  const { data, error } = await supabase.rpc("submit_report", {
    p_listing_id: listingId,
    p_reason: reason,
    p_details: details || null,
  });

  if (error) {
    console.error("[reports] submit failed", error);
    return { status: "error", urgent: false, message: reportErrorMessage(error.message) };
  }

  const row = data?.[0];
  const urgent = row?.is_urgent === true;

  if (urgent && row) {
    // Le profil vient d'être suspendu : le catalogue mis en cache ne doit pas
    // continuer à l'afficher pendant cinq minutes.
    revalidateTag(LISTINGS_TAG);
    revalidatePath(`/annonces/${slug}`);

    // Capture des valeurs avant d'entrer dans after()
    const listingTitle = row.listing_title;
    const city = cityLabel(row.listing_city);
    const reasonLabel = reportReason(reason)?.label ?? reason;
    const reportedAt = new Date().toISOString();
    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/admin`;

    // L'alerte e-mail s'envoie après la réponse : le signaleur ne doit pas attendre
    // Resend. after() garantit l'exécution une fois la réponse envoyée, contrairement
    // à une Promise non attendue qui peut ne pas s'exécuter sur serverless.
    after(async () => {
      const recipients = parseAlertRecipients(process.env.REPORT_ALERT_EMAILS);
      if (recipients.length === 0) {
        console.warn("[reports] REPORT_ALERT_EMAILS absent — alerte non envoyée");
      } else {
        await sendReportAlert(recipients, {
          listingTitle,
          city,
          reasonLabel,
          reportedAt,
          adminUrl,
        });
      }
    });
  }

  // La confirmation vit sur sa propre route : un signalement urgent suspend
  // le profil immédiatement, ce qui rendrait `/signaler/[slug]` lui-même
  // inaccessible (404 RLS) au rafraîchissement automatique de route que
  // Next.js déclenche après toute Server Action. `redirect` doit être appelé
  // hors de tout try/catch — il agit en lançant une exception de contrôle de
  // flux — et seulement après l'enregistrement de `after(...)` ci-dessus.
  redirect(`/signaler/merci${urgent ? "?urgent=1" : ""}`);
}

/**
 * Décision de l'équipe sur un signalement. `review_report` vérifie
 * l'appartenance à `admins` : cette action est un point d'entrée public et
 * ne fait confiance à aucun champ du formulaire.
 */
export async function reviewReport(
  _prev: ReviewReportState,
  formData: FormData,
): Promise<ReviewReportState> {
  const reportId = formData.get("report_id");
  const decision = formData.get("decision");
  const note = formData.get("note");

  if (typeof reportId !== "string" || !reportId || !isReportDecision(decision)) {
    return { status: "error", message: reportErrorMessage("invalid_decision") };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("review_report", {
    p_report_id: reportId,
    p_decision: decision,
    p_note: typeof note === "string" && note.trim() ? note.trim().slice(0, MAX_RESOLUTION_NOTE) : null,
  });

  if (error) {
    console.error("[reports] review failed", error);
    revalidatePath("/admin");
    return { status: "error", message: reportErrorMessage(error.message) };
  }

  revalidatePath("/admin");
  revalidatePath("/partenaire");
  revalidateTag(LISTINGS_TAG);
  return { status: "success", message: null };
}
