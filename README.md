# Matripa

Conciergerie privée, réservation d'espaces et mise en relation événementielle au Congo.
Next.js 15 (App Router) · React 19 · Supabase · Tailwind v4 · PWA.

---

## Démarrer

```bash
cp .env.example .env.local     # renseigner les clés Supabase
npm install
npm run dev
```

Pour travailler hors ligne, la stack Supabase locale applique migrations **et** seed :

```bash
supabase start
supabase db reset              # migrations + supabase/seed.sql (15 offres de démo)
```

Basculer `.env.local` sur le bloc « stack locale » commenté en fin de fichier.

| Commande | Effet |
|---|---|
| `npm run check` | `tsc --noEmit` + tests unitaires |
| `npm test` | Vitest (81 tests, logique pure) |
| `npm run test:db` | pgTAP (144 tests de sécurité, nécessite `supabase start`) |
| `npm run test:e2e` | Playwright (32 parcours, nécessite `supabase start`) |
| `npm run build` | Build de production |

---

## Structure

```
src/
  app/
    page.tsx                     Fil d'annonces (filtres dans l'URL)
    annonces/[slug]/             Fiche publique
    demande/[slug]/              Formulaire de mise en relation
    signaler/[slug]/             Signalement d'un profil (compte connecté)
    connexion/                   Connexion et inscription
    mot-de-passe-oublie/         Demande de lien de réinitialisation
    mot-de-passe/                Saisie du nouveau mot de passe
    auth/callback/               Échange du code e-mail contre une session
    compte/                      Export et suppression des données
    cgu/ confidentialite/ mentions-legales/
    partenaire/                  Tableau de bord, création, édition
    partenaire/verification/     Vérification d'identité par selfie vidéo
    mes-demandes/                Suivi client et dépôt d'avis
    admin/                       Vérification d'identité, VIP, modération
    api/webhooks/new-request/    Notification déclenchée par pg_net
    api/webhooks/pawapay/        Callback de dépôt mobile money
    api/revalidate/              Purge du cache catalogue
    actions/                     Server Actions
  components/                    listings · partner · auth · pwa · ui
  lib/
    supabase/{server,client,admin,public,middleware}.ts
    listings.ts                  Lectures publiques, mises en cache
    filters.ts                   Parsing/validation de l'URL
  types/{listing,database}.ts
e2e/                             Playwright (parcours réels, navigateur)
supabase/
  migrations/                    0001 → 0012
  tests/security.test.sql        pgTAP
  tests/verification.test.sql    pgTAP (vérification d'identité)
  tests/reports.test.sql         pgTAP (signalements)
  seed.sql
```

### Quatre clients Supabase, quatre usages

| Module | Clé | Cookies | Pour quoi |
|---|---|---|---|
| `supabase/server.ts` | anon | oui | Server Components et Actions liés à une session |
| `supabase/client.ts` | anon | oui | Navigateur (upload Storage) |
| `supabase/public.ts` | anon | **non** | Lectures publiques cachables (fil, fiches, sitemap) |
| `supabase/admin.ts` | service_role | non | Webhook uniquement — `import "server-only"` |

Lire les cookies rend une route dynamique. D'où `public.ts` : sans lui, aucune page publique ne peut être mise en cache.

---

## Modèle de sécurité

Trois mécanismes distincts, souvent confondus :

- **RLS** filtre les *lignes*.
- **GRANT de colonne** filtre les *colonnes*, au niveau du **rôle** — pas de la ligne.
- **Fonctions `SECURITY DEFINER`** couvrent ce que les deux précédents ne savent pas exprimer.

Concrètement :

| Champ | Qui peut l'écrire |
|---|---|
| Contenu de l'annonce | le partenaire propriétaire (policy + GRANT) |
| `is_vip` | personne en direct → `set_listing_certification()`, qui vérifie `admins` |
| `is_verified`, `verification_grace_until` | aucun rôle client — dérivés de la vérification du compte par `review_verification()` et le trigger `listings_enforce_verification` |
| `verification_requests` | personne en direct → `start_verification()`, `submit_verification()`, `review_verification()` |
| `rating`, `reviews_count` | aucun rôle client — recalculés par le trigger `reviews_recompute_rating` |
| `requests` (insertion) | personne en direct → `submit_request()`, qui applique disponibilité + anti-spam |
| `reviews` (insertion) | personne en direct → `submit_review()`, qui exige une demande **confirmée** appartenant à l'auteur |
| `listing_reports` | personne en direct → `submit_report()` ; décisions → `review_report()` (admins) ; lecture admin → `admin_list_open_reports()` ; le signaleur ne relit que `id, listing_id, reason, details, created_at` |
| `suspended_at` | aucun rôle client — posée par un signalement urgent ou un retrait, levée par une décision « infondé » |

Les tests pgTAP (`security.test.sql`, `verification.test.sql`) verrouillent ces propriétés. **Les lancer après toute migration.**

---

## Tests

Trois niveaux, du plus rapide au plus complet :

| Niveau | Couvre | Prérequis |
|---|---|---|
| Vitest (81) | Logique pure : validation de l'URL, formatage, slugs | aucun |
| pgTAP (144) | RLS, GRANT de colonne, anti-spam, cloisonnement, vérification d'identité, signalements | `supabase start` |
| Playwright (32) | Parcours réels dans un navigateur | `supabase start` |

Les tests de bout en bout s'exécutent **contre la stack locale, jamais contre le projet distant** : ils créent des comptes, déposent des demandes et publient des annonces. Le port `3210` et un build de production sont utilisés, pour exercer le comportement réel (cache et Server Actions compris) plutôt que celui du serveur de développement.

```bash
supabase start && supabase db reset
npm run test:e2e
```

Le bucket `listings` doit exister en local :

```bash
curl -X POST http://127.0.0.1:54321/storage/v1/bucket \
  -H "apikey: $ANON_LOCAL" -H "Authorization: Bearer $SERVICE_LOCAL" \
  -H "Content-Type: application/json" \
  -d '{"id":"listings","name":"listings","public":true}'
```

Quatre écueils propres aux tests, tous coûteux à diagnostiquer :

- **Le fil est streamé dans un `<Suspense>`.** Compter les cartes sans attendre la disparition des squelettes donne zéro. `countCards()` attend (`helpers.ts`).
- **Next insère un `<div role="alert">`** (route announcer) sur chaque page : `getByRole("alert")` est ambigu. Nos messages sont des `<p role="alert">`, ciblés par `alertBox()`.
- **Le cache `unstable_cache` survit aux rebuilds** et sa clé ne porte pas l'environnement. Un build lancé sur le projet distant laisse des réponses que la suite locale resservirait. D'où le `rm -rf .next/cache` dans `webServer.command`.
- **`getByRole` fait une correspondance *partielle* sur `name`.** `{ name: "Mon compte" }` capture aussi `<h2>Supprimer mon compte</h2>`. Ancrer sur `level` ou `exact: true`.
- **Cliquer avant l'hydratation** soumet le formulaire en POST natif : le parcours aboutit, mais ce n'est pas celui qu'on mesure, et le résultat devient intermittent. `gotoReady()` attend brièvement `networkidle` (les préchargements RSC de `next/link` peuvent traîner plusieurs secondes après une navigation), puis attend que React ait hydraté `document.body` — c'est ce second signal, et non le délai, qui garantit qu'aucun clic ne part avant l'hydratation.

---

## Conformité et cycle de vie du compte

Trois droits s'exercent sans passer par un support :

| Parcours | Route |
|---|---|
| Mot de passe oublié | `/mot-de-passe-oublie` → e-mail → `/auth/callback` → `/mot-de-passe` |
| Export des données | `/api/mon-compte/export` (JSON en pièce jointe) |
| Suppression du compte | `/compte`, confirmation par saisie de l'adresse |

L'export lit **avec le client de session**, jamais avec `service_role` : le périmètre exporté est exactement celui que RLS autorise, une erreur de filtre ne peut donc pas faire fuiter les données d'autrui.

La suppression emprunte `service_role` (seule clé habilitée à `deleteUser`), sur la seule identité de la session en cours. Les cascades déclarées au schéma s'appliquent : les offres et les avis disparaissent — la note des annonces concernées est recalculée — tandis que les demandes sont conservées mais détachées (`author_id` passe à null), pour que le partenaire garde l'historique nécessaire à son activité.

Les pages `/cgu`, `/confidentialite` et `/mentions-legales` sont des **modèles** portant un avertissement visible et des mentions entre crochets à compléter. Elles ne remplacent pas une relecture juridique.

---

## Paiement mobile money (pawaPay)

Le Congo est couvert par deux opérateurs — `MTN_MOMO_COG` et `AIRTEL_COG` — en **XAF sans décimales**, ce qui coïncide avec `price_xaf` déjà stocké en entier : aucune conversion.

Deux propriétés tiennent tout le module, et les tests pgTAP les verrouillent :

**Le montant ne vient jamais du client.** `create_payment()` le lit sur l'annonce en base ; le formulaire ne transmet que l'opérateur et le numéro. L'insertion directe dans `payments` est révoquée, sinon il suffirait de poster `amount_xaf = 1`.

**Un client ne peut pas se déclarer payé.** `settle_payment()` n'est exécutable que par `service_role`. La transition d'état vient du callback, côté serveur.

Le callback ne fait pas confiance à son propre corps : il **reconfirme le statut auprès de l'API pawaPay** avec notre jeton avant d'écrire. pawaPay signe ses callbacks (RFC-9421, ECDSA P-256), mais la vérification suppose de l'activer dans leur tableau de bord ; en attendant, la reconfirmation rend un POST forgé sans effet.

`IN_RECONCILIATION` et `DUPLICATE_IGNORED` sont traités comme « en cours », jamais comme des échecs : conclure à l'échec ferait redemander de l'argent à un client peut-être déjà débité.

`payments.id` sert de `depositId` : c'est la clé d'idempotence côté pawaPay, un rejeu renvoie `DUPLICATE_IGNORED` au lieu de débiter deux fois.

**Reste à faire côté pawaPay** : renseigner `PAWAPAY_API_TOKEN`, déclarer l'URL de callback (`https://<domaine>/api/webhooks/pawapay`) dans leur tableau de bord, puis basculer `PAWAPAY_BASE_URL` sur la production.

---

## Pièges rencontrés

Chacun a coûté un bug réel pendant le développement. Ils sont listés ici pour qu'ils ne soient pas refaits.

### 1. Les policies RLS se combinent en OU

`listings_public_read` autorise la lecture de toute annonce publiée. Un partenaire authentifié bénéficie donc **aussi** de cette policy : une requête « mes annonces » sans filtre retourne tout le catalogue.

→ Toujours filtrer `owner_id` explicitement côté applicatif. Voir `app/partenaire/page.tsx`.

Le même piège s'applique en lecture d'une fiche à éditer : sans le filtre, le formulaire prérempli d'une annonce d'autrui s'ouvre — l'écriture échouerait, mais la fiche aurait déjà fuité.

### 2. `service_role` contourne RLS, mais pas les GRANT

Ce sont deux mécanismes indépendants. Une table nouvellement créée n'accorde aucun droit DML à `service_role` : sans `grant … to service_role` explicite, le webhook reçoit `permission denied`. Ne pas se fier aux privilèges par défaut, qui varient selon les versions de Supabase.

### 3. PostgREST renvoie 200 avec zéro ligne quand RLS bloque une écriture

Pas d'erreur. Sans précaution, l'interface affiche « Modifications enregistrées » sur une écriture entièrement refusée.

→ `.update(values, { count: "exact" })` puis tester `count === 0`. Voir `updateListing`.

### 4. Le schéma TypeScript peut être ignoré en silence

`postgrest-js` contraint les lignes à `Record<string, unknown>`. Deux conséquences :

- Une **`interface`** n'a pas d'index signature implicite et ne satisfait jamais cette contrainte. Le schéma doit utiliser des **alias de type**.
- `Relationships` est **obligatoire** sur chaque table.

Si l'un des deux manque, le client retombe sur un typage permissif — les `.eq()` ne sont plus vérifiés, les RPC sont typées `never` — **sans la moindre erreur de compilation**.

### 5. Les versions `@supabase/ssr` et `supabase-js` doivent concorder

`ssr@0.5.x` passe ses génériques dans l'ordre attendu par `supabase-js@~2.45`. Avec `2.112`, le `Schema` atterrit dans le mauvais slot et `rpc()` type ses arguments en `never`. Le plancher est fixé à `^2.111.0` dans `package.json` — ne pas l'abaisser.

### 6. Un module `"use server"` ne peut exporter que des fonctions async

Exporter une constante depuis un fichier `"use server"` la rend `undefined` côté client. C'est pourquoi `INITIAL_REQUEST_STATE`, `INITIAL_AUTH_STATE` et `INITIAL_LISTING_STATE` vivent dans `lib/`, hors des modules d'actions.

### 7. Une page qui lit `searchParams` ne peut pas être prérendue

En Next 15 sans PPR, `revalidate` au niveau route n'a aucun effet sur `/`.

→ Cacher **la requête**, pas la route : `unstable_cache` dans `lib/listings.ts`, étiquette `listings`, invalidée par `revalidateTag`. Invalider par chemin ne couvrirait pas les variantes `?city=…&price_max=…`.

Gain mesuré : 1,18 s → 13 ms sur l'accueil.

### 8. Le middleware s'exécute avant le cache

`updateSession` appelle `supabase.auth.getUser()`, soit un aller-retour réseau. Appliqué au catalogue public, il annule l'essentiel du bénéfice du cache.

→ Matcher restreint à `/partenaire`, `/admin`, `/connexion`. Le jeton de rafraîchissement étant longue durée, la session se renouvelle à l'arrivée sur l'espace partenaire.

### 9. Ne pas créer d'utilisateur par `insert into auth.users`

GoTrue lit `confirmation_token`, `email_change` et consorts comme des chaînes non-nullables : une ligne insérée à la main avec des `NULL` fait échouer l'API Admin en `500 Database error loading user`.

→ Utiliser `supabase.auth.admin.createUser()` ou le Dashboard. Les fixtures pgTAP mettent ces colonnes à `''`.

### 10. Un fond opaque sur `body` masque tout enfant en z-index négatif

`globals.css` donne un fond à `html`. Celui de `body` **ne se propage donc pas au canvas** : il se peint comme un fond de bloc ordinaire, au-dessus des descendants en z négatif.

Le halo d'ambiance de l'accueil est resté invisible pour cette raison, sans qu'aucune erreur ne le signale. Il est désormais empilé explicitement — `z-0` sous un contenu en `z-10` — plutôt qu'en `-z-10`.

→ Le seul moyen de voir ce genre de défaut est de **regarder la page**. Le typecheck, le build et les assertions sur le HTML le laissent passer intégralement.

### 11. Service worker : n'intercepter que le strict nécessaire

`public/sw.js` ne traite que les **GET same-origin**. Les Server Actions sont des POST vers la même URL et doivent passer intactes ; les payloads RSC (`?_rsc=`) ne sont jamais cachés — en servir un périmé casse la navigation.

### 12. Un écran de succès ne survit pas à une action qui masque la page

Après une Server Action, Next rafraîchit la route appelante. Le signalement urgent suspend le profil dans la même transaction : au rafraîchissement, `fetchListingBySlug` ne voit plus rien et `notFound()` remplace la confirmation. La confirmation vit donc sur sa propre route, `/signaler/merci`, vers laquelle l'action redirige.

---

## Avis et confiance

La note d'une annonce ne peut venir que d'un avis, et un avis ne peut venir que d'une prestation **réellement rendue** : `submit_review()` exige une `request` appartenant à l'appelant et passée en `confirmed` par le partenaire. C'est ce qui donne une suite au workflow de `requests`, qui s'arrêtait jusque-là à la confirmation.

Conséquence assumée : **une demande déposée en invité ne donne droit à aucun avis** — `requests.author_id` est nul, la paternité est donc inattribuable. C'est pourquoi le compte n'est plus étiqueté « partenaire » : un même compte Matripa sert de client (via `/mes-demandes`) et de partenaire (via `/partenaire`) selon qu'on dépose des demandes ou des offres.

`rating` reste fermé à tout rôle client. Seul le trigger `reviews_recompute_rating`, en `SECURITY DEFINER`, y écrit. Les annonces sans avis ont `rating = null` et l'interface masque alors les étoiles, plutôt que d'afficher une note que rien ne fonde.

---

## Vérification d'identité

Publier un profil exige un compte **vérifié** : une personne de l'équipe a contrôlé, sur un selfie vidéo, que le titulaire est **majeur** et correspond à ses photos. Le badge « Certifié » en est la conséquence ; il n'est plus attribuable à la main.

### Parcours

`/partenaire/verification` → `start_verification()` émet un code de 6 caractères valable 30 minutes → la personne se filme 15 s, pièce d'identité près du visage, en prononçant le code → le fichier part directement vers le bucket privé `verifications` → `submit_verification()` vérifie le code, le chemin et l'existence de l'objet → `/admin` : lecture sur URL signée de 5 minutes, quatre contrôles obligatoires, décision → la vidéo est supprimée.

### Cinq propriétés

**Le code vient de la base.** Un code choisi par le client permettrait de réutiliser une vidéo tournée à l'avance.

**Le délai de grâce s'applique à la lecture.** `listings_public_read` exige `is_verified or verification_grace_until > now()`. Au terme du délai, les annonces disparaissent sans tâche planifiée : rien ne peut tomber en panne et laisser des profils non vérifiés en ligne. `submit_request` reprend la même règle, puisqu'elle contourne RLS. `create_payment` aussi : une réservation sur une annonce masquée ou archivée ne peut plus être payée.

**Le trigger ne contraint que les rôles clients.** `listings_enforce_verification` est `SECURITY INVOKER` et teste `current_user in ('anon', 'authenticated')`. Les fonctions `SECURITY DEFINER` (qui s'exécutent sous le rôle propriétaire), `service_role`, les migrations et le seed passent — c'est ce qui permet à `review_verification` de propager `is_verified`.

**On garde le moins possible.** Ni numéro de pièce ni date de naissance. La vidéo est supprimée par l'API Storage juste après la décision : supprimer la ligne dans `storage.objects` laisserait le fichier en place. Si la suppression échoue, la décision reste acquise et `/admin` propose de purger.

**Décision et publication sont sérialisées par compte.** `review_verification` prend un verrou consultatif exclusif sur le compte ; le trigger `listings_enforce_verification` prend le même verrou en mode partagé, **à l'insertion seulement**, avant de lire le statut. Sans cela, une annonce insérée pendant une révocation pouvait hériter du badge et rester en ligne. Une mise à jour n'en a pas besoin : la décision modifie toutes les annonces du compte, une mise à jour concurrente attend donc déjà le verrou de ligne et le trigger reçoit la version écrite par la décision. Y prendre aussi le verrou consultatif, après le verrou de ligne, inverserait l'ordre suivi par `review_verification` (consultatif, puis lignes) et exposerait à un interblocage.

### Constat de minorité

« Signaler une personne mineure » — depuis la file d'examen comme depuis la liste des comptes vérifiés — archive toutes les annonces du compte et l'inscrit dans `verification_blocks`. Le compte ne peut plus demander de vérification.

Une révocation ne peut pas porter le motif « personne mineure » : ce constat passe obligatoirement par le blocage. Levée du blocage, en SQL uniquement :

```sql
delete from public.verification_blocks where user_id = '<uuid>';
```

Le partenaire peut alors recommencer une vérification depuis `/partenaire/verification`. L'interface lit le blocage dans `verification_blocks` (`is_verification_blocked()`), et non dans le motif du dernier rejet, qui reste dans l'historique.

### Suppression du compte

`deleteMyAccount` supprime le dossier `verifications/<uid>/` **avant** `deleteUser`. En cas d'échec, la suppression du compte est interrompue : on ne laisse pas de pièce d'identité orpheline.

---

## Signalements

Un compte connecté peut signaler un profil visible depuis sa fiche (« Signaler ce profil » → `/signaler/[slug]`). Cinq motifs : personne mineure présumée, contrainte ou exploitation, faux profil ou photos volées, arnaque, autre.

### Ce qui se passe

- **Motif urgent** (mineure, contrainte) : `submit_report` renseigne `listings.suspended_at` dans la même transaction. Le profil disparaît du catalogue — la policy `listings_public_read` exige `suspended_at is null` — et `submit_request` comme `create_payment` le refusent. L'équipe reçoit un e-mail (`REPORT_ALERT_EMAILS`), sans identité du signaleur ni précisions.
- **Autres motifs** : aucun effet immédiat ; le signalement attend dans `/admin`.
- **Pas de suivi** : le signaleur voit une confirmation, puis rien. Les GRANT de colonne l'empêchent de lire `status` et la note de décision.

### Anti-abus

Un signalement ouvert par compte et par profil, cinq par heure par compte, jamais sur son propre profil. Chaque décision est journalisée dans `moderation_log`. Un compte ne peut pas signaler deux fois le même profil : un signalement déjà ouvert ou déjà jugé infondé vaut refus, ce qui empêche de re-suspendre un profil après chaque décision.

**Ce que l'équipe examine est figé au signalement.** Le titre, la description et la couverture sont recopiés dans le signalement au moment de l'envoi : un partenaire qui modifie son profil suspendu pendant l'examen ne change pas ce que l'administrateur voit. Le titre courant est affiché à côté lorsqu'il diffère.

**Le profil suspendu ne peut pas être supprimé** (`listings_owner_delete` exige `suspended_at is null`), ni recevoir de demande ou de paiement. Un administrateur ne peut pas trancher un signalement visant son propre profil.

**Le compte lui-même ne peut pas être supprimé** tant qu'un de ses profils est suspendu ou visé par un signalement ouvert : `account_has_open_moderation()` bloque `deleteMyAccount`. Sans cela, la cascade `listings.owner_id` ferait disparaître le profil signalé et l'équipe n'aurait plus personne à bloquer.

### Décisions (`/admin`, en tête)

| Décision | Effet |
|---|---|
| Signalement infondé | Clos ; la suspension tombe si plus aucun autre signalement urgent n'est ouvert sur ce profil et que l'annonce n'est ni archivée ni déjà confirmée |
| Retirer le profil (note obligatoire) | Profil archivé et suspendu définitivement ; autres signalements du profil clos |
| Personne mineure : bloquer le compte | Tous les profils archivés et suspendus, compte inscrit dans `verification_blocks`, vérification révoquée ou rejetée, signalements du compte clos |

Le partenaire voit « Suspendu » sur son tableau de bord, sans motif ni signaleur. Republier ne lève pas la suspension : `suspended_at` est hors de ses droits d'écriture.

La confirmation du signaleur vit sur `/signaler/merci` : un motif urgent masque le profil aussitôt, donc la page de signalement elle-même devient introuvable.

### Configuration

`REPORT_ALERT_EMAILS` : adresses de l'équipe, séparées par des virgules. Sans elle (ou sans `RESEND_API_KEY` / `NOTIFY_EMAIL_FROM`), le signalement est enregistré et un avertissement est journalisé.

---

## Cache

| Route | Rendu | Cache |
|---|---|---|
| `/`, `/annonces/[slug]` | dynamique (`searchParams`) | requêtes mémoïsées, étiquette `listings`, TTL 300 s |
| `/sitemap.xml` | statique | ISR 1 h |
| `/partenaire`, `/admin` | dynamique | aucun |

Invalidation : les actions partenaire et admin appellent `revalidateTag`. Pour une modification faite **hors application** (SQL direct, dashboard) :

```bash
curl -X POST https://<domaine>/api/revalidate -H "x-matripa-signature: $REQUEST_WEBHOOK_SECRET"
```

---

## Notifications

`requests` (insert) → trigger → `pg_net` → `POST /api/webhooks/new-request` → e-mail au partenaire.

Le trigger ne transmet que `request_id` : le webhook relit les coordonnées avec la clé `service_role`. Une requête forgée ne peut donc pas injecter de fausses données, et aucune donnée personnelle ne stationne dans la file `pg_net`.

`pg_net` s'exécute dans le cloud Supabase : **le déclenchement ne fonctionne qu'une fois l'application déployée**. En local, appeler le webhook directement.

---

## Déploiement

**Région d'exécution : `fra1` (Francfort), fixée dans `vercel.json`.**

Par défaut Vercel exécute les fonctions à Washington (`iad1`) tandis que la base Supabase est en `eu-central-1`. L'en-tête `x-vercel-id` le montrait : `cpt1::iad1::…` — la requête entrait par l'edge du Cap puis repartait aux États-Unis avant d'interroger une base européenne. Soit un aller-retour transatlantique par requête, pour des utilisateurs congolais.

`fra1` place les fonctions à côté de la base ; le trafic reste Congo → Europe.

Reste que la latence vers l'edge Vercel depuis l'Afrique centrale est élevée et irrégulière (mesuré : 1,4 s à 12 s, avec des timeouts). Un domaine personnalisé derrière un CDN disposant de points de présence africains changerait le chemin réseau — c'est le levier suivant, et il dépasse la configuration Vercel.

### Procédure

1. `supabase db push` (ou appliquer `migrations/` puis `seed.sql`)

   La migration 0011 crée le bucket privé `verifications` et place toutes les annonces publiées en délai de grâce de 7 jours. La migration 0012 crée la table des signalements et ajoute `listings.suspended_at`. Renseigner `REPORT_ALERT_EMAILS`. **Sans `REPORT_ALERT_EMAILS` (ou sans `RESEND_API_KEY` / `NOTIFY_EMAIL_FROM`), un signalement urgent est bien enregistré et le profil masqué, mais aucune alerte n'est envoyée : seul un `console.warn` en garde la trace.**
2. Variables d'environnement — voir `.env.example`
3. Configurer le webhook :
   ```sql
   insert into private_config (key, value) values
     ('webhook_url',    'https://<domaine>/api/webhooks/new-request'),
     ('webhook_secret', '<REQUEST_WEBHOOK_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```
4. Se nommer administrateur :
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '<vous>';
   ```
5. Authentication → Providers → Email : activer le SMTP, ou désactiver la confirmation pour tester

---

## Non fait

- **Icônes PWA** : générées en JSX (`app/icons/[variant]/route.tsx`), à remplacer par le logo réel.
- **Visuels de démonstration** : dégradés abstraits, volontairement non photographiques.
- **Notification des administrateurs** : aucune alerte à l'arrivée d'une vérification ; le compteur de `/admin` fait foi. Brancher `lib/notifications.ts` si le volume le justifie.
- **Cache et setup E2E** : Playwright lance `next build` (serveur web) avant `globalSetup` (`db reset`). Des entrées `unstable_cache` créées pendant le build peuvent porter des identifiants d'annonces antérieurs au reset ; `demande.spec.ts` lancé seul peut donc échouer pendant 5 minutes. La suite complète le masque (un test antérieur purge l'étiquette).
