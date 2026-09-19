import { describe, expect, it } from "vitest";

import { toWhatsAppNumber, whatsAppForStorage, whatsAppLink } from "@/lib/whatsapp";

describe("toWhatsAppNumber", () => {
  it("garde un numéro international en retirant espaces et +", () => {
    expect(toWhatsAppNumber("+242 06 912 34 56")).toBe("242069123456");
  });

  it("accepte le préfixe 00 à la place du +", () => {
    expect(toWhatsAppNumber("00242 05 123 45 67")).toBe("242051234567");
  });

  it("complète un numéro local congolais (9 chiffres, commence par 0) avec l'indicatif 242", () => {
    expect(toWhatsAppNumber("06 912 34 56")).toBe("242069123456");
    expect(toWhatsAppNumber("069123456")).toBe("242069123456");
  });

  it("refuse l'absence de numéro : aucun repli vers un numéro fictif", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("   ")).toBeNull();
  });

  it("refuse un numéro trop court ou trop long", () => {
    expect(toWhatsAppNumber("12345")).toBeNull();
    expect(toWhatsAppNumber("+1234567890123456")).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("construit un lien wa.me avec le message encodé", () => {
    const link = whatsAppLink("+242 06 912 34 56", 'Bonjour, "Villa Ngoma" à Brazzaville ? 100 % & oui');
    expect(link).toBe(
      "https://wa.me/242069123456?text=" +
        encodeURIComponent('Bonjour, "Villa Ngoma" à Brazzaville ? 100 % & oui'),
    );
    // Les caractères réservés d'une URL ne doivent jamais apparaître en clair dans le texte.
    const text = new URL(link!).searchParams.get("text");
    expect(text).toBe('Bonjour, "Villa Ngoma" à Brazzaville ? 100 % & oui');
  });

  it("ne produit aucun lien quand l'annonce n'a pas de numéro", () => {
    expect(whatsAppLink(null, "Bonjour")).toBeNull();
  });
});

describe("whatsAppForStorage (saisie du partenaire)", () => {
  it("laisse le champ vide si rien n'est saisi", () => {
    expect(whatsAppForStorage("")).toEqual({ ok: true, value: null });
    expect(whatsAppForStorage("   ")).toEqual({ ok: true, value: null });
  });

  it("enregistre au format international accepté par la base (+ et chiffres seuls)", () => {
    expect(whatsAppForStorage("06 912 34 56")).toEqual({ ok: true, value: "+242069123456" });
    expect(whatsAppForStorage("+242 05-123-45-67")).toEqual({ ok: true, value: "+242051234567" });
  });

  it("signale une saisie qui n'est pas un numéro exploitable", () => {
    expect(whatsAppForStorage("12 34")).toEqual({ ok: false });
    expect(whatsAppForStorage("pas un numéro")).toEqual({ ok: false });
  });
});
