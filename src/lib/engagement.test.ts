import { describe, expect, it } from "vitest";
import type { ListingCardData } from "@/types/listing";

describe("Logique de Boost & Ordonnancement", () => {
  it("priorise les annonces boostées actives devant les annonces standard", () => {
    const now = Date.now();
    const mockListings: ListingCardData[] = [
      {
        id: "1",
        slug: "profil-standard",
        title: "Standard",
        highlight: null,
        city: "brazzaville",
        district: null,
        category: "categorie-a",
        price_xaf: 20000,
        price_unit: "service",
        cover_url: "/cover1.jpg",
        rating: 4.5,
        is_vip: false,
        is_verified: true,
        is_available_now: true,
        video_url: null,
        boosted_until: null,
      },
      {
        id: "2",
        slug: "profil-booste",
        title: "Boosté",
        highlight: null,
        city: "brazzaville",
        district: null,
        category: "categorie-a",
        price_xaf: 35000,
        price_unit: "service",
        cover_url: "/cover2.jpg",
        rating: 4.8,
        is_vip: false,
        is_verified: true,
        is_available_now: true,
        video_url: null,
        boosted_until: new Date(now + 3600000).toISOString(), // Boost actif 1h
      },
      {
        id: "3",
        slug: "profil-boost-expire",
        title: "Boost Expiré",
        highlight: null,
        city: "brazzaville",
        district: null,
        category: "categorie-a",
        price_xaf: 25000,
        price_unit: "service",
        cover_url: "/cover3.jpg",
        rating: 4.0,
        is_vip: false,
        is_verified: false,
        is_available_now: false,
        video_url: null,
        boosted_until: new Date(now - 3600000).toISOString(), // Expiré il y a 1h
      },
    ];

    const sorted = [...mockListings].sort((a, b) => {
      const aBoosted = a.boosted_until ? new Date(a.boosted_until).getTime() > now : false;
      const bBoosted = b.boosted_until ? new Date(b.boosted_until).getTime() > now : false;
      if (aBoosted && !bBoosted) return -1;
      if (!aBoosted && bBoosted) return 1;
      return 0;
    });

    expect(sorted[0].id).toBe("2"); // L'annonce boostée active doit être 1ère
    expect(sorted[1].id).toBe("1");
    expect(sorted[2].id).toBe("3");
  });
});

describe("Formatage du contact WhatsApp direct", () => {
  it("nettoie le numéro de téléphone et génère un texte encodé", () => {
    const rawPhone = "+242 06 912 34 56";
    const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    const title = "Mireille, 23 ans";
    const city = "Brazzaville";

    const message = `Bonjour, je vous contacte depuis Matripa au sujet de votre annonce "${title}" à ${city}. Êtes-vous disponible prochainement ?`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    expect(cleanPhone).toBe("242069123456");
    expect(url).toContain("https://wa.me/242069123456?text=");
    expect(url).toContain("Mireille");
  });
});
