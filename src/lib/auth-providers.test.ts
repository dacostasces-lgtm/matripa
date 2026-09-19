import { describe, expect, it } from "vitest";

import {
  accountIdentifier,
  enabledAuthProviders,
  matchesAccountIdentifier,
  normalizePhone,
} from "@/lib/auth-providers";

describe("enabledAuthProviders", () => {
  it("n'affiche aucun fournisseur sans configuration", () => {
    expect(enabledAuthProviders({})).toEqual([]);
  });

  it("n'active un fournisseur que sur la valeur exacte « 1 »", () => {
    expect(
      enabledAuthProviders({
        NEXT_PUBLIC_AUTH_GOOGLE: "1",
        NEXT_PUBLIC_AUTH_FACEBOOK: "true",
        NEXT_PUBLIC_AUTH_WHATSAPP: "0",
      }),
    ).toEqual(["google"]);
  });

  it("garde l'ordre Google, Facebook, WhatsApp", () => {
    expect(
      enabledAuthProviders({
        NEXT_PUBLIC_AUTH_WHATSAPP: "1",
        NEXT_PUBLIC_AUTH_GOOGLE: "1",
        NEXT_PUBLIC_AUTH_FACEBOOK: "1",
      }),
    ).toEqual(["google", "facebook", "whatsapp"]);
  });
});

describe("normalizePhone", () => {
  it("complète un numéro congolais local avec l'indicatif +242", () => {
    expect(normalizePhone("06 123 45 67")).toBe("+242061234567");
  });

  it("accepte l'indicatif avec ou sans « + » et les séparateurs", () => {
    expect(normalizePhone("+242 06-123-45-67")).toBe("+242061234567");
    expect(normalizePhone("242061234567")).toBe("+242061234567");
    expect(normalizePhone("00242 06 123 45 67")).toBe("+242061234567");
  });

  it("conserve un numéro international complet", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("refuse ce qui n'est pas un numéro plausible", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("pas-un-numero")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("identifiant de confirmation du compte", () => {
  it("utilise l'e-mail quand le compte en a un", () => {
    expect(accountIdentifier({ email: "Awa@Exemple.cg", phone: "242061234567" })).toEqual({
      kind: "email",
      value: "Awa@Exemple.cg",
    });
  });

  it("utilise le téléphone pour un compte créé par WhatsApp", () => {
    expect(accountIdentifier({ email: "", phone: "242061234567" })).toEqual({
      kind: "phone",
      value: "+242061234567",
    });
    expect(accountIdentifier({ email: null, phone: "242061234567" })).toEqual({
      kind: "phone",
      value: "+242061234567",
    });
  });

  it("renvoie null sans e-mail ni téléphone", () => {
    expect(accountIdentifier({ email: null, phone: null })).toBeNull();
  });

  it("compare l'e-mail sans tenir compte de la casse ni des espaces", () => {
    const id = { kind: "email" as const, value: "Awa@Exemple.cg" };
    expect(matchesAccountIdentifier(id, "  awa@exemple.CG ")).toBe(true);
    expect(matchesAccountIdentifier(id, "autre@exemple.cg")).toBe(false);
  });

  it("compare le téléphone quel que soit son format de saisie", () => {
    const id = { kind: "phone" as const, value: "+242061234567" };
    expect(matchesAccountIdentifier(id, "06 123 45 67")).toBe(true);
    expect(matchesAccountIdentifier(id, "+242 06 123 45 67")).toBe(true);
    expect(matchesAccountIdentifier(id, "06 123 45 68")).toBe(false);
    expect(matchesAccountIdentifier(id, "")).toBe(false);
  });

  it("ne confirme jamais sans identifiant", () => {
    expect(matchesAccountIdentifier(null, "")).toBe(false);
  });
});
