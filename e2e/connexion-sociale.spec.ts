import { expect, test } from "@playwright/test";

/**
 * Les boutons Google, Facebook et WhatsApp n'apparaissent que si leur
 * fournisseur est activé (`NEXT_PUBLIC_AUTH_*=1`). La suite tourne sans ces
 * variables : aucun bouton ne doit mener vers une configuration inexistante.
 */
test.describe("Connexion par fournisseur externe", () => {
  test("sans activation, seuls l'e-mail et le mot de passe sont proposés", async ({ page }) => {
    await page.goto("/connexion");

    await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuer avec Facebook" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuer avec WhatsApp" })).toHaveCount(0);
  });

  test("un refus chez le fournisseur ramène sur la connexion avec un message clair", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=user+cancelled");

    await expect(page).toHaveURL(/\/connexion\?erreur=connexion_externe/);
    await expect(page.locator('p[role="alert"]')).toContainText(
      "La connexion avec ce service n'a pas abouti",
    );
    await expect(page.getByRole("link", { name: "Renvoyer un lien" })).toHaveCount(0);
  });
});
