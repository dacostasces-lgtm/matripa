import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  gotoReady,
  latestVerification,
  publishListing,
  signIn,
  signUpPartner,
} from "./helpers";

/**
 * Le contenu n'est pas une vraie vidéo : le bucket filtre sur le type déclaré,
 * et Chromium de Playwright, sans codecs propriétaires, ne lit pas la durée —
 * ce que l'application accepte volontairement.
 */
const fakeVideo = () => ({
  name: "selfie.mp4",
  mimeType: "video/mp4",
  buffer: Buffer.from("video-e2e"),
});

async function submitSelfie(page: Page) {
  await gotoReady(page, "/partenaire/verification");
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page.getByTestId("challenge-code")).toHaveText(/^[A-Z2-9]{6}$/);

  await page.getByLabel("Pièce d'identité présentée").selectOption("passeport");
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(fakeVideo());
  await page.getByRole("button", { name: "Envoyer la vidéo" }).click();

  await expect(page.getByText("Vérification en cours d'examen")).toBeVisible();
}

test.describe("Vérification d'identité", () => {
  test("un compte non vérifié ne peut pas publier", async ({ page }) => {
    await signUpPartner(page, { verified: false });

    await expect(page.getByText("Vérifiez votre identité pour publier.")).toBeVisible();

    await page.getByRole("link", { name: "Nouveau profil" }).click();
    await page.waitForURL("**/partenaire/annonces/nouvelle");

    await expect(page.getByRole("checkbox", { name: /^Publier/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeVisible();
  });

  test("approbation : badge sur les profils et vidéo supprimée", async ({ page, browser }) => {
    const email = await signUpPartner(page, { verified: false });
    await submitSelfie(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    const card = admin.locator("li", { hasText: email });
    await expect(card).toBeVisible();

    const approve = card.getByRole("button", { name: "Approuver" });
    await expect(approve).toBeDisabled();
    await card.getByLabel("Le visage correspond aux photos des annonces").check();
    await card.getByLabel("La pièce est lisible et paraît authentique").check();
    await card.getByLabel("La date de naissance indique 18 ans ou plus").check();
    await card.getByLabel("Le code prononcé est le bon").check();
    await approve.click();

    await expect(admin.locator("li", { hasText: email }).getByRole("button", { name: "Révoquer" })).toBeVisible();
    await adminContext.close();

    await expect.poll(async () => (await latestVerification(email))?.video_path, { timeout: 10_000 }).toBeNull();

    await gotoReady(page, "/partenaire/verification");
    await expect(page.getByText("Identité vérifiée")).toBeVisible();

    await gotoReady(page, "/partenaire");
    const titre = await publishListing(page);
    await page.getByText(titre).click();
    await page.waitForURL("**/annonces/**");
    await expect(page.getByText("Certifié").first()).toBeVisible();
  });

  test("rejet : le motif est présenté au partenaire", async ({ page, browser }) => {
    const email = await signUpPartner(page, { verified: false });
    await submitSelfie(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    const card = admin.locator("li", { hasText: email });
    await card.getByLabel("Motif du rejet").selectOption("video_illisible");
    await card.getByRole("button", { name: "Rejeter" }).click();
    await expect(admin.locator("li", { hasText: email })).toBeHidden();
    await adminContext.close();

    await gotoReady(page, "/partenaire/verification");
    await expect(page.getByText("vidéo illisible")).toBeVisible();
    await expect(page.getByRole("button", { name: "Recommencer" })).toBeVisible();
  });
});
