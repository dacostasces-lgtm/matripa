/**
 * Domaine de la vérification d'identité.
 *
 * Les slugs reprennent à l'identique les enums Postgres de la migration 0011 ;
 * les libellés sont centralisés ici, comme ceux des annonces dans `listing.ts`.
 */

export type VerificationStatus = "awaiting_video" | "pending" | "approved" | "rejected" | "revoked";

export type VerificationDecision = "approve" | "reject" | "block_minor" | "revoke";

export const VERIFICATION_DOCUMENTS = [
  { slug: "cni", label: "Carte nationale d'identité" },
  { slug: "passeport", label: "Passeport" },
  { slug: "carte_consulaire", label: "Carte consulaire" },
] as const;

export type VerificationDocument = (typeof VERIFICATION_DOCUMENTS)[number]["slug"];

export const REJECTION_REASONS = [
  {
    slug: "video_illisible",
    label: "Vidéo illisible",
    partner: "La vidéo était floue, trop sombre ou coupée.",
  },
  {
    slug: "piece_non_visible",
    label: "Pièce non visible",
    partner: "La pièce d'identité ou sa date de naissance n'était pas lisible.",
  },
  {
    slug: "code_absent_ou_faux",
    label: "Code absent ou faux",
    partner: "Le code affiché n'a pas été prononcé distinctement.",
  },
  {
    slug: "personne_differente",
    label: "Personne différente des photos",
    partner: "La personne filmée ne correspond pas aux photos de vos profils.",
  },
  {
    slug: "personne_mineure",
    label: "Personne mineure",
    partner: "",
  },
] as const;

export type VerificationRejection = (typeof REJECTION_REASONS)[number]["slug"];

/**
 * Motifs proposés au rejet simple. Le constat de minorité passe par une
 * décision distincte (`block_minor`), qui archive et bloque le compte.
 */
export const ADMIN_REJECT_OPTIONS = REJECTION_REASONS.filter(
  (reason) => reason.slug !== "personne_mineure",
);

export const documentLabel = (slug: string): string =>
  VERIFICATION_DOCUMENTS.find((d) => d.slug === slug)?.label ?? slug;

export const rejectionReason = (slug: string) =>
  REJECTION_REASONS.find((r) => r.slug === slug) ?? null;

export const isVerificationDocument = (v: unknown): v is VerificationDocument =>
  typeof v === "string" && VERIFICATION_DOCUMENTS.some((d) => d.slug === v);

export const isRejectionReason = (v: unknown): v is VerificationRejection =>
  typeof v === "string" && REJECTION_REASONS.some((r) => r.slug === v);

const DECISIONS: readonly VerificationDecision[] = ["approve", "reject", "block_minor", "revoke"];

export const isVerificationDecision = (v: unknown): v is VerificationDecision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);
