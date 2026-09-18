import { describe, expect, it } from "vitest";

import { MAX_FAVORITES, parseFavoriteIds, toggleFavoriteId } from "@/lib/favorites";

describe("parseFavoriteIds", () => {
  it("relit une liste d'identifiants enregistrée", () => {
    expect(parseFavoriteIds('["a","b"]')).toEqual(["a", "b"]);
  });

  it("résiste à un stockage vide, corrompu ou modifié à la main", () => {
    expect(parseFavoriteIds(null)).toEqual([]);
    expect(parseFavoriteIds("")).toEqual([]);
    expect(parseFavoriteIds("{pas du json")).toEqual([]);
    expect(parseFavoriteIds('{"a":1}')).toEqual([]);
    expect(parseFavoriteIds('["a",2,null,"",' + JSON.stringify("x".repeat(80)) + ',"a"]')).toEqual(["a"]);
  });

  it(`ne garde pas plus de ${MAX_FAVORITES} favoris`, () => {
    const many = JSON.stringify(Array.from({ length: MAX_FAVORITES + 10 }, (_, i) => `id-${i}`));
    expect(parseFavoriteIds(many)).toHaveLength(MAX_FAVORITES);
  });
});

describe("toggleFavoriteId", () => {
  it("ajoute en tête un profil absent", () => {
    expect(toggleFavoriteId(["a"], "b")).toEqual(["b", "a"]);
  });

  it("retire un profil déjà en favori", () => {
    expect(toggleFavoriteId(["b", "a"], "b")).toEqual(["a"]);
  });

  it("écarte le plus ancien au-delà de la limite", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `id-${i}`);
    const next = toggleFavoriteId(full, "nouveau");
    expect(next).toHaveLength(MAX_FAVORITES);
    expect(next[0]).toBe("nouveau");
    expect(next).not.toContain(`id-${MAX_FAVORITES - 1}`);
  });
});
