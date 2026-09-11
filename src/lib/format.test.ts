import { describe, expect, it } from "vitest";

import { cx, formatPrice, formatRating, formatXAF, formatXAFCompact } from "@/lib/format";

/**
 * Le formatage monétaire insère des espaces insécables (U+202F, U+00A0) : on
 * normalise avant comparaison plutôt que de coder ces caractères en dur, ce
 * qui rendrait les tests illisibles et fragiles.
 */
const normalize = (value: string) => value.replace(/[  ]/g, " ");

describe("formatXAF", () => {
  it("affiche le libellé local FCFA et non le code ISO", () => {
    expect(normalize(formatXAF(85000))).toBe("85 000 FCFA");
  });

  it("n'affiche aucune décimale — le franc CFA n'a pas de sous-unité", () => {
    expect(normalize(formatXAF(1500.75))).toBe("1 501 FCFA");
  });

  it("gère zéro et les grands montants", () => {
    expect(normalize(formatXAF(0))).toBe("0 FCFA");
    expect(normalize(formatXAF(12_500_000))).toBe("12 500 000 FCFA");
  });
});

describe("formatXAFCompact", () => {
  it("utilise la même devise que les cartes, pour rester cohérent", () => {
    // Une divergence ici est précisément le bug corrigé lors du seed :
    // les cartes affichaient FCFA et le curseur budget XAF.
    expect(formatXAFCompact(150_000)).toContain("FCFA");
    expect(normalize(formatXAF(150_000))).toContain("FCFA");
  });
});

describe("formatPrice", () => {
  it("accole l'unité tarifaire en français", () => {
    expect(normalize(formatPrice(45000, "night"))).toBe("45 000 FCFA / nuit");
    expect(normalize(formatPrice(25000, "hour"))).toBe("25 000 FCFA / heure");
    expect(normalize(formatPrice(350000, "service"))).toBe("350 000 FCFA / prestation");
  });
});

describe("formatRating", () => {
  it("force une décimale, avec la virgule française", () => {
    expect(formatRating(5)).toBe("5,0");
    expect(formatRating(4.85)).toBe("4,9");
  });
});

describe("cx", () => {
  it("écarte les valeurs conditionnelles non retenues", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
    expect(cx()).toBe("");
  });
});
