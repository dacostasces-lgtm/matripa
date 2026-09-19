import { expect, test } from "@playwright/test";

// Stockage vierge : la configuration commune confirme la majorité d'avance.
test.use({ storageState: { cookies: [], origins: [] } });

const gate = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Réservé aux adultes" });

test.describe("Vérification d'âge", () => {
  test("bloque le site à la première visite, puis ne revient plus sur cet appareil", async ({ page }) => {
    await page.goto("/");
    await expect(gate(page)).toBeVisible();

    await gate(page).getByRole("button", { name: /18 ans ou plus/ }).click();
    await expect(gate(page)).toBeHidden();

    await page.reload();
    await expect(gate(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("exception");
  });

  test("laisse lire les conditions d'utilisation sans confirmer", async ({ page }) => {
    await page.goto("/cgu");
    await expect(gate(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
