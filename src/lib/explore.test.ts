import { describe, expect, it } from "vitest";

import { matchesFilters, normalizeSearch } from "@/lib/explore";
import { EMPTY_FILTERS, type ListingExplorerData, type ListingFilters } from "@/types/listing";

const listing = (over: Partial<ListingExplorerData> = {}): ListingExplorerData => ({
  id: "1",
  slug: "villa-ngoma",
  title: "Villa Ngoma — piscine privée",
  highlight: "Espace Privé, 5★",
  city: "brazzaville",
  district: "Bacongo",
  category: "categorie-a",
  price_xaf: 85_000,
  price_unit: "night",
  cover_url: "https://example.com/cover.jpg",
  rating: null,
  is_vip: true,
  is_verified: true,
  is_available_now: false,
  video_url: null,
  whatsapp_phone: null,
  boosted_until: null,
  description: "Grande villa avec jardin et accès indépendant.",
  images: [],
  amenities: ["Service 24/7"],
  mobility: "sur_place",
  option_type: "option_1",
  ...over,
});

const filters = (over: Partial<ListingFilters> = {}): ListingFilters => ({ ...EMPTY_FILTERS, ...over });

describe("normalizeSearch", () => {
  it("ignore la casse et les accents", () => {
    expect(normalizeSearch("  Pointe-NOIRE Kintélé ")).toBe("pointe-noire kintele");
  });
});

describe("matchesFilters", () => {
  it("laisse tout passer sans filtre", () => {
    expect(matchesFilters(listing(), filters())).toBe(true);
  });

  it("filtre par ville et par catégorie", () => {
    expect(matchesFilters(listing(), filters({ city: "brazzaville" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ city: "pointe-noire" }))).toBe(false);
    expect(matchesFilters(listing(), filters({ category: "categorie-a" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ category: "categorie-b" }))).toBe(false);
  });

  it("applique le budget maximum, bornes comprises", () => {
    expect(matchesFilters(listing(), filters({ price_max: 85_000 }))).toBe(true);
    expect(matchesFilters(listing(), filters({ price_max: 84_999 }))).toBe(false);
  });

  it("filtre par formule", () => {
    expect(matchesFilters(listing(), filters({ option_type: "option_1" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ option_type: "option_2" }))).toBe(false);
  });

  it("traite « les deux » comme compatible avec sur place et à domicile, comme la requête serveur", () => {
    const polyvalent = listing({ mobility: "les_deux" });
    expect(matchesFilters(polyvalent, filters({ mobility: "sur_place" }))).toBe(true);
    expect(matchesFilters(polyvalent, filters({ mobility: "a_domicile" }))).toBe(true);
    expect(matchesFilters(listing({ mobility: "sur_place" }), filters({ mobility: "a_domicile" }))).toBe(false);
    expect(matchesFilters(listing({ mobility: "sur_place" }), filters({ mobility: "les_deux" }))).toBe(false);
    expect(matchesFilters(polyvalent, filters({ mobility: "les_deux" }))).toBe(true);
  });

  it("cherche chaque mot dans le titre, le quartier, la ville, la description et les prestations", () => {
    expect(matchesFilters(listing(), filters({ query: "villa" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ query: "BACONGO" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ query: "brazzaville jardin" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ query: "privee" }))).toBe(true); // sans accent
    expect(matchesFilters(listing(), filters({ query: "24/7" }))).toBe(true);
    expect(matchesFilters(listing(), filters({ query: "villa dolisie" }))).toBe(false); // tous les mots doivent correspondre
  });
});
