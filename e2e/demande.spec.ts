import { expect, test } from "@playwright/test";

import { alertBox, gotoReady, uniquePhone } from "./helpers";

/**
 * Le maillon que rien d'autre ne couvre : la soumission d'un formulaire via
 * une Server Action, donc le transport RSC. Les deux extrémités (validation
 * serveur, contrat RPC) sont vérifiées par ailleurs, mais pas le trajet.
 */
test.describe("Parcours de demande", () => {
  test("une demande valide est acceptée de bout en bout", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('a[href^="/annonces/"]').first().click();
    await page.getByRole("link", { name: /Contacter \/ Effectuer une demande/ }).click();

    await page.waitForURL("**/demande/**");
    await expect(page.getByRole("heading", { name: "Effectuer une demande" })).toBeVisible();

    await page.getByLabel("Nom complet").fill("Awa Mabiala");
    await page.getByLabel("Téléphone").fill(uniquePhone());
    await page.getByLabel("E-mail").fill("awa@exemple.cg");
    await page.getByLabel("Nombre de personnes").fill("4");

    await page.getByRole("button", { name: "Envoyer la demande" }).click();

    await expect(page.getByRole("heading", { name: "Demande envoyée" })).toBeVisible();
    await expect(page.getByText(/vous recontacte sous 24/)).toBeVisible();
  });

  test("un téléphone invalide est refusé par le serveur, champ par champ", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('a[href^="/annonces/"]').first().getAttribute("href");
    await gotoReady(page, `/demande/${href!.split("/").pop()}`);

    // `noValidate` sur le formulaire : la validation navigateur ne masque pas
    // celle du serveur, qui est la seule qui compte.
    await page.getByLabel("Nom complet").fill("X");
    await page.getByLabel("Téléphone").fill("pas-un-numero");
    await page.getByRole("button", { name: "Envoyer la demande" }).click();

    await expect(alertBox(page)).toContainText("corriger les champs");
    await expect(page.getByText(/Numéro invalide/)).toBeVisible();
    await expect(page.getByText(/nom complet/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Demande envoyée" })).toBeHidden();
  });

  test("l'anti-spam coupe après cinq demandes pour un même numéro", async ({ page }) => {
    // 6 navigations `gotoReady` de suite : chacune attend, au pire, le
    // règlement réseau borné puis l'hydratation React avant de rendre la
    // main. Le budget par défaut (30 s, `playwright.config.ts`) devient
    // insuffisant pour cette suite d'allers-retours ; l'assertion finale
    // reste inchangée, seul le temps qui lui est laissé augmente.
    test.setTimeout(60_000);

    const phone = uniquePhone();

    await page.goto("/");
    const href = await page.locator('a[href^="/annonces/"]').first().getAttribute("href");
    const slug = href!.split("/").pop();

    for (let attempt = 1; attempt <= 5; attempt++) {
      await gotoReady(page, `/demande/${slug}`);
      await page.getByLabel("Nom complet").fill("Client Récurrent");
      await page.getByLabel("Téléphone").fill(phone);
      await page.getByRole("button", { name: "Envoyer la demande" }).click();
      await expect(page.getByRole("heading", { name: "Demande envoyée" })).toBeVisible();
    }

    await gotoReady(page, `/demande/${slug}`);
    await page.getByLabel("Nom complet").fill("Client Récurrent");
    await page.getByLabel("Téléphone").fill(phone);
    await page.getByRole("button", { name: "Envoyer la demande" }).click();

    await expect(alertBox(page)).toContainText(/Trop de demandes/);
  });
});
