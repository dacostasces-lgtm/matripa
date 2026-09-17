import type {
  VerificationRejection,
  VerificationStatus,
} from "@/types/verification";

/**
 * Logique pure de la vérification d'identité, partagée entre le navigateur,
 * les Server Actions et les tests. Aucun accès réseau ici.
 */

export const VERIFICATION_BUCKET = "verifications";

/** Un iPhone filme en 1080p par défaut : environ 30 Mo pour 15 s. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** 15 s demandées, avec une marge pour qui s'arrête un peu tard. */
export const MAX_VIDEO_SECONDS = 20;

export const ORPHAN_VIDEO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Doit rester aligné sur `allowed_mime_types` du bucket (migration 0011). */
const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
};

export type VideoCheck = { ok: true; extension: string } | { ok: false; message: string };

/**
 * Contrôle avant envoi : évite de consommer des minutes de 3G pour un fichier
 * que le bucket refuserait. Une durée illisible (certains Android ne
 * l'exposent pas) n'est pas bloquante ; la limite de taille du bucket reste.
 */
export function checkVideo(
  file: { type: string; size: number },
  durationSeconds: number | null,
): VideoCheck {
  const extension = Object.hasOwn(VIDEO_EXTENSIONS, file.type) ? VIDEO_EXTENSIONS[file.type] : null;

  if (!extension) {
    return {
      ok: false,
      message: "Format non pris en charge. Filmez avec l'appareil photo du téléphone (MP4, MOV, WebM ou 3GP).",
    };
  }
  if (file.size === 0) {
    return { ok: false, message: "La vidéo est vide. Filmez-la à nouveau." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, message: "La vidéo dépasse 50 Mo. Filmez une séquence plus courte : 15 secondes suffisent." };
  }
  if (durationSeconds !== null && durationSeconds > MAX_VIDEO_SECONDS) {
    return { ok: false, message: "La vidéo dure plus de 20 secondes. 15 secondes suffisent." };
  }
  return { ok: true, extension };
}

/** Convention imposée par la policy Storage et revérifiée par `submit_verification`. */
export const verificationVideoPath = (userId: string, requestId: string, extension: string): string =>
  `${userId}/${requestId}.${extension}`;

const ERROR_MESSAGES = {
  verification_required: "Vérifiez votre identité avant de publier un profil.",
  code_expired: "Ce code a expiré. Demandez-en un nouveau et filmez à nouveau la vidéo.",
  video_missing: "La vidéo n'a pas été reçue. Relancez l'envoi.",
  invalid_path: "Envoi invalide. Rechargez la page et recommencez.",
  not_found: "Demande introuvable. Rechargez la page.",
  blocked: "La vérification n'est pas disponible pour ce compte. Contactez le support.",
  already_verified: "Votre identité est déjà vérifiée.",
  already_pending: "Une vérification est déjà en cours d'examen.",
  already_reviewed: "Cette demande a déjà été traitée.",
  reason_required: "Indiquez un motif.",
  invalid_reason: "Motif invalide pour cette décision.",
  invalid_decision: "Décision invalide.",
  forbidden: "Action non autorisée.",
} as const;

export type VerificationErrorCode = keyof typeof ERROR_MESSAGES;

const FALLBACK_MESSAGE = "Une erreur est survenue. Réessayez dans un instant.";

/** PostgREST renvoie le texte du `raise exception` dans `error.message`. */
export function verificationErrorCode(message: string | null | undefined): VerificationErrorCode | null {
  if (!message) return null;
  const codes = Object.keys(ERROR_MESSAGES) as VerificationErrorCode[];
  return codes.find((code) => message.includes(code)) ?? null;
}

export function verificationErrorMessage(message: string | null | undefined): string {
  const code = verificationErrorCode(message);
  return code ? ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

export type VerificationView =
  | "start"
  | "upload"
  | "expired"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked"
  | "blocked";

export type LatestVerification = {
  status: VerificationStatus;
  code_expires_at: string;
  rejection_reason: VerificationRejection | null;
};

export function verificationView(latest: LatestVerification | null, now: Date): VerificationView {
  if (!latest) return "start";

  switch (latest.status) {
    case "awaiting_video":
      return new Date(latest.code_expires_at) < now ? "expired" : "upload";
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "revoked":
      return "revoked";
    case "rejected":
      // `block_minor` enregistre un rejet motivé par la minorité et bloque le compte.
      return latest.rejection_reason === "personne_mineure" ? "blocked" : "rejected";
  }
}

type ListingVisibility = { status: string; is_verified: boolean; verification_grace_until: string | null };

/**
 * Annonce publiée que le catalogue ne montre pas : même règle que la policy
 * `listings_public_read` (`is_verified or verification_grace_until > now()`).
 */
export function isListingHidden(listing: ListingVisibility, now: Date): boolean {
  const inGrace =
    listing.verification_grace_until !== null && new Date(listing.verification_grace_until) > now;
  return listing.status === "published" && !listing.is_verified && !inGrace;
}

/** Plus proche échéance de masquage parmi les annonces encore en délai de grâce. */
export function graceSummary(
  listings: ListingVisibility[],
  now: Date,
): { deadline: Date; count: number } | null {
  const deadlines = listings
    .filter((l) => l.status === "published" && !l.is_verified && l.verification_grace_until)
    .map((l) => new Date(l.verification_grace_until!))
    .filter((d) => d > now)
    .sort((a, b) => a.getTime() - b.getTime());

  return deadlines.length > 0 ? { deadline: deadlines[0], count: deadlines.length } : null;
}

export const APPROVAL_CHECKS = [
  { name: "check_face", label: "Le visage correspond aux photos des annonces" },
  { name: "check_document", label: "La pièce est lisible et paraît authentique" },
  { name: "check_age", label: "La date de naissance indique 18 ans ou plus" },
  { name: "check_code", label: "Le code prononcé est le bon" },
] as const;

/** Revérifié côté serveur : une case désactivée dans l'interface ne protège rien. */
export const hasAllApprovalChecks = (formData: FormData): boolean =>
  APPROVAL_CHECKS.every(({ name }) => formData.get(name) === "on");

export type StoredVideo = { path: string; createdAt: string };

export type VideoReference = { id: string; status: VerificationStatus; video_path: string | null };

/** Demandes jugées : leur vidéo n'a plus à être conservée. */
export const FINAL_STATUSES: readonly VerificationStatus[] = ["approved", "rejected", "revoked"];

/**
 * Lignes d'une lecture PostgREST faite avec `{ count: "exact" }`, ou null si
 * la lecture a échoué ou a été tronquée (`max_rows`, 1 000 lignes par défaut).
 * Une liste partielle ne doit jamais passer pour complète : la purge
 * traiterait les vidéos non listées comme abandonnées.
 */
export function completeRows<T>(result: {
  data: T[] | null;
  error: unknown;
  count: number | null;
}): T[] | null {
  if (result.error || result.count === null) return null;
  const rows = result.data ?? [];
  return result.count > rows.length ? null : rows;
}

/**
 * Vidéos à supprimer et demandes dont `video_path` doit être remis à null.
 *
 * — en examen (`pending`) : conservée ;
 * — déjà jugée : supprimée, quel que soit son âge ;
 * — sans demande en examen (dépôt abandonné, demande remplacée) : supprimée
 *   après 24 h, pour ne pas couper un envoi en cours de finalisation.
 */
export function planVideoPurge(
  files: StoredVideo[],
  refs: VideoReference[],
  now: Date,
): { paths: string[]; clearRequestIds: string[] } {
  const byPath = new Map(
    refs.filter((r) => r.video_path).map((r) => [r.video_path as string, r]),
  );

  const paths = files
    .filter((file) => {
      const ref = byPath.get(file.path);
      if (ref?.status === "pending") return false;
      if (ref && FINAL_STATUSES.includes(ref.status)) return true;
      return now.getTime() - new Date(file.createdAt).getTime() > ORPHAN_VIDEO_MAX_AGE_MS;
    })
    .map((file) => file.path);

  const clearRequestIds = refs
    .filter((r) => r.video_path && FINAL_STATUSES.includes(r.status))
    .map((r) => r.id);

  return { paths, clearRequestIds };
}

/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export type VerificationFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const INITIAL_VERIFICATION_STATE: VerificationFormState = { status: "idle", message: null };
