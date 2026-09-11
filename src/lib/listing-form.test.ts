import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/listing-form";

describe("slugify", () => {
  it("retire les accents plutôt que de les supprimer", () => {
    expect(slugify("Résidence Océane — Côte Sauvage")).toBe("residence-oceane-cote-sauvage");
  });

  it("remplace ponctuation et espaces par un tiret unique", () => {
    expect(slugify("Villa Ngoma — piscine   privée !")).toBe("villa-ngoma-piscine-privee");
  });

  it("n'ouvre ni ne termine sur un tiret", () => {
    expect(slugify("  ---Studio---  ")).toBe("studio");
  });

  it("borne la longueur", () => {
    expect(slugify("a".repeat(200))).toHaveLength(60);
  });

  it("ne laisse passer que [a-z0-9-]", () => {
    expect(slugify("Chauffeur privé / véhicule 4×4 (luxe)")).toMatch(/^[a-z0-9-]+$/);
  });

  it("renvoie une chaîne vide sur une saisie sans caractère exploitable", () => {
    // L'appelant doit prévoir ce cas : le slug final est suffixé côté serveur.
    expect(slugify("!!!")).toBe("");
  });
});
