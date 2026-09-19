/**
 * Connexion par fournisseurs externes (Google, Facebook, WhatsApp).
 *
 * Logique pure, partagée entre le serveur, le navigateur et les tests.
 *
 * Chaque fournisseur ne s'affiche que s'il est explicitement activé
 * (`NEXT_PUBLIC_AUTH_<FOURNISSEUR>=1`) : un bouton dont la configuration
 * Supabase n'existe pas encore mènerait à une page d'erreur, ce qui est pire
 * que pas de bouton du tout.
 */

export type AuthProvider = "google" | "facebook" | "whatsapp";

const PROVIDERS: readonly { id: AuthProvider; flag: string }[] = [
  { id: "google", flag: "NEXT_PUBLIC_AUTH_GOOGLE" },
  { id: "facebook", flag: "NEXT_PUBLIC_AUTH_FACEBOOK" },
  { id: "whatsapp", flag: "NEXT_PUBLIC_AUTH_WHATSAPP" },
];

export function enabledAuthProviders(env: Record<string, string | undefined>): AuthProvider[] {
  return PROVIDERS.filter(({ flag }) => env[flag] === "1").map(({ id }) => id);
}

/** Indicatif du Congo-Brazzaville, appliqué aux numéros saisis sans indicatif. */
const CONGO_PREFIX = "242";

/**
 * Numéro au format E.164 (`+242061234567`), ou `null` s'il n'est pas plausible.
 *
 * Un numéro local congolais (9 chiffres commençant par 0, ex. « 06 123 45 67 »)
 * reçoit l'indicatif +242 ; « 00 » en tête vaut « + ».
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length === 9 && digits.startsWith("0")) {
    digits = CONGO_PREFIX + digits;
  }

  // E.164 : 15 chiffres au plus ; en dessous de 8, ce n'est pas un numéro.
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export type AccountIdentifier = { kind: "email" | "phone"; value: string };

/**
 * Identifiant que l'utilisateur doit retaper pour confirmer la suppression de
 * son compte : l'e-mail s'il en a un, sinon le téléphone (compte créé par
 * WhatsApp). Sans cette alternative, un compte sans e-mail ne pourrait jamais
 * être supprimé.
 */
export function accountIdentifier(user: {
  email?: string | null;
  phone?: string | null;
}): AccountIdentifier | null {
  if (user.email) return { kind: "email", value: user.email };

  // Supabase stocke le téléphone sans « + » : on le remet au format affiché.
  const phone = user.phone ? normalizePhone(`+${user.phone.replace(/^\+/, "")}`) : null;
  return phone ? { kind: "phone", value: phone } : null;
}

export function matchesAccountIdentifier(identifier: AccountIdentifier | null, typed: string): boolean {
  if (!identifier) return false;

  if (identifier.kind === "email") {
    return typed.trim().toLowerCase() === identifier.value.toLowerCase();
  }
  return normalizePhone(typed) === identifier.value;
}
