import type { ReportReason } from "@/types/reports";

/**
 * Logique pure du signalement, partagée entre le navigateur, les Server
 * Actions et les tests. Les limites reprennent celles de la migration 0012.
 */

export const MAX_REPORT_DETAILS = 1000;
export const MIN_OTHER_DETAILS = 10;
export const MAX_RESOLUTION_NOTE = 300;

/** Message d'erreur à afficher, ou `null` si les précisions sont acceptables. */
export function checkReportDetails(reason: ReportReason, details: string): string | null {
  const value = details.trim();

  if (value.length > MAX_REPORT_DETAILS) {
    return "Les précisions ne doivent pas dépasser 1 000 caractères.";
  }
  if (reason === "autre" && value.length < MIN_OTHER_DETAILS) {
    return "Précisez le problème en 10 caractères au moins.";
  }
  return null;
}

const ERROR_MESSAGES = {
  already_reported: "Vous avez déjà signalé ce profil. Il est en cours d'examen.",
  rate_limited: "Trop de signalements en peu de temps. Réessayez plus tard.",
  listing_unavailable: "Ce profil n'est plus disponible.",
  own_listing: "Vous ne pouvez pas signaler votre propre profil.",
  details_required: "Précisez le problème en 10 caractères au moins.",
  details_too_long: "Les précisions ne doivent pas dépasser 1 000 caractères.",
  invalid_reason: "Choisissez un motif.",
  note_required: "Indiquez une note pour retirer le profil.",
  already_reviewed: "Ce signalement a déjà été traité.",
  invalid_decision: "Décision invalide.",
  not_found: "Signalement introuvable. Rechargez la page.",
  forbidden: "Action non autorisée.",
} as const;

export type ReportErrorCode = keyof typeof ERROR_MESSAGES;

const FALLBACK_MESSAGE = "Une erreur est survenue. Réessayez dans un instant.";

/** PostgREST renvoie le texte du `raise exception` dans `error.message`. */
export function reportErrorCode(message: string | null | undefined): ReportErrorCode | null {
  if (!message) return null;
  const codes = Object.keys(ERROR_MESSAGES) as ReportErrorCode[];
  return codes.find((code) => message.includes(code)) ?? null;
}

export function reportErrorMessage(message: string | null | undefined): string {
  const code = reportErrorCode(message);
  return code ? ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

/** Bandeau du tableau de bord : ni motif ni signaleur ne sont révélés. */
export function suspensionMessage(count: number): string {
  if (count === 1) {
    return "Un de vos profils est suspendu le temps d'un examen par l'équipe Matripa.";
  }
  return `${count} de vos profils sont suspendus le temps d'un examen par l'équipe Matripa.`;
}

/** `REPORT_ALERT_EMAILS` : adresses séparées par des virgules. */
export function parseAlertRecipients(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
}

/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export type ReportFormState = {
  status: "idle" | "success" | "error";
  urgent: boolean;
  message: string | null;
};

export const INITIAL_REPORT_STATE: ReportFormState = { status: "idle", urgent: false, message: null };

export type ReviewReportState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const INITIAL_REVIEW_REPORT_STATE: ReviewReportState = { status: "idle", message: null };
