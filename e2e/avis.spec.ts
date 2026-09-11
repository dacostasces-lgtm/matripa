import { expect, test } from "@playwright/test";

import { gotoReady, publishListing, signUpPartner, uniquePhone } from "./helpers";

test.describe("Suivi client et avis", () => {
  test("l'accès sans session redirige vers la connexion", async ({ page }) => {
    await page.goto("/mes-demandes");

    // On vérifie la destination, pas son encodage : le middleware encode le
    // paramètre (`%2F`) là où une redirection de page le laisse brut. Les deux
    // sont valides et `safeNext` les accepte l'un comme l'autre.
    await expect(page).toHaveURL(({ pathname, searchParams }) => {
      return pathname === "/connexion" && searchParams.get("suivant") === "/mes-demandes";
    });
  });

  test("un nouveau compte n'a aucune demande à suivre", async ({ page }) => {
    await signUpPartner(page);
    await gotoReady(page, "/mes-demandes");

    await expect(page.getByRole("heading", { name: "Mes demandes" })).toBeVisible();
    await expect(page.getByText("Aucune demande pour l'instant")).toBeVisible();
  });

  /**
   * La chaîne de confiance de bout en bout, avec deux acteurs distincts :
   * le partenaire publie et confirme, le client demande puis note. C'est le
   * seul test qui prouve que la note affichée publiquement provient bien
   * d'une prestation confirmée, et non d'une valeur posée à la main.
   */
  test("une prestation confirmée devient une note publique", async ({ browser }) => {
    const partnerCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const partner = await partnerCtx.newPage();
    const client = await clientCtx.newPage();

    // 1. Le partenaire publie une offre qui lui appartient.
    await signUpPartner(partner);
    const titre = await publishListing(partner);

    const href = await partner.locator('a[href^="/annonces/"]').first().getAttribute("href");
    const slug = href!.split("/").pop()!;

    // 2. Le client, connecté, dépose une demande — c'est ce qui renseigne
    //    `author_id` et ouvrira plus tard le droit à l'avis.
    await signUpPartner(client);
    await gotoReady(client, `/demande/${slug}`);
    await client.getByLabel("Nom complet").fill("Cliente Test");
    await client.getByLabel("Téléphone").fill(uniquePhone());
    await client.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(client.getByRole("heading", { name: "Demande envoyée" })).toBeVisible();

    // 3. Tant que la demande n'est pas confirmée, la notation reste fermée.
    await gotoReady(client, "/mes-demandes");
    await expect(client.getByText(titre)).toBeVisible();
    await expect(client.getByText(/La notation s.ouvrira/)).toBeVisible();
    await expect(client.getByRole("button", { name: "Publier mon avis" })).toBeHidden();

    // 4. Le partenaire fait avancer la demande jusqu'à « Confirmé ».
    await gotoReady(partner, "/partenaire");
    await partner.getByRole("button", { name: "Marquer contacté" }).click();
    await expect(partner.getByText("Contacté")).toBeVisible();
    await partner.getByRole("button", { name: "Confirmer" }).click();
    await expect(partner.getByText("Confirmé")).toBeVisible();

    // 5. Le client peut alors noter.
    await gotoReady(client, "/mes-demandes");
    await client.getByRole("radio", { name: "4 étoiles" }).click();
    await client.getByRole("button", { name: "Publier mon avis" }).click();

    // `submitReview` appelle `revalidatePath` : la page se re-rend et remplace
    // le formulaire par l'avis persisté. C'est donc lui qu'on attend, et non
    // le message de succès, qui ne survit pas au re-rendu.
    await expect(client.getByText(/4,0 — votre avis/)).toBeVisible();
    await expect(client.getByRole("button", { name: "Publier mon avis" })).toBeHidden();

    // 6. La note apparaît sur la fiche publique — écrite par le seul chemin
    //    possible, le trigger `reviews_recompute_rating`.
    await gotoReady(client, `/annonces/${slug}`);
    // « 4,0 » apparaît à plusieurs endroits de la fiche : on ancre sur le
    // compteur d'avis, qui lui est unique et prouve la même chose.
    await expect(client.getByText(/\(1 avis\)/)).toBeVisible();
    await expect(client.getByText("4,0").first()).toBeVisible();

    await partnerCtx.close();
    await clientCtx.close();
  });
});
