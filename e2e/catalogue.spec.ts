import { expect, test } from "@playwright/test";

import { countCards } from "./helpers";

test.describe("Catalogue public", () => {
  test("affiche le fil d'annonces du jeu de démonstration", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("exception");
    expect(await countCards(page)).toBeGreaterThan(0);

    // Le tarif doit apparaître en devise locale, pas en code ISO.
    await expect(page.locator("body")).toContainText("FCFA");
    await expect(page.locator("body")).not.toContainText(/\bXAF\b/);
  });

  test("le filtre par ville restreint le fil et se reflète dans l'URL", async ({ page }) => {
    await page.goto("/");
    const total = await countCards(page);

    // Filtrage instantané : un bouton, sans navigation ; l'URL est mise à jour en place.
    await page.getByRole("button", { name: "Brazzaville" }).first().click();
    await page.waitForURL("**/?city=brazzaville");

    const filtered = await countCards(page);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
  });

  test("« Sur place » inclut les offres polyvalentes « Les deux »", async ({ page }) => {
    // Propriété métier : une offre disponible dans les deux modes doit
    // remonter quel que soit le mode demandé.
    await page.goto("/?mobility=les_deux");
    const strict = await countCards(page);

    await page.goto("/?mobility=sur_place");
    const inclusif = await countCards(page);

    expect(inclusif).toBeGreaterThan(strict);
  });

  test("le budget maximum écarte les offres trop chères, borne comprise", async ({ page }) => {
    // Les profils du seed sont tous à 25 000 FCFA : la borne départage.
    await page.goto("/");
    const total = await countCards(page);
    expect(total).toBeGreaterThan(0);

    // Les autres tests publient des profils plus chers : on compare les deux
    // côtés de la borne plutôt qu'au total.
    await page.goto("/?price_max=24999");
    const sous = await countCards(page);
    await page.goto("/?price_max=25000");
    const borne = await countCards(page);

    expect(sous).toBeLessThan(total);
    expect(borne).toBeGreaterThan(sous);
  });

  test("une recherche sans résultat affiche l'état vide", async ({ page }) => {
    await page.goto("/?q=zzzzimpossible");

    await expect(page.getByText("Aucun profil ne correspond")).toBeVisible();
    expect(await countCards(page)).toBe(0);
  });

  test("un filtre hors référentiel est ignoré plutôt que de casser la page", async ({ page }) => {
    const response = await page.goto("/?city=paris&option_type=option_9&price_max=abc");

    expect(response?.status()).toBe(200);
    expect(await countCards(page)).toBeGreaterThan(0);
  });

  test("une carte ouvre la fiche rapide, qui se referme sans perdre la page", async ({ page }) => {
    await page.goto("/");
    await page.locator("article[role=link]").first().click();

    const fiche = page.getByRole("dialog");
    await expect(fiche).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");
    await expect(fiche).toBeHidden();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("la fiche détail expose les informations clés", async ({ page }) => {
    await page.goto("/");
    await page.locator("article[role=link]").first().click();
    await page.getByRole("link", { name: /Voir la fiche complète/ }).click();
    await page.waitForURL("**/annonces/**");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Description")).toBeVisible();
    await expect(page.getByText("Tarifs")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Effectuer une demande/ }),
    ).toBeVisible();
  });

  test("une annonce inexistante renvoie 404", async ({ page }) => {
    const response = await page.goto("/annonces/slug-qui-nexiste-pas");
    expect(response?.status()).toBe(404);
  });
});
