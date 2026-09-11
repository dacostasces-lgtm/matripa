import { expect, test } from "@playwright/test";

import { alertBox, countCards, gotoReady, signUpPartner, tinyPng } from "./helpers";

test.describe("Espace partenaire", () => {
  test("l'accès sans session redirige vers la connexion", async ({ page }) => {
    await page.goto("/partenaire");

    await expect(page).toHaveURL(/\/connexion\?suivant=%2Fpartenaire/);
    await expect(page.getByRole("heading", { name: "Compte Matripa" })).toBeVisible();
  });

  test("des identifiants incorrects ne révèlent pas si le compte existe", async ({ page }) => {
    await gotoReady(page, "/connexion");
    await page.getByLabel("Adresse e-mail").fill("inconnu@matripa.test");
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(alertBox(page)).toContainText("Identifiants incorrects");
  });

  test("un nouveau partenaire arrive sur un tableau de bord vide", async ({ page }) => {
    await signUpPartner(page);

    await expect(page.getByRole("heading", { name: "Mes offres" })).toBeVisible();
    await expect(page.getByText("Aucune offre pour l'instant")).toBeVisible();

    // Le catalogue de démonstration ne doit pas apparaître comme sien :
    // `listings_public_read` le rendrait visible sans filtre `owner_id`.
    expect(await countCards(page)).toBe(0);
  });

  test("création d'une offre, de la publication à la fiche publique", async ({ page }) => {
    await signUpPartner(page);

    await page.getByRole("link", { name: "Nouvelle offre" }).click();
    await page.waitForURL("**/partenaire/annonces/nouvelle");

    await page
      .locator('input[type="file"][accept^="image"]')
      .setInputFiles({ name: "visuel.png", mimeType: "image/png", buffer: tinyPng() });
    await expect(page.getByText("Couverture")).toBeVisible();

    const titre = `Villa E2E ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Titre de l'offre").fill(titre);
    await page
      .getByLabel("Description")
      .fill("Description de test suffisamment longue pour passer la validation serveur.");
    await page.getByLabel("Catégorie").selectOption("categorie-a");
    await page.getByLabel("Type d'offre").selectOption("option_1");
    await page.getByLabel("Type de service").selectOption("sur_place");
    await page.getByLabel("Ville").selectOption("brazzaville");
    await page.getByLabel("Tarif (FCFA)").fill("65000");
    await page.getByLabel("Langues parlées").fill("Français, Lingala");

    await page.getByRole("button", { name: "Enregistrer l'offre" }).click();

    await page.waitForURL("**/partenaire?cree=1");
    await expect(page.getByRole("status")).toContainText("Offre enregistrée");
    await expect(page.getByText(titre)).toBeVisible();
    await expect(page.getByText("En ligne")).toBeVisible();

    // La fiche publique doit refléter la saisie, langues comprises.
    await page.getByText(titre).click();
    await page.waitForURL("**/annonces/**");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(titre);
    await expect(page.getByText("Lingala")).toBeVisible();
  });

  test("dépublier retire l'offre du catalogue public", async ({ page }) => {
    await signUpPartner(page);

    await page.getByRole("link", { name: "Nouvelle offre" }).click();
    await page
      .locator('input[type="file"][accept^="image"]')
      .setInputFiles({ name: "visuel.png", mimeType: "image/png", buffer: tinyPng() });

    const titre = `Studio E2E ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Titre de l'offre").fill(titre);
    await page
      .getByLabel("Description")
      .fill("Description de test suffisamment longue pour passer la validation serveur.");
    await page.getByLabel("Catégorie").selectOption("categorie-c");
    await page.getByLabel("Type d'offre").selectOption("option_3");
    await page.getByLabel("Type de service").selectOption("les_deux");
    await page.getByLabel("Ville").selectOption("dolisie");
    await page.getByLabel("Tarif (FCFA)").fill("18000");
    await page.getByRole("button", { name: "Enregistrer l'offre" }).click();
    await page.waitForURL("**/partenaire?cree=1");

    await page.getByRole("button", { name: "Dépublier" }).click();
    await expect(page.getByText("Brouillon")).toBeVisible();

    // Vérifie du même coup que `revalidateTag` purge bien le cache du fil :
    // sans invalidation, l'offre resterait visible jusqu'à 5 minutes.
    await page.goto("/?city=dolisie");
    await expect(page.getByText(titre)).toBeHidden();
  });

  test("modifier une offre conserve son adresse publique", async ({ page }) => {
    await signUpPartner(page);

    await page.getByRole("link", { name: "Nouvelle offre" }).click();
    await page
      .locator('input[type="file"][accept^="image"]')
      .setInputFiles({ name: "visuel.png", mimeType: "image/png", buffer: tinyPng() });

    await page.getByLabel("Titre de l'offre").fill(`Loft E2E ${Date.now().toString().slice(-6)}`);
    await page
      .getByLabel("Description")
      .fill("Description de test suffisamment longue pour passer la validation serveur.");
    await page.getByLabel("Catégorie").selectOption("categorie-a");
    await page.getByLabel("Type d'offre").selectOption("option_2");
    await page.getByLabel("Type de service").selectOption("sur_place");
    await page.getByLabel("Ville").selectOption("pointe-noire");
    await page.getByLabel("Tarif (FCFA)").fill("40000");
    await page.getByRole("button", { name: "Enregistrer l'offre" }).click();
    await page.waitForURL("**/partenaire?cree=1");

    const lienAvant = await page.locator('a[href^="/annonces/"]').first().getAttribute("href");

    await page.getByRole("link", { name: "Modifier" }).click();
    await page.waitForURL("**/modifier");

    const nouveauTitre = `Loft renommé ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Titre de l'offre").fill(nouveauTitre);
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await page.waitForURL("**/partenaire?modifie=1");
    await expect(page.getByRole("status")).toContainText("Modifications enregistrées");

    // Le slug sert d'URL publique, potentiellement déjà partagée : il ne doit
    // pas suivre le titre.
    const lienApres = await page.locator('a[href^="/annonces/"]').first().getAttribute("href");
    expect(lienApres).toBe(lienAvant);
    await expect(page.getByText(nouveauTitre)).toBeVisible();
  });

  test("la page d'administration est invisible pour un partenaire ordinaire", async ({ page }) => {
    await signUpPartner(page);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });
});
