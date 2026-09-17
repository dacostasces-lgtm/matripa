/**
 * Domaine du signalement d'annonces.
 *
 * Les slugs reprennent à l'identique les enums Postgres de la migration 0012 ;
 * les libellés sont centralisés ici, comme ceux des annonces dans `listing.ts`.
 * Les motifs urgents sont placés en tête : c'est l'ordre d'affichage du
 * formulaire.
 */

export const REPORT_REASONS = [
  {
    slug: "personne_mineure",
    label: "Personne mineure présumée",
    help: "Le profil semble concerner une personne de moins de 18 ans.",
    urgent: true,
  },
  {
    slug: "contrainte_exploitation",
    label: "Contrainte ou exploitation",
    help: "La personne semble agir sous la contrainte, être contrôlée ou exploitée par un tiers.",
    urgent: true,
  },
  {
    slug: "faux_profil",
    label: "Faux profil ou photos volées",
    help: "Les photos ou l'identité appartiennent à quelqu'un d'autre.",
    urgent: false,
  },
  {
    slug: "arnaque",
    label: "Arnaque",
    help: "Demande d'argent à l'avance, escroquerie ou tentative de fraude.",
    urgent: false,
  },
  {
    slug: "autre",
    label: "Autre",
    help: "Précisez le problème ci-dessous.",
    urgent: false,
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["slug"];

export type ReportStatus = "open" | "confirmed" | "dismissed";

export type ReportDecision = "dismiss" | "remove" | "block_minor";

export const reportReason = (slug: string) =>
  REPORT_REASONS.find((reason) => reason.slug === slug) ?? null;

export const isReportReason = (v: unknown): v is ReportReason =>
  typeof v === "string" && REPORT_REASONS.some((reason) => reason.slug === v);

const DECISIONS: readonly ReportDecision[] = ["dismiss", "remove", "block_minor"];

export const isReportDecision = (v: unknown): v is ReportDecision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);

export const isUrgentReason = (reason: ReportReason): boolean =>
  REPORT_REASONS.some((item) => item.slug === reason && item.urgent);
