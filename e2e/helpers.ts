import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { API, SERVICE_KEY, TEST_PASSWORD } from "./constants";

export { ADMIN_EMAIL, TEST_PASSWORD } from "./constants";

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
  //
  // Timeout court et non bloquant : les cartes du fil sont des `next/link`
  // préchargés au survol/scroll, et leur requête RSC de préchargement
  // (`?_rsc=...`) reste parfois en vol après une navigation complète
  // (`page.goto`), retardant `networkidle` de plusieurs secondes sans rapport
  // avec le rendu réel. Le sondage ci-dessous, qui relit le compteur jusqu'à
  // 15 s, est la vraie garantie de fraîcheur ; cette attente n'est qu'une
  // optimisation pour éviter de lire l'état précédent trop tôt.
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});

  await expect
    .poll(
      async () => {
        // Sur l'accueil, le paragraphe d'intro (« Découvrez des profils
        // vérifiés… ») contient lui aussi le mot « profil » et précède le
        // compteur dans le DOM : `p:has-text("profil")` matchait ce
        // paragraphe au lieu du compteur. On cible directement le texte du
        // compteur (chiffre + « profil(s) disponible(s) »), qui lui est
        // unique sur la page.
        const counter = page.getByText(/[0-9]+\s*profils?\s+disponibles?/).first();

        if ((await page.getByText("Aucun profil").count()) > 0) {
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
 * Un clic avant hydratation soumet le formulaire en POST natif, ou ne fait
 * rien du tout sur un bouton `type="button"` dont le seul gestionnaire est
 * posé par React (ex. « Envoyer la vidéo » dans `VerificationUpload`) : le
 * parcours devient silencieusement un no-op, ou intermittent.
 */
export async function gotoReady(page: Page, url: string) {
  // Laisse retomber une navigation RSC encore en vol. Après une Server Action,
  // `revalidatePath` déclenche un rafraîchissement du routeur ; naviguer
  // pendant ce temps fait échouer `goto` en `net::ERR_ABORTED`.
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
  await page.goto(url);

  // `networkidle` n'est ici qu'un lissage, pas la garantie : les cartes du
  // fil sont des `next/link` préchargés au survol/scroll, et leur requête RSC
  // de préchargement (`?_rsc=...`) reste parfois en vol plusieurs secondes
  // après une navigation, sans rapport avec l'hydratation de la page
  // courante. Un timeout non borné pouvait à lui seul consommer tout le
  // budget d'un test qui enchaîne plusieurs `gotoReady` (boucles, deux
  // acteurs) ; le timeout est donc court et l'échec silencieusement ignoré.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

  // La vraie garantie de fraîcheur n'est pas `networkidle` mais l'hydratation
  // React elle-même : React pose une clé `__reactFiber$…` sur chaque nœud DOM
  // dont le sous-arbre a fini de s'hydrater, et `completeWork` remonte du bas
  // vers le haut — quand `document.body` la porte, tout son sous-arbre est
  // hydraté, contrôles interactifs compris. Contrairement aux attentes
  // ci-dessus, celle-ci n'est pas avalée : si la page ne s'hydrate jamais,
  // le test doit échouer plutôt que de cliquer dans le vide.
  await page.waitForFunction(
    () => Object.keys(document.body).some((key) => key.startsWith("__reactFiber$")),
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Inscription d'un partenaire ; en local la confirmation e-mail est désactivée.
 *
 * Vérifié par défaut : depuis la migration 0010, publier exige un compte
 * vérifié, et la plupart des scénarios ne portent pas sur la vérification.
 */
export async function signUpPartner(
  page: Page,
  { verified = true }: { verified?: boolean } = {},
): Promise<string> {
  const email = uniqueEmail();

  await gotoReady(page, "/connexion");
  await page.getByRole("tab", { name: "inscription" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await page.waitForURL("**/partenaire", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Mes profils" })).toBeVisible();

  if (verified) {
    await markVerified(email);
    await page.reload();
  }
  return email;
}

const serviceClient = () =>
  createClient(API, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function userIdByEmail(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`compte introuvable : ${email}`);
  return user.id;
}

/** Pose une vérification approuvée, sans passer par l'examen (service_role). */
export async function markVerified(email: string) {
  const { error } = await serviceClient().from("verification_requests").insert({
    user_id: await userIdByEmail(email),
    status: "approved",
    challenge_code: "E2E000",
    document_type: "cni",
    reviewed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function latestVerification(
  email: string,
): Promise<{ status: string; video_path: string | null } | null> {
  const { data, error } = await serviceClient()
    .from("verification_requests")
    .select("status, video_path")
    .eq("user_id", await userIdByEmail(email))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signIn(page: Page, email: string) {
  await gotoReady(page, "/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
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
  overrides: { city?: string; category?: string } = {},
): Promise<string> {
  const titre = `Offre E2E ${uniqueEmail().split("@")[0].slice(-8)}`;

  await page.getByRole("link", { name: "Nouveau profil" }).click();
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
  await page.getByRole("button", { name: "Publier le profil" }).click();
  await page.waitForURL("**/partenaire?cree=1");

  return titre;
}
