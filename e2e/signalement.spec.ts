import { expect, test, type Page } from "@playwright/test";

import { ADMIN_EMAIL, gotoReady, publishListing, signIn, signUpPartner, TEST_PASSWORD } from "./helpers";

/**
 * Ville sans profil de démonstration : le fil filtré reste court, le profil
 * créé par le test est donc toujours sur la première page.
 */
const CITY = "ouesso";

async function slugOf(page: Page, titre: string): Promise<string> {
  const href = await page.locator('a[href^="/annonces/"]', { hasText: titre }).first().getAttribute("href");
  if (!href) throw new Error(`lien du profil introuvable : ${titre}`);
  return href.replace("/annonces/", "");
}

test.describe("Signalement d'annonces", () => {
  test("un visiteur non connecté se connecte puis revient au formulaire", async ({ page, browser }) => {
    await signUpPartner(page);
    const titre = await publishListing(page, { city: CITY });
    const slug = await slugOf(page, titre);

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    const reporterEmail = await signUpPartner(reporterPage);
    await reporterContext.close();

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/signaler/${slug}`);
    await expect(visitor).toHaveURL(/\/connexion\?suivant=(%2F|\/)signaler(%2F|\/)/);

    // Arrivée par redirection : `gotoReady` ne s'applique pas telle quelle (elle
    // appelle `page.goto`), mais on reprend ses deux signaux de stabilisation :
    // `networkidle` (la page atterrit ici après une redirection serveur, qui
    // s'accompagne d'un ou deux réajustements côté client du routeur avant que
    // le formulaire ne soit stable — sans cette attente, `fill()` peut viser un
    // champ qu'un remontage ultérieur vide silencieusement) puis l'hydratation
    // React elle-même avant de cliquer.
    await visitor.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await visitor.waitForFunction(
      () => Object.keys(document.body).some((key) => key.startsWith("__reactFiber$")),
      undefined,
      { timeout: 15_000 },
    );
    await visitor.getByLabel("Adresse e-mail").fill(reporterEmail);
    await visitor.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await visitor.getByRole("button", { name: "Se connecter" }).click();

    await visitor.waitForURL(`**/signaler/${slug}`, { timeout: 15_000 });
    await expect(visitor.getByRole("heading", { name: "Signaler un profil" })).toBeVisible();
    await visitorContext.close();
  });

  test("signalement urgent : profil masqué, suspendu, puis rétabli par l'équipe", async ({ page, browser }) => {
    await signUpPartner(page);
    const titre = await publishListing(page, { city: CITY });
    const slug = await slugOf(page, titre);

    const reporterContext = await browser.newContext();
    const reporter = await reporterContext.newPage();
    await signUpPartner(reporter);
    await gotoReady(reporter, `/signaler/${slug}`);
    await reporter.getByRole("radio", { name: /Personne mineure présumée/ }).check();
    await reporter.getByLabel("Précisions").fill("Le profil semble concerner une adolescente.");
    await reporter.getByRole("button", { name: "Envoyer le signalement" }).click();
    await reporter.waitForURL("**/signaler/merci?urgent=1", { timeout: 15_000 });
    await expect(reporter.getByRole("heading", { name: "Signalement transmis" })).toBeVisible();

    await gotoReady(reporter, `/?city=${CITY}`);
    await expect(reporter.getByText(titre)).toBeHidden();

    await gotoReady(page, "/partenaire");
    await expect(page.getByText("Suspendu").first()).toBeVisible();
    await expect(page.getByText("Un de vos profils est suspendu le temps d'un examen par l'équipe Matripa.")).toBeVisible();

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    // Le titre apparaît aussi dans la liste « Mise en avant VIP » : on cible la
    // carte qui porte les boutons de décision.
    const card = admin
      .locator("li", { hasText: titre })
      .filter({ has: admin.getByRole("button", { name: "Signalement infondé" }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Signalement infondé" }).click();
    await expect(card).toBeHidden();
    await adminContext.close();

    await gotoReady(reporter, `/?city=${CITY}`);
    await expect(reporter.getByText(titre)).toBeVisible();
    await reporterContext.close();
  });
});
