# Vérification d'identité par selfie vidéo — conception

**Date** : 16 septembre 2026
**Statut** : validée, en attente de relecture de la spec
**Sous-projet** : 1/2 du chantier « Confiance et protection » (le 2 étant le signalement d'annonces)

---

## 1. Objectif et périmètre

Garantir que toute annonce visible publiquement est publiée par une personne **majeure** dont l'**identité** a été contrôlée par un humain, et que le badge « Vérifié » atteste un contrôle réellement effectué.

État actuel constaté :

- `is_verified` est une bascule manuelle dans `/admin` (migration 0005) : aucune preuve n'est exigée.
- Les CGU réservent la plateforme aux majeurs, mais rien ne contrôle l'âge des publiants.
- Les 15 annonces du seed portent `is_verified = true` et la mention « Profil vérifié » sans propriétaire ni vérification.

### Décisions validées

| Sujet | Décision |
|---|---|
| Caractère | **Obligatoire** avant publication |
| Granularité | Vérification du **compte**, héritée par toutes ses annonces |
| Preuve | Vidéo ≤ 15 s : visage + pièce d'identité tenue près du visage (date de naissance lisible) + code à usage unique prononcé |
| Annonces existantes | **Délai de grâce de 7 jours**, puis masquage automatique |
| Capture | Champ fichier natif `capture="user"` (pas de `MediaRecorder`) |
| Délai de grâce | Appliqué **à la lecture** par RLS, sans tâche planifiée |
| Rétention | Vidéo **supprimée dès la décision** ; ni numéro de pièce ni date de naissance stockés |

### Hors périmètre

- Notification e-mail des administrateurs à chaque nouvelle demande (compteur dans `/admin` uniquement).
- Vérification automatisée (OCR, reconnaissance faciale).
- Signalement d'annonces (sous-projet 2).

---

## 2. Modèle de données

### 2.1 Types

```sql
create type verification_status as enum (
  'awaiting_video',  -- code émis, vidéo pas encore soumise
  'pending',         -- vidéo soumise, en attente d'examen
  'approved',
  'rejected',
  'revoked'          -- approbation retirée a posteriori
);

create type verification_document as enum ('cni', 'passeport', 'carte_consulaire');

create type verification_rejection as enum (
  'video_illisible',
  'piece_non_visible',
  'code_absent_ou_faux',
  'personne_differente',
  'personne_mineure'
);
```

### 2.2 Table `public.verification_requests`

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` ; sert de nom de fichier |
| `user_id` | `uuid` not null | → `auth.users` `on delete cascade` |
| `status` | `verification_status` not null | défaut `awaiting_video` |
| `challenge_code` | `text` not null | 6 caractères, alphabet sans ambiguïté (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), généré en base |
| `code_expires_at` | `timestamptz` not null | `now() + interval '30 minutes'` |
| `document_type` | `verification_document` | renseigné à la soumission |
| `video_path` | `text` | `<user_id>/<id>.<ext>` ; mis à `null` après suppression du fichier |
| `submitted_at` | `timestamptz` | |
| `reviewed_by` | `uuid` | → `auth.users` `on delete set null` |
| `reviewed_at` | `timestamptz` | |
| `rejection_reason` | `verification_rejection` | obligatoire si `rejected` |
| `rejection_note` | `text` | complément libre, ≤ 300 caractères |
| `created_at` | `timestamptz` not null | `now()` |

Contraintes :

- Index unique partiel : une seule demande **en cours** par compte — `unique (user_id) where status in ('awaiting_video', 'pending')`.
- Index unique partiel : une seule approbation active — `unique (user_id) where status = 'approved'`.
- `check (status <> 'rejected' or rejection_reason is not null)`.

### 2.3 Table `public.verification_blocks`

Comptes interdits de vérification après constat de minorité.

| Colonne | Type |
|---|---|
| `user_id` | `uuid` PK → `auth.users` `on delete cascade` |
| `verification_id` | `uuid` → `verification_requests` |
| `blocked_by` | `uuid` → `auth.users` `on delete set null` |
| `created_at` | `timestamptz` |

Aucun droit pour `anon` / `authenticated`. Levée du blocage : SQL manuel par un administrateur.

### 2.4 Fonction utilitaire

`public.is_account_verified(p_user_id uuid) returns boolean` — `SECURITY DEFINER`, `stable` : existence d'une ligne `approved` pour ce compte.

### 2.5 Modifications de `public.listings`

- Nouvelle colonne `verification_grace_until timestamptz` (nullable).
- `is_verified` : **plus aucune écriture manuelle**. Sa valeur est dérivée du compte propriétaire.
- `set_listing_certification` : le paramètre `p_is_verified` est ignoré (seul `is_vip` reste modifiable par l'admin). La bascule « Vérifié » disparaît de `/admin`.

### 2.6 Migration des données existantes

Dans la migration `0010_identity_verification.sql` :

1. `update listings set is_verified = false` — aucun badge existant ne repose sur une vérification.
2. `update listings set verification_grace_until = now() + interval '7 days' where status = 'published'` — y compris les annonces sans propriétaire, qui ne pourront jamais être vérifiées et seront donc masquées au 8ᵉ jour.

### 2.7 Élargissement de `public.moderation_log`

- `review_id` devient nullable.
- Ajout de `verification_id uuid` et `action text` (`approve`, `reject`, `revoke`, `block_minor`, `remove_review`).
- `check (num_nonnulls(review_id, verification_id) = 1)`.

---

## 3. Règles de sécurité

### 3.1 Visibilité publique

`listings_public_read` est remplacée par :

```sql
using (
  status = 'published'
  and (is_verified or verification_grace_until > now())
)
```

Les policies `listings_owner_read` et `listings_admin_read` sont inchangées : le propriétaire et l'admin voient toujours les annonces masquées (rappel piège n° 1 : les policies se combinent en OU).

### 3.2 Trigger `listings_enforce_verification` (before insert or update)

Fonction **`SECURITY INVOKER`** : `current_user` reflète donc l'appelant réel. Le trigger ne s'applique **que si `current_user in ('anon', 'authenticated')`** ; il laisse passer `service_role`, `postgres` (migrations, seed) et les fonctions `SECURITY DEFINER` (`review_verification`, `reviews_recompute_rating`), qui s'exécutent sous le rôle propriétaire.

Pour les rôles clients :

- **Insert** : `new.is_verified := is_account_verified(new.owner_id)` ; `new.verification_grace_until := null`.
- **Update** : `new.is_verified := old.is_verified` ; `new.verification_grace_until := old.verification_grace_until`.
- Si `new.status = 'published'` et `not new.is_verified` :
  - autorisé seulement si `TG_OP = 'UPDATE'`, `old.status = 'published'` et `old.verification_grace_until > now()` ;
  - sinon `raise exception 'verification_required' using errcode = 'P0001'`.

### 3.3 Droits sur `verification_requests`

- RLS activé.
- `verification_requests_self_read` : `select` si `user_id = auth.uid()`.
- `verification_requests_admin_read` : `select` si `is_admin()`.
- `revoke all … from anon, authenticated` ; `grant select … to authenticated` ; `grant select, insert, update, delete … to service_role` (piège n° 2).
- Aucune écriture directe : tout passe par les fonctions ci-dessous.

### 3.4 Fonctions `SECURITY DEFINER`

Toutes : `set search_path = public`, `grant execute … to authenticated`.

**`start_verification() returns table (id uuid, challenge_code text, code_expires_at timestamptz)`**

1. `auth.uid()` nul → `forbidden`.
2. Compte présent dans `verification_blocks` → `blocked`.
3. Compte déjà `approved` → `already_verified`.
4. Demande `pending` existante → `already_pending`.
5. Demande `awaiting_video` existante → **supprimée** (son éventuel fichier devient orphelin et sera purgé, § 5.4).
6. Insertion d'une nouvelle demande et retour de l'id et du code.

**`submit_verification(p_id uuid, p_document verification_document, p_video_path text) returns void`**

1. La demande appartient à `auth.uid()` et est `awaiting_video`, sinon `not_found`.
2. `code_expires_at < now()` → `code_expired`.
3. `p_video_path` doit valoir `auth.uid() || '/' || p_id || '.' || <ext>` avec `ext ∈ {mp4, mov, webm, 3gp}` → sinon `invalid_path`.
4. Existence d'une ligne dans `storage.objects` (`bucket_id = 'verifications'`, `name = p_video_path`) → sinon `video_missing`.
5. `status = 'pending'`, `document_type`, `video_path`, `submitted_at = now()`.

**`review_verification(p_id uuid, p_decision text, p_reason verification_rejection default null, p_note text default null) returns text`**

Retourne le `video_path` à supprimer (ou `null`).

1. `not is_admin()` → `forbidden`.
2. `p_decision ∈ {'approve', 'reject', 'block_minor', 'revoke'}` sinon `invalid_decision`.
3. `approve`, `reject`, `block_minor` exigent `status = 'pending'` ; `revoke` exige `status = 'approved'` ; sinon `already_reviewed`.
4. `reject` et `revoke` exigent `p_reason` (pour `revoke`, `p_note` obligatoire et `p_reason` facultatif) → sinon `reason_required`.
5. Selon la décision :
   - `approve` : `status = 'approved'` ; `update listings set is_verified = true, verification_grace_until = null where owner_id = user_id`.
   - `reject` : `status = 'rejected'`, motif et note.
   - `block_minor` : `status = 'rejected'`, `rejection_reason = 'personne_mineure'` ; insertion dans `verification_blocks` ; `update listings set status = 'archived', is_verified = false, verification_grace_until = null where owner_id = user_id`.
   - `revoke` : `status = 'revoked'`, note ; `update listings set is_verified = false where owner_id = user_id`.
6. `reviewed_by = auth.uid()`, `reviewed_at = now()`.
7. Insertion dans `moderation_log`.
8. Retour de `video_path`.

**`clear_verification_video(p_id uuid) returns void`** — `is_admin()` requis ; met `video_path = null`. Appelée par la Server Action **après** suppression effective du fichier.

### 3.5 Bucket `verifications`

- Privé (`public = false`), `file_size_limit = 52428800` (50 Mo), `allowed_mime_types = {video/mp4, video/quicktime, video/webm, video/3gpp}`.
- Créé par la migration (`insert into storage.buckets … on conflict do nothing`).
- Policies sur `storage.objects` :
  - `verifications_owner_insert` : `to authenticated`, `bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text`.
  - `verifications_admin_read` : `select` si `bucket_id = 'verifications' and is_admin()`.
  - Aucune policy `update` ni `delete` : le dépôt est définitif pour le client (pas d'`upsert`).
- Suppression uniquement via l'API Storage avec `service_role` (supprimer la ligne SQL laisserait le fichier).

---

## 4. Parcours partenaire

### 4.1 Route `/partenaire/verification`

Server Component lisant la dernière demande du compte (`order by created_at desc limit 1`) et `verification_blocks` via `is_account_verified` / statut. Rendu selon l'état :

| État | Affichage |
|---|---|
| Aucune demande, ou `rejected` | Explication (pourquoi, données conservées, suppression de la vidéo). Motif du rejet si applicable, formulé pour le partenaire. Bouton « Commencer » → `startVerification`. |
| `awaiting_video`, code valide | Code en très grand ; consignes ; sélecteur de pièce ; composant client `VerificationUpload`. |
| `awaiting_video`, code expiré | « Ce code a expiré » + bouton « Obtenir un nouveau code ». |
| `pending` | « Vérification en cours d'examen » + date d'envoi. |
| `approved` | Confirmation + date de validation. |
| `revoked` | Motif (note) + « Recommencer ». |
| Bloqué | Message neutre : « La vérification n'est pas disponible pour ce compte. Contactez le support. » |

Consignes affichées :

1. Filmez-vous de face, dans un endroit bien éclairé.
2. Tenez votre pièce d'identité à côté de votre visage, date de naissance lisible.
3. Prononcez distinctement le code affiché.
4. 15 secondes suffisent.

### 4.2 Composant client `VerificationUpload`

- `<input type="file" accept="video/*" capture="user">`.
- Validation locale via `lib/verification.ts` (logique pure) :
  - type MIME dans la liste autorisée ;
  - taille ≤ 50 Mo ;
  - durée ≤ 20 s, lue par un `<video preload="metadata">` hors DOM sur un `URL.createObjectURL` (révoqué ensuite). Durée illisible → acceptée (certains Android ne l'exposent pas), la limite serveur de taille reste active.
- Envoi : `supabase.storage.from('verifications').upload(path, file, { upsert: false, contentType })` avec le client navigateur, puis Server Action `submitVerification(id, document, path)`.
- Pendant l'envoi : bouton désactivé, libellé « Envoi en cours… ».
- Échec réseau du dépôt : « Réessayer » réutilise le `File` en mémoire.
- Dépôt réussi mais soumission échouée : au rechargement, la page détecte l'objet existant (listing du dossier via la Server Action `findUploadedVideo`, exécutée avec `service_role` et limitée au dossier `auth.uid()`) et affiche « Finaliser l'envoi ».
- Conflit « objet déjà existant » au dépôt : traité comme un succès du dépôt, on passe directement à la soumission.

### 4.3 Server Actions — `app/actions/verification.ts`

- `startVerification()` → `start_verification`, `redirect('/partenaire/verification')`.
- `submitVerification(id, document, path)` → `submit_verification` ; traduit `code_expired`, `video_missing`, `invalid_path`, `not_found` en messages.
- `findUploadedVideo(id)` → décrit ci-dessus.

Les états initiaux (`INITIAL_VERIFICATION_STATE`) vivent dans `lib/verification.ts` (piège n° 6).

### 4.4 Intégrations

- **`/partenaire`** : bandeau si non vérifié. Variantes :
  - annonces en délai de grâce : « Vos N annonces seront masquées le <date> sans vérification. » (date = plus petite `verification_grace_until` future) ;
  - demande `pending` : « Vérification en cours d'examen. » ;
  - sinon : « Vérifiez votre identité pour publier. »
- **`ListingForm`** : si non vérifié, la case « Publier » est désactivée avec explication et lien. Exception : annonce déjà publiée en délai de grâce (case cochée, active).
- **`actions/listings.ts`** : erreur Postgres `verification_required` → message « Vérifiez votre identité avant de publier » + lien, au lieu de l'erreur générique.
- **`actions/account.ts`** : avant `deleteUser`, lister et supprimer `verifications/<uid>/*` avec `service_role`. Échec → la suppression du compte est interrompue et un message d'erreur affiché (on ne supprime pas un compte en laissant une pièce d'identité orpheline).
- **`/api/mon-compte/export`** : ajout de `verification_requests` (sans `challenge_code`), lu avec le client de session.

---

## 5. Parcours administrateur

### 5.1 Section « Vérifications d'identité » en tête de `/admin`

- Compteur de demandes `pending` dans l'en-tête.
- File triée par `submitted_at` croissant.
- Chaque carte :
  - e-mail du compte (lu avec `service_role` via `auth.admin.getUserById`, côté serveur uniquement) ;
  - date d'envoi, type de pièce ;
  - code attendu en grand ;
  - vignettes `cover_url` des annonces du compte ;
  - bouton « Voir la vidéo » : Server Action `getVerificationVideoUrl(id)` → `is_admin` revérifié → `createSignedUrl(path, 300)` ; le lecteur est monté seulement à ce moment.

### 5.2 Décisions — composant client `VerificationReview`

- **Approuver** : désactivé tant que les 4 cases ne sont pas cochées :
  - le visage correspond aux photos des annonces ;
  - la pièce est lisible et paraît authentique ;
  - la date de naissance indique 18 ans ou plus ;
  - le code prononcé est le bon.
  La Server Action `reviewVerification` revérifie la présence des 4 champs cochés dans le `FormData`.
- **Rejeter** : motif obligatoire (liste `verification_rejection` hors `personne_mineure`), note facultative.
- **Signaler une personne mineure** : confirmation en deux étapes dans le composant (pas de `window.confirm`), décision `block_minor`.

### 5.3 Après chaque décision (Server Action)

1. `review_verification` → `video_path`.
2. Si `video_path` : suppression Storage avec `service_role`, puis `clear_verification_video`.
3. Échec de suppression : `console.error`, la décision est conservée.
4. `revalidatePath('/admin')`, `revalidateTag(LISTINGS_TAG)`.

### 5.4 Purge

Bloc « N vidéos à purger » affiché si N > 0, où N compte :

- demandes `approved` / `rejected` / `revoked` avec `video_path` non nul ;
- fichiers du bucket sans demande `pending` correspondante et âgés de plus de 24 h (dépôts abandonnés, demandes `awaiting_video` supprimées par `start_verification`).

Bouton « Purger » → Server Action `purgeVerificationVideos` (`is_admin` + `service_role`).

### 5.5 Comptes vérifiés

Liste paginée (20 par page) des demandes `approved` : e-mail, date, bouton « Révoquer » avec note obligatoire → décision `revoke`.

---

## 6. Erreurs et cas limites

| Cas | Comportement |
|---|---|
| Dépôt OK, soumission KO | Reste `awaiting_video` ; « Finaliser l'envoi » au rechargement |
| Code expiré à la soumission | `code_expired` → nouveau code proposé ; il faut refilmer |
| Suppression de vidéo KO après décision | Décision conservée ; visible dans la purge |
| Deux admins sur la même demande | `already_reviewed` → rafraîchissement de la page |
| Compte bloqué relance | `blocked` → message neutre |
| Publication sans vérification (formulaire périmé, requête forgée) | Trigger → `verification_required` → message clair |
| Annonce en grâce repassée en brouillon puis republiée | Refusée (`old.status` n'est plus `published`) |
| Suppression de compte avec vidéo | Fichiers supprimés avant `deleteUser` ; échec → suppression interrompue |
| Durée vidéo illisible côté navigateur | Acceptée ; limite de 50 Mo appliquée par le bucket |

---

## 7. Seed

- Toutes les annonces : `is_verified = false`.
- Suppression de la mention « Profil vérifié » des descriptions.
- Les annonces du seed restant sans propriétaire, elles ne sont visibles qu'en délai de grâce : le seed fixe `verification_grace_until = now() + interval '7 days'` pour que la stack locale affiche un catalogue après `db reset`.

---

## 8. Tests

### 8.1 pgTAP — `supabase/tests/verification.test.sql`

- `authenticated` ne peut ni `insert`, ni `update`, ni `delete` sur `verification_requests`.
- Un compte ne lit pas la demande d'un autre.
- Un compte ne lit pas l'objet Storage d'un autre ; un compte ne lit pas son propre objet.
- Un compte ne dépose pas hors de son dossier.
- `review_verification` refusée à un non-admin.
- `submit_verification` : `code_expired`, `video_missing`, `invalid_path`.
- Publication refusée sans vérification (`verification_required`).
- Annonce en grâce visible par `anon` ; invisible après recalage de `verification_grace_until` dans le passé.
- Écriture directe de `is_verified` par le propriétaire sans effet.
- `approve` propage `is_verified = true` ; `revoke` propage `false` ; nouvelle annonce d'un compte vérifié → `is_verified = true`.
- `block_minor` archive les annonces et `start_verification` renvoie ensuite `blocked`.
- Double examen → `already_reviewed`.
- Mise à jour des tests existants de `security.test.sql` touchés par le changement de `listings_public_read` et de `set_listing_certification`.

### 8.2 Vitest — `lib/verification.test.ts`

- Validation fichier : type, taille, durée (limites incluses et dépassées, durée inconnue).
- Construction et validation du chemin `<uid>/<id>.<ext>`.
- Traduction des codes d'erreur Postgres en messages.
- Libellés des motifs de rejet.

### 8.3 Playwright — `e2e/verification.spec.ts`

- `global-setup.ts` : création d'un compte administrateur via `auth.admin.createUser` + insertion dans `admins` (service_role local).
- Fixture : vidéo MP4 de 2 s, < 200 Ko, dans `e2e/fixtures/`.
- Parcours :
  1. Partenaire non vérifié : case « Publier » désactivée, bandeau visible.
  2. Dépôt complet → état « en cours d'examen ».
  3. Admin : approbation (4 cases) → badge « Vérifié » sur la fiche publique ; `video_path` nul.
  4. Admin : rejet avec motif → motif affiché au partenaire.
  5. Page `/admin` toujours invisible pour un non-admin (existant).
- Le bucket `verifications` est créé par la migration : pas d'étape `curl` supplémentaire.

---

## 9. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/0010_identity_verification.sql` | nouveau |
| `supabase/tests/verification.test.sql` | nouveau |
| `supabase/tests/security.test.sql` | modifié |
| `supabase/seed.sql` | modifié |
| `src/lib/verification.ts` (+ `.test.ts`) | nouveau |
| `src/app/actions/verification.ts` | nouveau |
| `src/app/actions/admin.ts` | modifié (revue, URL signée, purge, retrait bascule Vérifié) |
| `src/app/actions/listings.ts` | modifié (erreur `verification_required`) |
| `src/app/actions/account.ts` | modifié (purge avant suppression) |
| `src/app/api/mon-compte/export/route.ts` | modifié |
| `src/app/partenaire/verification/page.tsx` | nouveau |
| `src/components/verification/VerificationUpload.tsx` | nouveau |
| `src/components/verification/VerificationReview.tsx` | nouveau |
| `src/components/verification/VerificationBanner.tsx` | nouveau |
| `src/app/partenaire/page.tsx` | modifié (bandeau) |
| `src/components/partner/ListingForm.tsx` | modifié (case Publier) |
| `src/app/admin/page.tsx` | modifié |
| `src/types/database.ts` | modifié (table, enums, RPC) |
| `e2e/global-setup.ts`, `e2e/verification.spec.ts`, `e2e/fixtures/selfie.mp4` | modifié / nouveau |
| `README.md` | section « Vérification d'identité », mise à jour « Modèle de sécurité », « Tests », « Non fait » |
