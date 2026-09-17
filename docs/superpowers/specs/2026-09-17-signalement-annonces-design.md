# Signalement d'annonces — conception

**Date** : 17 septembre 2026
**Statut** : validée, en attente de relecture de la spec
**Sous-projet** : 2/2 du chantier « Confiance et protection »
**Base** : branche `feat/verification-identite` (migration `0011_identity_verification.sql`), non fusionnée dans `main`

---

## 1. Objectif et périmètre

Permettre à un compte connecté de signaler une annonce, masquer immédiatement par précaution les annonces signalées pour un motif grave, alerter l'équipe, et donner aux administrateurs les moyens de trancher : infondé, retrait du profil, ou constat de minorité avec blocage du compte.

### Décisions validées

| Sujet | Décision |
|---|---|
| Qui signale | **Comptes connectés uniquement** ; un visiteur est redirigé vers la connexion puis ramené au formulaire |
| Motifs graves | `personne_mineure` et `contrainte_exploitation` : **masquage immédiat** + alerte e-mail |
| Suivi pour le signaleur | **Aucun** : écran de confirmation seulement |
| Masquage | Colonne `listings.suspended_at` intégrée à la visibilité publique |
| Alerte | Envoi direct via Resend après enregistrement, destinataires `REPORT_ALERT_EMAILS` |
| Anti-abus | Un signalement ouvert par compte et par annonce ; 5 signalements par heure par compte ; traçabilité |

### Hors périmètre

- Suivi du signalement par le signaleur, notification du résultat.
- Sanction automatique des signalements abusifs (ils sont tracés, la décision reste humaine).
- Signalement anonyme, signalement d'un compte (seules les annonces sont signalables).
- Transmission automatique aux autorités.

---

## 2. Modèle de données

Migration unique : `supabase/migrations/0012_listing_reports.sql`.

### 2.1 Types

```sql
create type public.report_reason as enum (
  'personne_mineure',
  'contrainte_exploitation',
  'faux_profil',
  'arnaque',
  'autre'
);

create type public.report_status as enum ('open', 'confirmed', 'dismissed');
```

### 2.2 Table `public.listing_reports`

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `listing_id` | `uuid` | → `listings` `on delete set null` (le signalement survit à l'annonce) |
| `owner_id` | `uuid` | → `auth.users` `on delete set null` ; propriétaire recopié à l'insertion |
| `reporter_id` | `uuid` | → `auth.users` `on delete set null` ; anonymisé si le signaleur supprime son compte |
| `reason` | `report_reason` not null | |
| `is_urgent` | `boolean` | colonne générée : `reason in ('personne_mineure', 'contrainte_exploitation')` |
| `details` | `text` | `char_length(details) <= 1000` |
| `status` | `report_status` not null | défaut `open` |
| `reviewed_by` | `uuid` | → `auth.users` `on delete set null` |
| `reviewed_at` | `timestamptz` | |
| `resolution_note` | `text` | `char_length <= 300` |
| `created_at` | `timestamptz` not null | `now()` |

Contraintes et index :

- `check (reason <> 'autre' or char_length(trim(coalesce(details, ''))) >= 10)`.
- Index unique partiel : `(reporter_id, listing_id) where status = 'open'`.
- Index de file : `(is_urgent desc, created_at) where status = 'open'`.
- Index `(reporter_id, created_at)` pour la limite horaire.

### 2.3 Droits sur `listing_reports`

- RLS activé.
- `listing_reports_self_read` : `select` si `reporter_id = auth.uid()` — seule policy de lecture.
- `revoke all … from anon, authenticated` ; `grant select (id, listing_id, reason, details, created_at) on public.listing_reports to authenticated` — le signaleur ne peut pas lire `status`, `resolution_note`, `owner_id` ni `reviewed_by` (aucun suivi, confidentialité du profil signalé).
- Aucune lecture directe pour l'administrateur : les GRANT de colonne s'appliquent au rôle et non à la ligne, une policy d'administration ne donnerait pas accès aux colonnes non accordées. L'administration passe par `admin_list_open_reports()` (voir 2.6 et 3.3).
- `grant select, insert, update, delete … to service_role`.

### 2.4 Suspension des annonces

- Nouvelle colonne `listings.suspended_at timestamptz` (nullable), hors des GRANT client.
- `listings_public_read` remplacée par :

```sql
using (
  status = 'published'
  and (is_verified or verification_grace_until > now())
  and suspended_at is null
)
```

- `submit_request` et `create_payment` (redéfinies avec `create or replace`, identiques à 0011) ajoutent `and suspended_at is null` à leur contrôle de visibilité.

### 2.5 Journal de modération

- Ajout de `moderation_log.report_id uuid` (sans clé étrangère, même raison que `verification_id`).
- Remplacement de la contrainte `moderation_log_single_target` par `check (num_nonnulls(review_id, verification_id, report_id) = 1)`.
- Remplacement de la contrainte de `action` (nom par défaut `moderation_log_action_check`, à vérifier dans la base avant `drop constraint`) par la liste étendue : `remove_review`, `approve`, `reject`, `block_minor`, `revoke`, `report_dismiss`, `report_remove`, `report_block_minor`.

### 2.6 Lecture administrateur

La section `/admin` lit les signalements via une fonction `SECURITY DEFINER` `admin_list_open_reports()` qui vérifie `is_admin()` et renvoie toutes les colonnes utiles des signalements ouverts, avec l'annonce jointe (titre, ville, couverture, extrait de description, `suspended_at`, `status`, `is_verified`, `verification_grace_until`) et le nombre de signalements ouverts par annonce.

---

## 3. Fonctions

Toutes : `SECURITY DEFINER`, `set search_path = public`, `revoke execute … from public, anon`, `grant execute … to authenticated`.

### 3.1 `submit_report(p_listing_id uuid, p_reason report_reason, p_details text) returns table (id uuid, is_urgent boolean)`

1. `auth.uid()` nul → `forbidden` (42501).
2. Annonce visible publiquement (même prédicat que 2.4) → sinon `listing_unavailable`.
3. `owner_id = auth.uid()` → `own_listing`.
4. Signalement ouvert existant pour (signaleur, annonce) → `already_reported`.
5. Au moins 5 signalements du compte dans la dernière heure, quelle que soit leur issue → `rate_limited`.
6. `p_reason = 'autre'` et précisions de moins de 10 caractères → `details_required` ; précisions de plus de 1 000 caractères → `details_too_long`.
7. Insertion (précisions : `nullif(trim(p_details), '')`, `owner_id` recopié).
8. Si urgent : `update listings set suspended_at = now() where id = p_listing_id and suspended_at is null`.
9. Retour de l'identifiant et de `is_urgent`.

### 3.2 `review_report(p_report_id uuid, p_decision text, p_note text default null) returns void`

1. `not is_admin()` → `forbidden`.
2. `p_decision ∈ {'dismiss', 'remove', 'block_minor'}` → sinon `invalid_decision`.
3. `select … for update` du signalement ; absent → `not_found` ; `status <> 'open'` → `already_reviewed`.
4. `remove` sans note → `note_required`.
5. Si `owner_id` non nul : `perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0))` (même clé que la vérification d'identité : sérialise avec les créations d'annonces).
6. Selon la décision :
   - `dismiss` : signalement `dismissed` ; si l'annonce existe et qu'aucun **autre** signalement urgent `open` ne la vise, `suspended_at = null`.
   - `remove` : signalement `confirmed` ; annonce (si elle existe) `status = 'archived'`, `suspended_at = coalesce(suspended_at, now())` ; les autres signalements `open` de la même annonce passent `confirmed` avec la même note.
   - `block_minor` : signalement `confirmed` ; si `owner_id` non nul :
     - toutes les annonces du propriétaire : `status = 'archived'`, `is_verified = false`, `verification_grace_until = null`, `suspended_at = coalesce(suspended_at, now())` ;
     - `insert into verification_blocks (user_id, verification_id, blocked_by) values (owner_id, null, auth.uid()) on conflict (user_id) do nothing` ;
     - demandes de vérification du propriétaire : `approved` → `revoked` avec `rejection_reason = 'personne_mineure'` ; `pending` → `rejected` avec `rejection_reason = 'personne_mineure'` ; `awaiting_video` → supprimées ;
     - tous les signalements `open` visant ses annonces passent `confirmed`.
     Si `owner_id` est nul (compte supprimé) : seule la clôture du signalement a lieu.
7. `reviewed_by`, `reviewed_at`, `resolution_note` (note nettoyée, `≤ 300`) sur chaque signalement clos.
8. Une ligne `moderation_log` pour le signalement traité : `report_id`, `moderator_id`, `action` (`report_dismiss` / `report_remove` / `report_block_minor`), `reason` = note.

### 3.3 `admin_list_open_reports() returns table (…)`

Vérifie `is_admin()` (sinon `forbidden`) et renvoie, pour chaque signalement `open`, trié `is_urgent desc, created_at asc` :
`id, reason, is_urgent, details, created_at, reporter_id, owner_id, listing_id, listing_title, listing_city, listing_cover_url, listing_description, listing_status, listing_suspended_at, listing_is_verified, listing_grace_until, open_reports_on_listing`.

---

## 4. Parcours de signalement

### 4.1 Entrée

- Fiche annonce `/annonces/[slug]` : lien discret « Signaler ce profil » sous les informations, vers `/signaler/[slug]`.
- Le middleware ajoute `"/signaler/:path*"` à son `matcher`.

### 4.2 Page `/signaler/[slug]` (dynamique)

- Session absente → `redirect('/connexion?suivant=/signaler/<slug>')`.
- Annonce lue avec le client public (RLS) ; invisible → `notFound()`.
- Propriétaire de l'annonce → message « Vous ne pouvez pas signaler votre propre profil. », sans formulaire.
- Rappel du profil : couverture, titre, ville.
- Formulaire (composant client `ReportForm`, `useActionState`) :
  - motifs en boutons radio, urgents en tête, chacun avec une phrase d'aide ; sous les urgents : « Le profil est masqué immédiatement, par précaution, pendant l'examen. » ;
  - « Précisions » (textarea, 1 000 caractères max, obligatoire pour « Autre ») ;
  - mention : « Chaque signalement est enregistré avec votre compte. Les signalements abusifs sont tracés. » ;
  - bouton « Envoyer le signalement ».
- Après succès : écran « Merci. Votre signalement a été transmis à l'équipe Matripa. » ; si urgent, ajouter « Si une personne est en danger immédiat, contactez sans attendre la police ou les services d'urgence. »

### 4.3 Server Action `submitReport` (`src/app/actions/reports.ts`)

1. Validation de forme (`isReportReason`, longueur des précisions) avant l'appel.
2. `submit_report` ; erreurs traduites par `reportErrorMessage` (`src/lib/reports.ts`).
3. Si urgent : `revalidateTag(LISTINGS_TAG)` puis `sendReportAlert` (`src/lib/notifications.ts`) vers les adresses de `REPORT_ALERT_EMAILS` (liste séparée par des virgules) : titre et ville du profil, libellé du motif, heure, lien `${NEXT_PUBLIC_SITE_URL}/admin`. **Ni identité du signaleur, ni précisions.** Échec ou configuration absente : `console.warn`/`console.error`, le signalement reste acquis.
4. État renvoyé : `{ status: 'success', urgent }` ou `{ status: 'error', message }`. État initial dans `src/lib/reports.ts`.

### 4.4 Côté partenaire

- `/partenaire` : pastille « Suspendu » (prioritaire sur « Masqué » et « En ligne ») pour `suspended_at` non nul.
- Bandeau dédié `SuspensionBanner` (distinct du bandeau de vérification, affiché au-dessus de lui) si au moins un profil suspendu : « Ce profil est suspendu le temps d'un examen par l'équipe Matripa. » / « N profils sont suspendus le temps d'un examen par l'équipe Matripa. » Ni motif ni signaleur.
- `ListingForm` : un profil suspendu reste modifiable ; la case « Publier » n'a aucun effet sur la suspension (aucune modification de l'interface nécessaire).

---

## 5. Administration

### 5.1 Section « Signalements » en tête de `/admin`

Composant serveur `AdminReportsSection` (appelé après la vérification `is_admin()` de la page) :

- données : `rpc('admin_list_open_reports')` ; e-mails du signaleur et du propriétaire via `service_role` (`auth.admin.getUserById`), lus côté serveur ; état de vérification du propriétaire : bloqué (`verification_blocks` lu via `service_role`), vérifié (`listing_is_verified`), en délai de grâce (`listing_grace_until > now()`), non vérifié ;
- en-tête : « N signalements ouverts, dont U urgents » ;
- carte par signalement : pastille du motif (rouge « Urgent » pour les motifs graves), date, précisions, rappel du profil (couverture, titre, ville, extrait, « Suspendu »), « N signalements ouverts sur ce profil », e-mail et état du propriétaire, e-mail du signaleur ; profil supprimé → « Profil supprimé ».

### 5.2 Décisions — composant client `ReportReview`

- « Signalement infondé » (note facultative) ;
- « Retirer le profil » (note obligatoire) ;
- « Personne mineure : bloquer le compte » : confirmation en deux étapes (« Confirmer le blocage »), note facultative ;
- champ note : `onKeyDown` qui empêche la soumission implicite par Entrée ;
- Server Action `reviewReport(prev, formData)` → `review_report` ; erreurs traduites ; `revalidatePath('/admin')`, `revalidateTag(LISTINGS_TAG)`.

---

## 6. Cycle de vie des données

- Export « Mon compte » (`/api/mon-compte/export`) : `signalements` = `listing_reports` du compte (`id, listing_id, reason, details, created_at`), lus avec le client de session.
- Suppression du compte signaleur : signalements conservés, `reporter_id` mis à null par la cascade.
- Suppression du compte propriétaire : annonces supprimées (cascade existante), signalements conservés avec `listing_id` et `owner_id` nuls.
- Politique de confidentialité : ajout du traitement « signalements » (données : motif, précisions, compte signaleur ; finalité : sécurité de la plateforme et protection des personnes ; accès : équipe de modération ; conservation : anonymisés à la suppression du compte signaleur).

---

## 7. Erreurs et cas limites

| Cas | Comportement |
|---|---|
| Doublon (même compte, même annonce, ouvert) | `already_reported` → « Vous avez déjà signalé ce profil. Il est en cours d'examen. » |
| Plus de 5 signalements en une heure | `rate_limited` → « Trop de signalements en peu de temps. Réessayez plus tard. » |
| Profil devenu invisible entre l'affichage et l'envoi | `listing_unavailable` → « Ce profil n'est plus disponible. » |
| Plusieurs signalements urgents, un seul jugé infondé | La suspension reste tant qu'un autre urgent est ouvert |
| Suspension + approbation de la vérification | Badge rétabli, profil toujours masqué |
| Blocage pendant une création d'annonce | Verrou par compte : la création attend, puis échoue (compte non vérifié) ou est archivée |
| Compte bloqué qui crée une annonce | Publication impossible (vérification impossible) |
| Double traitement par deux administrateurs | `already_reviewed` → « Ce signalement a déjà été traité. » + rechargement |
| `REPORT_ALERT_EMAILS` ou `RESEND_API_KEY` absents | Avertissement journalisé, signalement enregistré |

---

## 8. Tests

### 8.1 pgTAP — `supabase/tests/reports.test.sql`

- `anon` ne peut pas appeler `submit_report` ; insertion directe refusée pour `authenticated`.
- Un compte signale une annonce visible ; pas sa propre annonce (`own_listing`) ; doublon (`already_reported`) ; 6ᵉ en une heure (`rate_limited`) ; « autre » sans précisions (`details_required`).
- Motif urgent : `suspended_at` renseigné, annonce invisible pour `anon` ; motif non urgent : pas de suspension.
- Le partenaire ne peut pas modifier `suspended_at` (42501) ; brouillon puis republication : toujours invisible.
- `submit_request` et `create_payment` refusent une annonce suspendue (`listing_unavailable`).
- Le signaleur relit `reason` de son signalement mais pas `status` (42501) ; un tiers ne lit rien.
- Non-admin : `review_report` et `admin_list_open_reports` → `forbidden`.
- `dismiss` : suspension levée s'il ne reste aucun urgent ouvert ; maintenue sinon.
- `remove` sans note → `note_required` ; avec note : annonce archivée, suspendue, autres signalements clos.
- `block_minor` : annonces du propriétaire archivées et suspendues, ligne `verification_blocks`, vérification approuvée → `revoked`, `start_verification` → `blocked` pour le propriétaire.
- Double traitement → `already_reviewed` ; chaque décision journalisée.

### 8.2 Vitest — `src/lib/reports.test.ts`

Libellés et aides des motifs, `isUrgentReason`, `isReportReason`, validation des précisions (limites incluses), traduction des erreurs (codes connus, inconnus, noms de propriétés héritées).

### 8.3 Playwright — `e2e/signalement.spec.ts`

1. Visiteur non connecté sur `/signaler/<slug>` → connexion → retour au formulaire.
2. Signalement urgent sur un profil publié par un partenaire vérifié → confirmation, profil absent du catalogue, pastille « Suspendu » chez le partenaire.
3. Administrateur : « Signalement infondé » → profil de retour au catalogue.

---

## 9. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/0012_listing_reports.sql` | nouveau |
| `supabase/tests/reports.test.sql` | nouveau |
| `src/types/reports.ts` | nouveau (motifs, libellés, statuts) |
| `src/types/database.ts` | modifié |
| `src/lib/reports.ts` (+ `.test.ts`) | nouveau |
| `src/lib/notifications.ts` | modifié (`sendReportAlert`) |
| `src/app/actions/reports.ts` | nouveau (`submitReport`, `reviewReport`) |
| `src/app/signaler/[slug]/page.tsx` | nouveau |
| `src/components/reports/ReportForm.tsx` | nouveau |
| `src/components/reports/ReportReview.tsx` | nouveau |
| `src/components/reports/AdminReportsSection.tsx` | nouveau |
| `src/app/annonces/[slug]/page.tsx` | modifié (lien) |
| `src/middleware.ts` | modifié (`matcher`) |
| `src/components/reports/SuspensionBanner.tsx` | nouveau (bandeau « Suspendu ») |
| `src/app/partenaire/page.tsx` | modifié (pastille « Suspendu », bandeau) |
| `src/app/admin/page.tsx` | modifié (section en tête) |
| `src/app/api/mon-compte/export/route.ts` | modifié |
| `src/app/confidentialite/page.tsx` | modifié |
| `e2e/signalement.spec.ts` (+ helpers si nécessaire) | nouveau |
| `README.md` | section « Signalements », variables `REPORT_ALERT_EMAILS`, compteurs de tests |
