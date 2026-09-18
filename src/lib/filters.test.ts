import { describe, expect, it } from "vitest";

import { activeFilterCount, parseFilters, serializeFilters } from "@/lib/filters";
import { EMPTY_FILTERS, PRICE_BOUNDS } from "@/types/listing";

/**
 * `parseFilters` est une frontière de sécurité : elle lit la query string,
 * qui est une entrée non fiable, avant que les valeurs n'atteignent la
 * requête SQL. Les cas de rejet comptent donc autant que les cas nominaux.
 */
describe("parseFilters", () => {
  it("retourne des filtres vides pour une query string vide", () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("accepte les valeurs du référentiel", () => {
    const filters = parseFilters({
      city: "pointe-noire",
      category: "categorie-b",
      option_type: "option_2",
      mobility: "a_domicile",
      price_max: "50000",
      q: "villa",
      page: "3",
    });

    expect(filters).toEqual({
      city: "pointe-noire",
      category: "categorie-b",
      option_type: "option_2",
      mobility: "a_domicile",
      price_max: 50000,
      query: "villa",
      page: 3,
    });
  });

  it("ignore les valeurs hors référentiel au lieu de les propager", () => {
    const filters = parseFilters({
      city: "paris",
      category: "categorie-z",
      option_type: "option_9",
      mobility: "en_orbite",
    });

    expect(filters.city).toBeNull();
    expect(filters.category).toBeNull();
    expect(filters.option_type).toBeNull();
    expect(filters.mobility).toBeNull();
  });

  it("neutralise une tentative d'injection dans la ville", () => {
    expect(parseFilters({ city: "brazzaville'; drop table listings;--" }).city).toBeNull();
  });

  it("rejette les budgets hors bornes", () => {
    expect(parseFilters({ price_max: "0" }).price_max).toBeNull();
    expect(parseFilters({ price_max: "-500" }).price_max).toBeNull();
    expect(parseFilters({ price_max: "abc" }).price_max).toBeNull();
    expect(parseFilters({ price_max: String(PRICE_BOUNDS.max) }).price_max).toBeNull();
    expect(parseFilters({ price_max: "50000" }).price_max).toBe(50000);
  });

  it("ramène une page invalide ou négative à 1", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "-4" }).page).toBe(1);
    expect(parseFilters({ page: "trois" }).page).toBe(1);
  });

  it("tronque une recherche trop longue", () => {
    expect(parseFilters({ q: "a".repeat(500) }).query).toHaveLength(80);
  });

  it("traite une recherche vide comme absente", () => {
    expect(parseFilters({ q: "   " }).query).toBeNull();
  });

  it("ne retient que la première valeur d'un paramètre répété", () => {
    expect(parseFilters({ city: ["brazzaville", "dolisie"] }).city).toBe("brazzaville");
  });
});

describe("serializeFilters", () => {
  it("omet les valeurs nulles", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe("");
  });

  it("laisse la page 1 implicite pour garder des URLs propres", () => {
    expect(serializeFilters({ ...EMPTY_FILTERS, page: 1 })).toBe("");
    expect(serializeFilters({ ...EMPTY_FILTERS, page: 2 })).toBe("page=2");
  });

  it("fait un aller-retour fidèle avec parseFilters", () => {
    const filters = parseFilters({
      city: "pointe-noire",
      category: "categorie-c",
      mobility: "les_deux",
      price_max: "75000",
      q: "chauffeur",
      page: "2",
    });

    expect(parseFilters(Object.fromEntries(new URLSearchParams(serializeFilters(filters))))).toEqual(
      filters,
    );
  });
});

describe("activeFilterCount", () => {
  it("ne compte ni la ville ni la page, qui relèvent de la navigation", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, city: "brazzaville", page: 4 })).toBe(0);
  });

  it("compte chaque critère renseigné", () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        category: "categorie-a",
        mobility: "sur_place",
        price_max: 40000,
      }),
    ).toBe(3);
  });
});
