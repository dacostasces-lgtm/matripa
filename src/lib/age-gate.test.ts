import { describe, expect, it } from "vitest";

import { AGE_GATE_KEY, AGE_GATE_SCRIPT, isAgeGateExempt } from "@/lib/age-gate";

describe("isAgeGateExempt", () => {
  it("laisse les pages légales lisibles sans confirmation d'âge", () => {
    expect(isAgeGateExempt("/cgu")).toBe(true);
    expect(isAgeGateExempt("/confidentialite")).toBe(true);
    expect(isAgeGateExempt("/mentions-legales")).toBe(true);
  });

  it("protège tout le reste du site", () => {
    expect(isAgeGateExempt("/")).toBe(false);
    expect(isAgeGateExempt("/annonces/villa-ngoma")).toBe(false);
    expect(isAgeGateExempt("/cgu-bis")).toBe(false);
  });
});

describe("AGE_GATE_SCRIPT", () => {
  it("marque la page avant le premier affichage quand l'âge a déjà été confirmé", () => {
    const html = { dataset: {} as Record<string, string> };
    const storage = new Map([[AGE_GATE_KEY, "1"]]);
    new Function("document", "localStorage", AGE_GATE_SCRIPT)(
      { documentElement: html },
      { getItem: (k: string) => storage.get(k) ?? null },
    );
    expect(html.dataset.majeur).toBe("1");
  });

  it("ne marque rien à la première visite, et ne plante pas si le stockage est bloqué", () => {
    const html = { dataset: {} as Record<string, string> };
    new Function("document", "localStorage", AGE_GATE_SCRIPT)(
      { documentElement: html },
      { getItem: () => { throw new Error("stockage bloqué"); } },
    );
    expect(html.dataset.majeur).toBeUndefined();
  });
});
