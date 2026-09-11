/**
 * Domaine pawaPay — parties pures, sans dépendance serveur.
 *
 * Séparées du client HTTP pour deux raisons : elles sont testables sans
 * réseau, et le formulaire client peut valider un numéro avec exactement la
 * même fonction que le serveur, ce qui évite deux règles divergentes.
 *
 * Deux opérateurs couvrent le Congo, en XAF et sans décimales : les montants
 * transitent donc en entier, sans conversion depuis `price_xaf`.
 *
 * Référence : https://docs.pawapay.io/v2/docs/deposits
 */

export const PAWAPAY_PROVIDERS = {
  MTN_MOMO_COG: { label: "MTN MoMo", prefixes: ["05", "06"] },
  AIRTEL_COG: { label: "Airtel Money", prefixes: ["04", "05"] },
} as const;

export type PawaPayProvider = keyof typeof PAWAPAY_PROVIDERS;

export const isPawaPayProvider = (value: unknown): value is PawaPayProvider =>
  typeof value === "string" && value in PAWAPAY_PROVIDERS;

/** Statuts renvoyés par pawaPay, ramenés à notre enum `payment_status`. */
export type PawaPayStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "DUPLICATE_IGNORED"
  | "COMPLETED"
  | "FAILED"
  | "PROCESSING"
  | "IN_RECONCILIATION";

export type LocalStatus = "pending" | "processing" | "completed" | "failed";

/**
 * `IN_RECONCILIATION` signifie que pawaPay ne sait pas encore trancher. On le
 * traite comme « en cours » et non comme un échec : marquer échoué un paiement
 * peut-être abouti conduirait à redemander de l'argent au client.
 */
export function toLocalStatus(status: PawaPayStatus): LocalStatus {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "FAILED":
      return "failed";
    case "ACCEPTED":
    case "PROCESSING":
    case "IN_RECONCILIATION":
    case "DUPLICATE_IGNORED":
      return "processing";
  }
}

/**
 * Normalise un numéro congolais au format MSISDN attendu (indicatif 242, sans
 * `+` ni séparateurs).
 */
export function toMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const national = digits.startsWith("242") ? digits.slice(3) : digits;

  // Les numéros mobiles congolais comptent 9 chiffres.
  if (national.length !== 9) return null;
  return `242${national}`;
}

