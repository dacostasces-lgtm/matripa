import { describe, expect, it } from "vitest";

import { cityLabel } from "@/types/listing";

describe("cityLabel", () => {
  it("utilise le libellé officiel des villes proposées dans les filtres", () => {
    expect(cityLabel("brazzaville")).toBe("Brazzaville");
    expect(cityLabel("pointe-noire")).toBe("Pointe-Noire");
  });

  it("affiche lisiblement une ville encore en base mais retirée des filtres", () => {
    expect(cityLabel("dolisie")).toBe("Dolisie");
    expect(cityLabel("oyo")).toBe("Oyo");
    expect(cityLabel("mont-belo")).toBe("Mont-Belo");
  });
});
