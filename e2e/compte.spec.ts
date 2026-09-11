import { expect, test } from "@playwright/test";

import { alertBox, gotoReady, signUpPartner, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("Compte et mentions légales", () => {
  test("les pages légales sont joignables depuis le pied de page", async ({ page }) => {
    await gotoReady(page, "/");

    for (const [label, heading] of [
      ["Conditions d'utilisation", "Conditions générales d'utilisation"],
      ["Confidentialité", "Politique de confidentialité"],
      ["Mentions légales", "Mentions légales"],
    ] as const) {
      await page.getByRole("link", { name: label }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await page.goBack();
    }
  });

  test("la demande de réinitialisation ne révèle pas si le compte existe", async ({ page }) => {
    await gotoReady(page, "/connexion");
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await page.waitForURL("**/mot-de-passe-oublie");

    // Adresse volontairement inconnue : la réponse doit être la même que pour
    // une adresse valide, sans quoi le formulaire devient un annuaire.
    await page.getByLabel("Adresse e-mail").fill(uniqueEmail());
    await page.getByRole("button", { name: "Envoyer le lien" }).click();

    await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();
  });

  test("un lien de réinitialisation périmé est expliqué, pas silencieux", async ({ page }) => {
    await gotoReady(page, "/auth/callback?code=code-invalide");

    await expect(page).toHaveURL(/\/connexion\?erreur=lien_expire/);
    await expect(alertBox(page)).toContainText(/expiré ou a déjà été utilisé/);
  });

  test("l'espace compte expose l'export et la suppression", async ({ page }) => {
    const email = await signUpPartner(page);
    await gotoReady(page, "/compte");

    await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    const exportLink = page.getByRole("link", { name: /Exporter mes données/ });
    await expect(exportLink).toHaveAttribute("href", "/api/mon-compte/export");

    // La suppression exige la saisie exacte de l'adresse : le bouton reste
    // inerte tant que la confirmation ne correspond pas.
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await expect(page.getByRole("button", { name: "Supprimer définitivement" })).toBeDisabled();

    await page.getByLabel(/Saisissez/).fill("pas-la-bonne-adresse");
    await expect(page.getByRole("button", { name: "Supprimer définitivement" })).toBeDisabled();
  });

  test("l'export renvoie bien les données du compte en pièce jointe", async ({ page }) => {
    await signUpPartner(page);

    const response = await page.request.get("/api/mon-compte/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");

    const body = await response.json();
    expect(body).toHaveProperty("compte");
    expect(body).toHaveProperty("demandes");
    expect(body).toHaveProperty("avis");
    expect(body).toHaveProperty("offres_publiees");
  });

  test("la suppression du compte est effective", async ({ page }) => {
    const email = await signUpPartner(page);
    await gotoReady(page, "/compte");

    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await page.getByLabel(/Saisissez/).fill(email);
    await page.getByRole("button", { name: "Supprimer définitivement" }).click();

    await page.waitForURL("**/?compte=supprime");

    // Le compte ne doit plus permettre de se connecter.
    await gotoReady(page, "/connexion");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(alertBox(page)).toContainText("Identifiants incorrects");
  });
});
