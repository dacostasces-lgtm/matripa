/**
 * Liens WhatsApp (wa.me).
 *
 * Une seule règle, qui ne se négocie pas : sans numéro renseigné sur
 * l'annonce, pas de lien. Un numéro « par défaut » enverrait le message d'un
 * client — nom de l'annonce compris — à un inconnu.
 */

/** Indicatif du Congo-Brazzaville. */
const CONGO_PREFIX = "242";

/**
 * Normalise un numéro au format attendu par wa.me : chiffres seuls, indicatif
 * pays inclus, sans `+` ni `00`. Les numéros locaux congolais (9 chiffres
 * commençant par 0, ex. « 06 912 34 56 ») reçoivent l'indicatif 242 : le 0
 * fait partie du numéro national au Congo et se conserve.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("0")) digits = CONGO_PREFIX + digits;

  // E.164 : 15 chiffres au plus ; en dessous de 10, ce n'est pas un numéro international.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Lien wa.me avec message pré-rempli, ou `null` si le numéro est absent ou invalide. */
export function whatsAppLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

/**
 * Numéro saisi par un partenaire, prêt à enregistrer : `+` puis chiffres,
 * seul format accepté par la contrainte de `listings.whatsapp_phone`.
 * Champ vide → `null` (le numéro est facultatif) ; saisie inexploitable → refus.
 */
export function whatsAppForStorage(raw: string): { ok: true; value: string | null } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: null };
  const number = toWhatsAppNumber(raw);
  return number ? { ok: true, value: `+${number}` } : { ok: false };
}
