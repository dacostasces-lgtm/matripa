import { expect, type Page } from "@playwright/test";

/**
 * Identifiants uniques par exécution : la base locale n'est pas réinitialisée
 * entre deux lancements, et l'anti-spam de `submit_request` plafonne à cinq
 * demandes par heure et par numéro.
 *
 * `run` assure l'unicité entre exécutions, `counter` à l'intérieur d'une même
 * exécution. Les deux sont nécessaires — n'utiliser que `run` produirait la
 * même valeur à chaque appel et les tests se bloqueraient l'un l'autre.
 */
const run = Date.now().toString().slice(-6);
let counter = 0;
const seq = () => (counter++).toString().padStart(3, "0");

export const uniqueEmail = () => `e2e-${run}-${seq()}@matripa.test`;

/** Numéro congolais plausible, distinct à chaque appel et d'une exécution à l'autre. */
export const uniquePhone = () => `+242 06 ${run.slice(0, 3)} ${seq()} ${run.slice(3, 5)}`;

export const TEST_PASSWORD = "MotDePasseE2E2026!";

/** PNG 1×1 valide, suffisant pour exercer l'upload sans embarquer de fixture. */
export const tinyPng = () =>
  Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff0300000600055773d5170000000049454e44ae426082",
    "hex",
  );

/**
 * Nombre d'offres correspondant aux filtres.
 *
 * On lit le compteur rendu par le serveur (« N offres disponibles ») plutôt
 * que de dénombrer les cartes du DOM. Compter les cartes s'est révélé
 * instable : le fil est streamé dans un `<Suspense>`, et entre le moment où
 * l'attente est satisfaite et celui où le comptage s'exécute, un re-rendu peut
 * vider brièvement la grille — on obtient alors 0 sans qu'aucune assertion ne
 * le signale.
 *
 * `expect.poll` réessaie jusqu'à ce que la page ait atteint un état terminal :
 * soit le compteur, soit l'état vide.
 */
export async function countCards(page: Page): Promise<number> {
  let count = -1;

  // Laisse la navigation RSC se terminer avant de sonder. Sans cela, après un
  // clic de filtre, le compteur *précédent* est encore à l'écran : il satisfait
  // le motif, le sondage s'arrête, et on mesure l'état d'avant.
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect
    .poll(
      async () => {
        const counter = page.locator('p:has-text("disponible")').first();

        if ((await page.getByText("Aucun profil ne correspond").count()) > 0) {
          count = 0;
          return true;
        }
        const text = (await counter.textContent().catch(() => null)) ?? "";
        const matched = text.match(/([0-9]+)\s*profils?\s+disponibles?/);

        if (!matched) return false;
        count = Number.parseInt(matched[1], 10);
        return true;
      },
      { timeout: 15_000, message: "le fil d'annonces n'a jamais atteint un état stable" },
    )
    .toBe(true);

  return count;
}

/**
 * Next.js insère un `<div role="alert">` (route announcer) sur chaque page :
 * cibler le rôle seul est ambigu. Nos messages sont des `<p role="alert">`.
 */
export const alertBox = (page: Page) => page.locator('p[role="alert"]');

/**
 * Navigue puis attend l'hydratation.
 *
 * Un clic avant hydratation soumet le formulaire en POST natif : le parcours
 * fonctionne, mais pas celui qu'on veut mesurer, et le résultat devient
 * intermittent.
 */
export async function gotoReady(page: Page, url: string) {
  // Laisse retomber une navigation RSC encore en vol. Après une Server Action,
  // `revalidatePath` déclenche un rafraîchissement du routeur ; naviguer
  // pendant ce temps fait échouer `goto` en `net::ERR_ABORTED`.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** Inscription d'un partenaire ; en local la confirmation e-mail est désactivée. */
export async function signUpPartner(page: Page): Promise<string> {
  const email = uniqueEmail();

  await gotoReady(page, "/connexion");
  await page.getByRole("tab", { name: "inscription" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await page.waitForURL("**/partenaire", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Mes profils" })).toBeVisible();
  return email;
}

/**
 * Publie une offre depuis l'espace partenaire et renvoie son titre.
 *
 * Les annonces du seed n'ont pas de `owner_id` : aucun partenaire ne peut donc
 * les confirmer. Tout scénario impliquant la confirmation d'une demande doit
 * partir d'une offre réellement créée par un compte.
 */
export async function publishListing(
  page: Page,
  overrides: { city?: string; category?: string; whatsapp?: string } = {},
): Promise<string> {
  const titre = `Offre E2E ${uniqueEmail().split("@")[0].slice(-8)}`;

  await page.getByRole("link", { name: "Nouveau profil" }).first().click();
  await page.waitForURL("**/partenaire/annonces/nouvelle");

  await page
    .locator('input[type="file"][accept^="image"]')
    .setInputFiles({ name: "visuel.png", mimeType: "image/png", buffer: tinyPng() });

  await page.getByLabel("Prénom et âge").fill(titre);
  await page
    .getByLabel("Description")
    .fill("Description de test suffisamment longue pour passer la validation serveur.");
  await page.getByLabel("Catégorie").selectOption(overrides.category ?? "categorie-a");
  await page.getByLabel("Formule").selectOption("option_1");
  await page.getByLabel("Type de service").selectOption("sur_place");
  await page.getByLabel("Ville").selectOption(overrides.city ?? "brazzaville");
  await page.getByLabel("Tarif (FCFA)").fill("50000");
  if (overrides.whatsapp) await page.getByLabel("Numéro WhatsApp").fill(overrides.whatsapp);
  await page.getByRole("button", { name: "Publier le profil" }).click();
  await page.waitForURL("**/partenaire?cree=1");

  return titre;
}

/**
 * Adresse de la fiche complète de la première annonce de l'accueil.
 *
 * Les cartes de l'accueil ouvrent une fiche rapide (modale) et ne sont plus
 * des liens : le chemin vers la page détail passe par « Voir la fiche complète ».
 */
export async function firstListingPath(page: Page): Promise<string> {
  await gotoReady(page, "/");
  await page.locator("article[role=link]").first().click();
  const href = await page.getByRole("link", { name: /Voir la fiche complète/ }).getAttribute("href");
  await page.keyboard.press("Escape");
  return href!;
}
