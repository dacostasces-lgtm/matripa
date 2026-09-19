# Messagerie intégrée — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le formulaire de demande par une messagerie temps réel entre client et partenaire, sans casser avis, paiements, notifications ni export RGPD.

**Architecture:** La conversation *est* une ligne de `public.requests` (une par profil et par client) ; les messages vivent dans une nouvelle table `public.messages`, écrite exclusivement par des fonctions `security definer` qui contrôlent participation, état et débit. Le client Next.js lit via RLS, écrit via Server Actions, et reçoit les nouveaux messages par Supabase Realtime (`postgres_changes`), avec rattrapage à la reconnexion.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Tailwind CSS v4, Supabase (Postgres, RLS, Realtime, `@supabase/ssr`), Vitest, pgTAP (`supabase test db`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-messagerie-design.md`

## Global Constraints

- Tout texte visible par l'utilisateur est en français, au vouvoiement.
- Aucune nouvelle dépendance npm.
- Migrations numérotées `0015` et `0016` (`0011` et `0012` sont réservées à la PR n°1, `0013` et `0014` existent).
- Message : 1 à 2 000 caractères après suppression des espaces de bord. Pseudonyme : 2 à 30 caractères.
- Débit : 10 nouvelles conversations par heure et par compte ; 30 messages par 5 minutes et par compte.
- Jamais de contenu de message dans une notification, un titre d'onglet ou des métadonnées.
- Fuseau d'affichage des dates : `Africa/Brazzaville`.
- Codes d'erreur des fonctions SQL (texte exact de l'exception) : `authentication_required`, `invalid_body`, `display_name_required`, `listing_unavailable`, `own_listing`, `not_participant`, `rate_limited`, `conversation_closed`, `conversation_confirmed`.
- Aucune commande `supabase db push` vers la production dans les tâches 1 à 11 : uniquement la base locale (`supabase migration up --local`, `supabase test db`, `npx playwright test`). La production est traitée à la tâche 12, par Tricia.
- Commandes de vérification : `npx tsc --noEmit`, `npx vitest run`, `supabase test db`, `npx playwright test`, `npm run build`.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0015_messagerie_schema.sql` | `requests` devient conversation ; tables `messages` et `profiles` ; droits ; temps réel ; retrait du formulaire anonyme et de WhatsApp |
| `supabase/migrations/0016_messagerie_fonctions.sql` | `start_conversation`, `send_message`, `mark_conversation_read`, `close_conversation`, `list_conversations`, `unread_message_count` |
| `supabase/tests/messagerie_schema.test.sql`, `supabase/tests/messagerie_fonctions.test.sql` | Tests pgTAP |
| `src/lib/messages.ts` (+ test) | Logique pure : validation, messages d'erreur, fusion, regroupement par jour, formats de date, raison de lecture seule |
| `src/types/database.ts` | Types des nouvelles tables et fonctions |
| `src/lib/notifications.ts`, `src/app/api/webhooks/new-request/route.ts` | Alerte « nouveau message » sans contenu |
| `src/app/api/mon-compte/export/route.ts` | Export : messages et pseudonyme |
| `src/app/actions/messages.ts` | Server Actions de la messagerie |
| `src/app/messages/page.tsx` | Liste des conversations |
| `src/app/messages/nouveau/[slug]/page.tsx`, `src/components/messages/NewConversationForm.tsx` | Premier message |
| `src/app/messages/[id]/page.tsx`, `src/components/messages/ConversationThread.tsx`, `src/components/messages/ConversationActions.tsx`, `src/components/payments/PaymentStatus.tsx` | Fil de discussion |
| `src/components/messages/useUnreadCount.ts`, `src/components/ui/NavigationBar.tsx` | Onglet Messages et pastille |
| Fiche rapide, fiche complète, bandeau mobile, carte, stories, formulaire partenaire, tableau de bord | Bouton « Écrire », retrait de WhatsApp |
| `e2e/*` | Parcours réécrits sur la messagerie |

---

### Task 1: Schéma de la messagerie (migration 0015)

**Files:**
- Create: `supabase/migrations/0015_messagerie_schema.sql`
- Test: `supabase/tests/messagerie_schema.test.sql`

**Interfaces:**
- Produces : tables `public.messages (id, request_id, sender_id, body, created_at)` et `public.profiles (user_id, display_name, created_at)` ; colonnes `requests.last_message_at`, `requests.author_last_read_at`, `requests.owner_last_read_at` ; fonction `public.conversation_role(p_request_id uuid) returns text` (`'client'`, `'partner'` ou `null`), exécutable par `authenticated`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `supabase/tests/messagerie_schema.test.sql` :

```sql
-- Messagerie : tables et droits (migration 0015).
-- Exécution : supabase test db   (base locale, `supabase start`)

begin;
select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
) values (
  '0c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'client@test.cg', 'x',
  '', '', '', '', '', '', '', '', now(), now(), now()
), (
  '0c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'partenaire@test.cg', 'x',
  '', '', '', '', '', '', '', '', now(), now(), now()
);

insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id
) values (
  'b1000000-0000-0000-0000-000000000001', 'msg-schema', 'Profil messagerie',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-a', 'option_1', 'sur_place', 'brazzaville',
  25000, 'service', 'https://exemple/cover.jpg', 'published',
  '0c000000-0000-0000-0000-000000000002'
);

select has_table('public', 'messages', 'la table des messages existe');
select has_table('public', 'profiles', 'la table des pseudonymes existe');
select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ),
  'les messages sont diffusés en temps réel'
);
select col_is_null('public', 'requests', 'phone', 'une conversation n''exige plus de téléphone');
select col_is_null('public', 'requests', 'full_name', '… ni de nom complet');

set local role anon;

select throws_ok(
  $$ select * from public.messages $$,
  '42501', null,
  'un visiteur ne lit aucun message'
);

select throws_ok(
  $$ select public.submit_request('b1000000-0000-0000-0000-000000000001', 'Anonyme',
       '+242060000000', null, 'Bonjour', null, null) $$,
  '42501', null,
  'la demande anonyme par formulaire n''est plus possible'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into public.messages (request_id, sender_id, body)
     values (gen_random_uuid(), '0c000000-0000-0000-0000-000000000001', 'Direct') $$,
  '42501', null,
  'aucun message ne s''écrit directement dans la table'
);

select lives_ok(
  $$ insert into public.profiles (user_id, display_name)
     values ('0c000000-0000-0000-0000-000000000001', 'Awa') $$,
  'un compte crée son pseudonyme'
);

select throws_ok(
  $$ insert into public.profiles (user_id, display_name)
     values ('0c000000-0000-0000-0000-000000000002', 'Usurpé') $$,
  '42501', null,
  'personne ne crée le pseudonyme d''un autre'
);

set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is_empty(
  $$ select * from public.profiles where user_id = '0c000000-0000-0000-0000-000000000001' $$,
  'le pseudonyme d''un autre compte n''est pas lisible directement'
);

select throws_ok(
  $$ update public.listings set whatsapp_phone = '+242069123456'
      where id = 'b1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'le numéro WhatsApp ne se renseigne plus'
);

reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `supabase test db`
Expected: FAIL sur `messagerie_schema.test.sql` (`relation "public.messages" does not exist`).

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/0015_messagerie_schema.sql` :

```sql
-- Messagerie intégrée : schéma.
-- Spec : docs/superpowers/specs/2026-09-19-messagerie-design.md
--
-- La conversation *est* la demande : une ligne de `requests` par couple
-- (profil, client). Avis (`reviews.request_id`), paiements
-- (`payments.request_id`), notification (trigger 0003) et export restent
-- branchés sans changer de contrat.

/* -------------------------------------------------------------------------- */
/*                     requests devient le support des conversations          */
/* -------------------------------------------------------------------------- */

-- Une conversation ouverte par un compte n'a ni nom complet ni téléphone.
-- Les contraintes de format restent valables pour les valeurs non nulles,
-- donc pour les demandes anonymes historiques.
alter table public.requests
  alter column full_name drop not null,
  alter column phone drop not null,
  add column last_message_at     timestamptz,
  add column author_last_read_at timestamptz,
  add column owner_last_read_at  timestamptz;

-- Une seule conversation par client et par profil. Refus explicite plutôt
-- qu'échec cryptique de l'index si des doublons existent déjà.
do $$
begin
  if exists (
    select 1 from public.requests
     where author_id is not null
     group by listing_id, author_id
    having count(*) > 1
  ) then
    raise exception 'requests : plusieurs demandes d''un même client sur un même profil — fusion manuelle requise avant la messagerie';
  end if;
end $$;

create unique index requests_one_conversation_idx
  on public.requests (listing_id, author_id)
  where author_id is not null;

create index requests_last_message_idx on public.requests (last_message_at desc);

/* -------------------------------------------------------------------------- */
/*                                  Pseudonymes                               */
/* -------------------------------------------------------------------------- */

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 30),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Chacun ne lit et ne crée que le sien. Le pseudonyme de l'autre partie
-- n'est exposé que par `list_conversations` (0016).
create policy "profiles_self_read"
  on public.profiles for select
  using (user_id = auth.uid());

create policy "profiles_self_insert"
  on public.profiles for insert
  with check (user_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

/* -------------------------------------------------------------------------- */
/*                                    Messages                                */
/* -------------------------------------------------------------------------- */

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  -- Droit à l'effacement : supprimer un compte efface ses messages.
  sender_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_request_idx on public.messages (request_id, created_at);
-- Sert la limite de débit (messages récents d'un expéditeur).
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

/**
 * Rôle de l'appelant dans une conversation : 'client', 'partner' ou null.
 *
 * SECURITY DEFINER pour ne pas dépendre de la RLS de `listings` : un client
 * ne lit plus un profil dépublié, et une policy qui joindrait `listings` lui
 * cacherait alors sa propre conversation.
 */
create or replace function public.conversation_role(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when r.author_id = auth.uid() then 'client'
           when l.owner_id = auth.uid() then 'partner'
         end
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id
$$;

revoke execute on function public.conversation_role(uuid) from public, anon;
-- Appelée par la policy ci-dessous, donc avec les droits du lecteur.
grant execute on function public.conversation_role(uuid) to authenticated;

alter table public.messages enable row level security;

create policy "messages_participants_read"
  on public.messages for select
  using (public.conversation_role(request_id) is not null);

-- Aucune écriture côté client : tout passe par les fonctions de 0016.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant select, insert, delete on public.messages to service_role;

/* -------------------------------------------------------------------------- */
/*                                  Temps réel                                */
/* -------------------------------------------------------------------------- */

-- `postgres_changes` applique la RLS : chacun ne reçoit que ses messages.
-- `requests` y figure pour que le client voie la confirmation sans recharger.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.requests;

/* -------------------------------------------------------------------------- */
/*                 Fin du formulaire anonyme et du contact WhatsApp           */
/* -------------------------------------------------------------------------- */

-- La fonction reste pour l'historique ; plus personne ne l'appelle.
revoke execute on function public.submit_request from public, anon, authenticated;

-- Messagerie seule : plus aucun numéro publié.
update public.listings set whatsapp_phone = null where whatsapp_phone is not null;
revoke insert (whatsapp_phone) on public.listings from authenticated;
revoke update (whatsapp_phone) on public.listings from authenticated;
```

- [ ] **Step 4: Appliquer en local et vérifier**

Run: `supabase migration up --local && supabase test db`
Expected: `messagerie_schema.test.sql .. ok`, `security.test.sql .. ok`, `Result: PASS`.

Si `security.test.sql` échoue sur le test « un partenaire peut renseigner le numéro WhatsApp » (ajouté par 0014), le supprimer avec son `results_eq` suivant, et abaisser `select plan(46)` à `select plan(44)` : ce comportement est désormais volontairement interdit, et couvert par le nouveau test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_messagerie_schema.sql supabase/tests/messagerie_schema.test.sql supabase/tests/security.test.sql
git commit -m "feat(base): schéma de la messagerie (conversations, messages, pseudonymes)"
```

---

### Task 2: Fonctions de la messagerie (migration 0016)

**Files:**
- Create: `supabase/migrations/0016_messagerie_fonctions.sql`
- Test: `supabase/tests/messagerie_fonctions.test.sql`

**Interfaces:**
- Consumes : tables et `conversation_role` de la tâche 1.
- Produces :
  - `start_conversation(p_listing_id uuid, p_body text) returns uuid` (id de la conversation)
  - `send_message(p_request_id uuid, p_body text) returns uuid` (id du message)
  - `mark_conversation_read(p_request_id uuid) returns void`
  - `close_conversation(p_request_id uuid) returns void`
  - `list_conversations() returns table (request_id uuid, role text, status request_status, listing_id uuid, listing_slug text, listing_title text, listing_cover_url text, listing_status listing_status, listing_price_xaf integer, other_name text, client_present boolean, last_message text, last_message_at timestamptz, unread integer)`
  - `unread_message_count() returns integer`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `supabase/tests/messagerie_fonctions.test.sql` :

```sql
-- Messagerie : fonctions (migration 0016).
-- Les identifiants de conversation sont conservés dans des réglages de
-- transaction (`test.r1`, `test.r3`) : lisibles quel que soit le rôle courant.

begin;
select plan(25);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       email, 'x', '', '', '', '', '', '', '', '', now(), now(), now()
  from (values
    ('0c000000-0000-0000-0000-000000000001'::uuid, 'client@test.cg'),
    ('0c000000-0000-0000-0000-000000000002'::uuid, 'partenaire@test.cg'),
    ('0c000000-0000-0000-0000-000000000003'::uuid, 'intrus@test.cg')
  ) as u(id, email);

insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id
)
select id, slug, 'Profil ' || slug,
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville',
       25000, 'service', 'https://exemple/cover.jpg', status::listing_status,
       '0c000000-0000-0000-0000-000000000002'
  from (values
    ('b1000000-0000-0000-0000-000000000001'::uuid, 'msg-un', 'published'),
    ('b1000000-0000-0000-0000-000000000002'::uuid, 'msg-brouillon', 'draft'),
    ('b1000000-0000-0000-0000-000000000003'::uuid, 'msg-trois', 'published')
  ) as l(id, slug, status);

insert into public.listings (
  slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id
)
select 'msg-serie-' || g, 'Série ' || g,
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville',
       25000, 'service', 'https://exemple/cover.jpg', 'published',
       '0c000000-0000-0000-0000-000000000002'
  from generate_series(1, 11) g;

insert into public.profiles (user_id, display_name) values
  ('0c000000-0000-0000-0000-000000000002', 'Partenaire'),
  ('0c000000-0000-0000-0000-000000000003', 'Intrus');

-- Client ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000001', 'Bonjour') $$,
  'display_name_required',
  'un pseudonyme est exigé avant le premier message'
);

insert into public.profiles (user_id, display_name)
values ('0c000000-0000-0000-0000-000000000001', 'Awa');

select throws_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000001', '   ') $$,
  'invalid_body',
  'un message vide est refusé'
);

select lives_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000001',
                                      'Bonjour, disponible samedi ?') $$,
  'le client ouvre une conversation'
);

select is(
  public.start_conversation('b1000000-0000-0000-0000-000000000001', 'Je relance'),
  (select id from public.requests
    where listing_id = 'b1000000-0000-0000-0000-000000000001'
      and author_id = '0c000000-0000-0000-0000-000000000001'),
  'écrire à nouveau rejoint la même conversation'
);

select is(
  (select count(*)::int from public.messages m
     join public.requests r on r.id = m.request_id
    where r.listing_id = 'b1000000-0000-0000-0000-000000000001'),
  2,
  'les deux messages sont dans la conversation'
);

select throws_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000002', 'Bonjour') $$,
  'listing_unavailable',
  'on n''écrit pas à un profil non publié'
);

reset role;
do $$
begin
  perform set_config(
    'test.r1',
    (select id::text from public.requests where listing_id = 'b1000000-0000-0000-0000-000000000001'),
    true
  );
end $$;

-- Partenaire -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000001', 'Test') $$,
  'own_listing',
  'un partenaire ne s''écrit pas à lui-même'
);

select lives_ok(
  $$ select public.send_message(current_setting('test.r1')::uuid, 'Oui, à partir de 14 h.') $$,
  'le partenaire répond'
);

select is(
  (select status::text from public.requests where id = current_setting('test.r1')::uuid),
  'contacted',
  'la première réponse du partenaire passe la demande à « contacté »'
);

select is(
  (select other_name from public.list_conversations()
    where request_id = current_setting('test.r1')::uuid),
  'Awa',
  'le partenaire voit le pseudonyme du client'
);

-- Intrus ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is_empty($$ select * from public.messages $$, 'un tiers ne lit aucun message');

select throws_ok(
  $$ select public.send_message(current_setting('test.r1')::uuid, 'Spam') $$,
  'not_participant',
  'un tiers ne peut pas écrire dans la conversation'
);

select is_empty($$ select * from public.list_conversations() $$, 'un tiers ne voit aucune conversation');

reset role;
insert into public.requests (listing_id, author_id)
select id, '0c000000-0000-0000-0000-000000000003'
  from public.listings where slug like 'msg-serie-%' order by slug limit 10;

set local role authenticated;
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select public.start_conversation(
       (select id from public.listings where slug = 'msg-serie-9'), 'Bonjour') $$,
  'rate_limited',
  'dix nouvelles conversations par heure au plus'
);

-- Client : non-lus -------------------------------------------------------------
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select unread from public.list_conversations()
    where request_id = current_setting('test.r1')::uuid),
  1,
  'le client a un message non lu'
);

select is(public.unread_message_count(), 1, 'la pastille compte ce message');

do $$
begin
  perform public.mark_conversation_read(current_setting('test.r1')::uuid);
end $$;

select is(public.unread_message_count(), 0, 'lu, le message ne compte plus');

-- Partenaire : débit, confirmation --------------------------------------------
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$ do $b$
     begin
       for i in 1..29 loop
         perform public.send_message(current_setting('test.r1')::uuid, 'Message ' || i);
       end loop;
     end $b$ $$,
  'trente messages en cinq minutes restent possibles'
);

select throws_ok(
  $$ select public.send_message(current_setting('test.r1')::uuid, 'Un de trop') $$,
  'rate_limited',
  'au-delà, l''envoi est freiné'
);

select lives_ok(
  $$ update public.requests set status = 'confirmed' where id = current_setting('test.r1')::uuid $$,
  'le partenaire confirme la prestation'
);

-- Client : clôture ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.close_conversation(current_setting('test.r1')::uuid) $$,
  'conversation_confirmed',
  'une prestation confirmée ne se clôt plus'
);

do $$
begin
  perform set_config(
    'test.r3',
    public.start_conversation('b1000000-0000-0000-0000-000000000003', 'Bonjour')::text,
    true
  );
end $$;

select lives_ok(
  $$ select public.close_conversation(current_setting('test.r3')::uuid) $$,
  'le client clôt une conversation non confirmée'
);

select throws_ok(
  $$ select public.send_message(current_setting('test.r3')::uuid, 'Encore') $$,
  'conversation_closed',
  'une conversation close n''accepte plus de message'
);

select throws_ok(
  $$ select public.start_conversation('b1000000-0000-0000-0000-000000000003', 'Je reviens') $$,
  'conversation_closed',
  'écrire à nouveau au profil ne la rouvre pas'
);

-- Compte client supprimé ------------------------------------------------------
reset role;
update public.requests set author_id = null where id = current_setting('test.r1')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"0c000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.send_message(current_setting('test.r1')::uuid, 'Toujours là ?') $$,
  'conversation_closed',
  'on n''écrit plus à un compte supprimé'
);

reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `supabase test db`
Expected: FAIL sur `messagerie_fonctions.test.sql` (`function public.start_conversation(unknown, unknown) does not exist`).

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/0016_messagerie_fonctions.sql` :

```sql
-- Messagerie intégrée : fonctions.
-- Spec : docs/superpowers/specs/2026-09-19-messagerie-design.md
--
-- Toute écriture de message passe par ici : la table `messages` n'accorde
-- aucune insertion côté client. Participation, état de la conversation et
-- débit sont vérifiés en base, là où ils ne peuvent pas être contournés.

/* Insertion commune : limite de débit, horodatage, lecture de l'expéditeur. */
create or replace function public.post_message(p_request_id uuid, p_sender uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (
    select count(*) from public.messages
     where sender_id = p_sender and created_at > now() - interval '5 minutes'
  ) >= 30 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.messages (request_id, sender_id, body)
  values (p_request_id, p_sender, p_body)
  returning id into v_id;

  -- L'expéditeur a forcément lu la conversation jusqu'à son propre message.
  update public.requests
     set last_message_at     = now(),
         author_last_read_at = case when author_id = p_sender then now() else author_last_read_at end,
         owner_last_read_at  = case when author_id is distinct from p_sender then now() else owner_last_read_at end
   where id = p_request_id;

  return v_id;
end;
$$;

revoke execute on function public.post_message(uuid, uuid, text) from public, anon, authenticated;

/* Premier message : ouvre la conversation, ou rejoint celle qui existe. */
create or replace function public.start_conversation(p_listing_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_body    text := trim(coalesce(p_body, ''));
  v_owner   uuid;
  v_listing public.listing_status;
  v_request uuid;
  v_status  public.request_status;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'display_name_required' using errcode = '22023';
  end if;

  select owner_id, status into v_owner, v_listing
    from public.listings where id = p_listing_id;

  if v_listing is distinct from 'published' then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;
  if v_owner = v_uid then
    raise exception 'own_listing' using errcode = '22023';
  end if;

  select id, status into v_request, v_status
    from public.requests
   where listing_id = p_listing_id and author_id = v_uid;

  if v_request is null then
    if (
      select count(*) from public.requests
       where author_id = v_uid and created_at > now() - interval '1 hour'
    ) >= 10 then
      raise exception 'rate_limited' using errcode = '22023';
    end if;

    -- Déclenche la notification partenaire (trigger 0003).
    insert into public.requests (listing_id, author_id)
    values (p_listing_id, v_uid)
    returning id into v_request;
  elsif v_status = 'cancelled' then
    -- Close, elle le reste : rouvrir laisserait un client passer outre une
    -- clôture voulue par le partenaire.
    raise exception 'conversation_closed' using errcode = '22023';
  end if;

  perform public.post_message(v_request, v_uid, v_body);
  return v_request;
end;
$$;

/* Message suivant, par l'une ou l'autre partie. */
create or replace function public.send_message(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_body    text := trim(coalesce(p_body, ''));
  v_role    text;
  v_status  public.request_status;
  v_author  uuid;
  v_listing public.listing_status;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  v_role := public.conversation_role(p_request_id);
  if v_role is null then
    raise exception 'not_participant' using errcode = '42501';
  end if;

  select r.status, r.author_id, l.status
    into v_status, v_author, v_listing
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id;

  -- Sans client (compte supprimé, ou demande anonyme d'avant la messagerie),
  -- la conversation est en lecture seule.
  if v_status = 'cancelled' or v_author is null then
    raise exception 'conversation_closed' using errcode = '22023';
  end if;
  if v_listing <> 'published' then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  v_id := public.post_message(p_request_id, v_uid, v_body);

  if v_role = 'partner' and v_status = 'pending' then
    update public.requests set status = 'contacted' where id = p_request_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.mark_conversation_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.conversation_role(p_request_id);
begin
  if v_role is null then
    raise exception 'not_participant' using errcode = '42501';
  end if;

  if v_role = 'client' then
    update public.requests set author_last_read_at = now() where id = p_request_id;
  else
    update public.requests set owner_last_read_at = now() where id = p_request_id;
  end if;
end;
$$;

create or replace function public.close_conversation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.request_status;
begin
  if public.conversation_role(p_request_id) is null then
    raise exception 'not_participant' using errcode = '42501';
  end if;

  select status into v_status from public.requests where id = p_request_id;

  -- Clore après confirmation fermerait l'avis et le paiement du client.
  if v_status = 'confirmed' then
    raise exception 'conversation_confirmed' using errcode = '22023';
  end if;

  update public.requests set status = 'cancelled' where id = p_request_id;
end;
$$;

/*
 * Conversations de l'appelant, comme client ou comme partenaire.
 * Côté client, l'interlocuteur est le profil ; côté partenaire, le
 * pseudonyme du client (ou le nom d'une demande anonyme historique).
 */
create or replace function public.list_conversations()
returns table (
  request_id        uuid,
  role              text,
  status            public.request_status,
  listing_id        uuid,
  listing_slug      text,
  listing_title     text,
  listing_cover_url text,
  listing_status    public.listing_status,
  listing_price_xaf integer,
  other_name        text,
  client_present    boolean,
  last_message      text,
  last_message_at   timestamptz,
  unread            integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    case when r.author_id = auth.uid() then 'client' else 'partner' end,
    r.status,
    l.id,
    l.slug,
    l.title,
    l.cover_url,
    l.status,
    l.price_xaf,
    case
      when r.author_id = auth.uid() then l.title
      else coalesce(p.display_name, r.full_name, 'Compte supprimé')
    end,
    r.author_id is not null,
    coalesce(lm.body, nullif(r.message, '')),
    coalesce(r.last_message_at, r.created_at),
    (
      select count(*)::int
        from public.messages m
       where m.request_id = r.id
         and m.sender_id <> auth.uid()
         and m.created_at > coalesce(
               case when r.author_id = auth.uid() then r.author_last_read_at else r.owner_last_read_at end,
               '-infinity'::timestamptz
             )
    )
  from public.requests r
  join public.listings l on l.id = r.listing_id
  left join public.profiles p on p.user_id = r.author_id
  left join lateral (
    select m.body from public.messages m
     where m.request_id = r.id
     order by m.created_at desc
     limit 1
  ) lm on true
  where r.author_id = auth.uid() or l.owner_id = auth.uid()
  order by coalesce(r.last_message_at, r.created_at) desc
$$;

create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(unread), 0)::int from public.list_conversations()
$$;

revoke execute on function public.start_conversation(uuid, text) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.close_conversation(uuid) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.unread_message_count() from public, anon;

grant execute on function public.start_conversation(uuid, text) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.close_conversation(uuid) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.unread_message_count() to authenticated;
```

- [ ] **Step 4: Appliquer en local et vérifier**

Run: `supabase migration up --local && supabase test db`
Expected: les trois fichiers `ok`, `Result: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_messagerie_fonctions.sql supabase/tests/messagerie_fonctions.test.sql
git commit -m "feat(base): fonctions de la messagerie (ouverture, envoi, lecture, clôture, liste)"
```

---

### Task 3: Logique pure de la messagerie

**Files:**
- Create: `src/lib/messages.ts`
- Test: `src/lib/messages.test.ts`

**Interfaces:**
- Produces (tous exportés de `@/lib/messages`) :
  - `type ChatMessage = { id: string; request_id: string; sender_id: string; body: string; created_at: string }`
  - `MESSAGE_MAX_LENGTH = 2000`
  - `validateMessageBody(raw: string): { ok: true; body: string } | { ok: false; error: string }`
  - `validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string }`
  - `messageErrorText(code: string): string`
  - `mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[]`
  - `groupMessagesByDay(messages: ChatMessage[], now?: Date): { key: string; label: string; messages: ChatMessage[] }[]`
  - `formatMessageTime(iso: string): string`
  - `formatConversationDate(iso: string, now?: Date): string`
  - `conversationReadOnlyReason(c: { status: string; client_present: boolean; listing_status: string }, hasLegacyContact: boolean): string | null`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/messages.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import {
  conversationReadOnlyReason,
  formatConversationDate,
  formatMessageTime,
  groupMessagesByDay,
  mergeMessages,
  messageErrorText,
  validateDisplayName,
  validateMessageBody,
  type ChatMessage,
} from "@/lib/messages";

const msg = (id: string, created_at: string): ChatMessage => ({
  id,
  request_id: "r1",
  sender_id: "u1",
  body: `Message ${id}`,
  created_at,
});

describe("validateMessageBody", () => {
  it("retire les espaces de bord", () => {
    expect(validateMessageBody("  Bonjour  ")).toEqual({ ok: true, body: "Bonjour" });
  });

  it("refuse un message vide ou trop long", () => {
    expect(validateMessageBody("   ")).toEqual({ ok: false, error: "Écrivez un message avant d'envoyer." });
    expect(validateMessageBody("a".repeat(2001))).toEqual({
      ok: false,
      error: "Votre message dépasse 2 000 caractères.",
    });
    expect(validateMessageBody("a".repeat(2000)).ok).toBe(true);
  });
});

describe("validateDisplayName", () => {
  it("accepte 2 à 30 caractères", () => {
    expect(validateDisplayName(" Awa ")).toEqual({ ok: true, value: "Awa" });
    expect(validateDisplayName("A")).toEqual({
      ok: false,
      error: "Votre pseudonyme doit contenir entre 2 et 30 caractères.",
    });
    expect(validateDisplayName("a".repeat(31)).ok).toBe(false);
  });
});

describe("messageErrorText", () => {
  it("traduit les codes des fonctions de la base", () => {
    expect(messageErrorText("rate_limited")).toBe("Vous écrivez trop vite. Réessayez dans quelques minutes.");
    expect(messageErrorText("conversation_closed")).toBe("Cette conversation est close : vous ne pouvez plus y écrire.");
    expect(messageErrorText("own_listing")).toBe("Vous ne pouvez pas vous écrire à vous-même.");
  });

  it("reste compréhensible pour un code inconnu", () => {
    expect(messageErrorText("boom")).toBe("L'envoi a échoué. Vérifiez votre connexion puis réessayez.");
  });
});

describe("mergeMessages", () => {
  it("ajoute sans doublon et trie par date", () => {
    const current = [msg("a", "2026-09-19T10:00:00Z"), msg("c", "2026-09-19T10:02:00Z")];
    const merged = mergeMessages(current, [msg("b", "2026-09-19T10:01:00Z"), msg("a", "2026-09-19T10:00:00Z")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupMessagesByDay", () => {
  const now = new Date("2026-09-19T15:00:00Z");

  it("regroupe par jour de Brazzaville, avec Aujourd'hui et Hier", () => {
    const groups = groupMessagesByDay(
      [
        msg("1", "2026-09-17T09:00:00Z"),
        msg("2", "2026-09-18T22:30:00Z"), // 23 h 30 à Brazzaville : encore le 18
        msg("3", "2026-09-18T23:30:00Z"), // 0 h 30 à Brazzaville : déjà le 19
        msg("4", "2026-09-19T14:00:00Z"),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.messages.map((m) => m.id)])).toEqual([
      ["jeudi 17 septembre", ["1"]],
      ["Hier", ["2"]],
      ["Aujourd'hui", ["3", "4"]],
    ]);
  });
});

describe("formats de date", () => {
  const now = new Date("2026-09-19T15:00:00Z");

  it("affiche l'heure de Brazzaville", () => {
    expect(formatMessageTime("2026-09-19T13:05:00Z")).toBe("14:05");
  });

  it("résume la date d'une conversation", () => {
    expect(formatConversationDate("2026-09-19T13:05:00Z", now)).toBe("14:05");
    expect(formatConversationDate("2026-09-18T13:05:00Z", now)).toBe("Hier");
    expect(formatConversationDate("2026-09-02T13:05:00Z", now)).toBe("2 sept.");
  });
});

describe("conversationReadOnlyReason", () => {
  const open = { status: "contacted", client_present: true, listing_status: "published" };

  it("laisse écrire dans une conversation ouverte", () => {
    expect(conversationReadOnlyReason(open, false)).toBeNull();
  });

  it("explique pourquoi on ne peut plus écrire", () => {
    expect(conversationReadOnlyReason({ ...open, status: "cancelled" }, false)).toBe("Cette conversation est close.");
    expect(conversationReadOnlyReason({ ...open, client_present: false }, false)).toBe("Ce compte a été supprimé.");
    expect(conversationReadOnlyReason({ ...open, client_present: false }, true)).toBe(
      "Demande envoyée avant la messagerie : contactez le client par téléphone.",
    );
    expect(conversationReadOnlyReason({ ...open, listing_status: "draft" }, false)).toBe("Ce profil n'est plus publié.");
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run src/lib/messages.test.ts`
Expected: FAIL (`Cannot find package '@/lib/messages'`).

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/lib/messages.ts` :

```ts
/**
 * Logique pure de la messagerie : validation, messages d'erreur, fusion et
 * présentation des messages. Aucun accès réseau ici, tout est testé.
 */

export type ChatMessage = {
  id: string;
  request_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export const MESSAGE_MAX_LENGTH = 2000;

const TIME_ZONE = "Africa/Brazzaville";

export function validateMessageBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Écrivez un message avant d'envoyer." };
  if (body.length > MESSAGE_MAX_LENGTH) return { ok: false, error: "Votre message dépasse 2 000 caractères." };
  return { ok: true, body };
}

export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length < 2 || value.length > 30) {
    return { ok: false, error: "Votre pseudonyme doit contenir entre 2 et 30 caractères." };
  }
  return { ok: true, value };
}

const ERRORS: Record<string, string> = {
  authentication_required: "Connectez-vous pour écrire.",
  invalid_body: "Votre message doit contenir entre 1 et 2 000 caractères.",
  display_name_required: "Choisissez un pseudonyme pour écrire.",
  listing_unavailable: "Ce profil n'est plus disponible.",
  own_listing: "Vous ne pouvez pas vous écrire à vous-même.",
  not_participant: "Cette conversation n'existe pas ou ne vous concerne pas.",
  rate_limited: "Vous écrivez trop vite. Réessayez dans quelques minutes.",
  conversation_closed: "Cette conversation est close : vous ne pouvez plus y écrire.",
  conversation_confirmed: "La prestation est confirmée : la conversation ne peut plus être close.",
};

/** Texte à afficher pour un code d'erreur renvoyé par les fonctions SQL. */
export const messageErrorText = (code: string): string =>
  ERRORS[code] ?? "L'envoi a échoué. Vérifiez votre connexion puis réessayez.";

/** Fusion sans doublon : le même message peut arriver par l'envoi, le temps réel et le rattrapage. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const dayKey = (date: Date): string =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const DAY_MS = 86_400_000;

export function groupMessagesByDay(
  messages: ChatMessage[],
  now: Date = new Date(),
): { key: string; label: string; messages: ChatMessage[] }[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  const longDate = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const groups: { key: string; label: string; messages: ChatMessage[] }[] = [];
  for (const message of messages) {
    const date = new Date(message.created_at);
    const key = dayKey(date);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = key === today ? "Aujourd'hui" : key === yesterday ? "Hier" : longDate.format(date);
      group = { key, label, messages: [] };
      groups.push(group);
    }
    group.messages.push(message);
  }
  return groups;
}

export const formatMessageTime = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function formatConversationDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const key = dayKey(date);
  if (key === dayKey(now)) return formatMessageTime(iso);
  if (key === dayKey(new Date(now.getTime() - DAY_MS))) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "short" }).format(date);
}

/** Pourquoi la saisie est désactivée, ou `null` si l'on peut écrire. */
export function conversationReadOnlyReason(
  c: { status: string; client_present: boolean; listing_status: string },
  hasLegacyContact: boolean,
): string | null {
  if (c.status === "cancelled") return "Cette conversation est close.";
  if (!c.client_present) {
    return hasLegacyContact
      ? "Demande envoyée avant la messagerie : contactez le client par téléphone."
      : "Ce compte a été supprimé.";
  }
  if (c.listing_status !== "published") return "Ce profil n'est plus publié.";
  return null;
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run src/lib/messages.test.ts`
Expected: PASS (tous les tests du fichier).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages.ts src/lib/messages.test.ts
git commit -m "feat(messagerie): logique pure (validation, erreurs, regroupement par jour)"
```

---

### Task 4: Types, notification sans contenu et export

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/notifications.ts`
- Modify: `src/app/api/webhooks/new-request/route.ts`
- Modify: `src/app/api/mon-compte/export/route.ts`

**Interfaces:**
- Consumes : `ChatMessage` (tâche 3).
- Produces (dans `@/types/database`) : `MessageRow` (= `ChatMessage`), `ProfileRow`, `ConversationSummary`, tables `messages` et `profiles`, fonctions `start_conversation`, `send_message`, `mark_conversation_read`, `close_conversation`, `list_conversations`, `unread_message_count` ; dans `@/lib/notifications` : `sendConversationNotification(to: string, n: { listingTitle: string; conversationsUrl: string }): Promise<boolean>`.

- [ ] **Step 1: Mettre à jour les types**

Dans `src/types/database.ts`, remplacer le type `RequestRow` par :

```ts
export type RequestRow = {
  id: string;
  listing_id: string;
  // Nuls pour une conversation ouverte par un compte (messagerie) ;
  // renseignés pour les demandes anonymes d'avant la messagerie.
  full_name: string | null;
  phone: string | null;
  email: string | null;
  message: string;
  desired_date: string | null;
  guests: number | null;
  status: RequestStatus;
  author_id: string | null;
  last_message_at: string | null;
  author_last_read_at: string | null;
  owner_last_read_at: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  request_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ProfileRow = { user_id: string; display_name: string; created_at: string };

/** Ligne de `list_conversations()`. */
export type ConversationSummary = {
  request_id: string;
  role: "client" | "partner";
  status: RequestStatus;
  listing_id: string;
  listing_slug: string;
  listing_title: string;
  listing_cover_url: string;
  listing_status: ListingStatus;
  listing_price_xaf: number;
  other_name: string;
  client_present: boolean;
  last_message: string | null;
  last_message_at: string;
  unread: number;
};
```

Dans `Tables`, après `admins`, ajouter :

```ts
      messages: {
        Row: MessageRow;
        // Écrits exclusivement par `start_conversation` et `send_message`.
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "messages_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: ProfileRow;
        Insert: { user_id: string; display_name: string };
        Update: never;
        Relationships: [];
      };
```

Dans `Functions`, après `submit_request`, ajouter :

```ts
      start_conversation: { Args: { p_listing_id: string; p_body: string }; Returns: string };
      send_message: { Args: { p_request_id: string; p_body: string }; Returns: string };
      mark_conversation_read: { Args: { p_request_id: string }; Returns: undefined };
      close_conversation: { Args: { p_request_id: string }; Returns: undefined };
      list_conversations: { Args: Record<string, never>; Returns: ConversationSummary[] };
      unread_message_count: { Args: Record<string, never>; Returns: number };
```

- [ ] **Step 2: Vérifier les erreurs de type attendues**

Run: `npx tsc --noEmit`
Expected: erreurs dans `src/app/api/webhooks/new-request/route.ts` (`string | null` n'est pas assignable à `string` pour `fullName` et `phone`). C'est l'objet des étapes suivantes.

- [ ] **Step 3: Factoriser l'envoi et ajouter l'alerte « nouveau message »**

Dans `src/lib/notifications.ts`, remplacer le corps de `sendRequestNotification` par un appel à une fonction commune, et ajouter la nouvelle alerte. Le fichier devient, jusqu'à `escapeHtml` exclu :

```ts
import "server-only";

export interface RequestNotification {
  listingTitle: string;
  listingUrl: string;
  fullName: string;
  phone: string;
  email: string | null;
  message: string;
  desiredDate: string | null;
  guests: number | null;
  city: string;
}

export interface ConversationNotification {
  listingTitle: string;
  conversationsUrl: string;
}

/**
 * Envoi via l'API HTTP de Resend, sans dépendance supplémentaire. Clé absente :
 * on journalise et on renvoie `false` sans lever — une notification manquée ne
 * doit jamais faire échouer l'enregistrement, déjà fait à ce stade.
 */
async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[notifications] RESEND_API_KEY/NOTIFY_EMAIL_FROM absents — envoi ignoré");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
    });

    if (!response.ok) {
      console.error("[notifications] resend error", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notifications] send failed", error);
    return false;
  }
}

/** Alerte « nouvelle demande » (demandes anonymes d'avant la messagerie). */
export async function sendRequestNotification(to: string, notification: RequestNotification): Promise<boolean> {
  return sendEmail(
    to,
    `Nouvelle demande — ${notification.listingTitle}`,
    renderEmail(notification),
    notification.email ?? undefined,
  );
}

/**
 * Alerte « nouveau message ». Jamais le contenu ni le nom du client : un
 * aperçu dans une boîte mail partagée ou sur un écran verrouillé trahirait
 * la conversation.
 */
export async function sendConversationNotification(
  to: string,
  notification: ConversationNotification,
): Promise<boolean> {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b;">
    <p style="font-size:16px;margin:0 0 12px;">Vous avez un nouveau message sur Matripa.</p>
    <p style="font-size:14px;color:#52525b;margin:0 0 20px;">Profil concerné : ${escapeHtml(notification.listingTitle)}</p>
    <a href="${escapeHtml(notification.conversationsUrl)}" style="display:inline-block;background:#e9c877;color:#020617;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600;">Lire mes messages</a>
  </div>`;
  return sendEmail(to, "Nouveau message sur Matripa", html);
}
```

(La suite du fichier — `escapeHtml` et `renderEmail` — reste inchangée.)

- [ ] **Step 4: Adapter le webhook**

Dans `src/app/api/webhooks/new-request/route.ts` :

1. Remplacer `.select("full_name, phone, email, message, desired_date, guests, listing_id")` par `.select("full_name, phone, email, message, desired_date, guests, listing_id, author_id")`.
2. Remplacer l'import de `sendRequestNotification` par `import { sendConversationNotification, sendRequestNotification } from "@/lib/notifications";`.
3. Remplacer le bloc final, depuis `const notified = await sendRequestNotification(recipient, {` jusqu'à `return Response.json({ ok: true, notified });`, par :

```ts
  // Conversation ouverte par un compte : alerte sans contenu. Demande anonyme
  // historique : récapitulatif complet, comme avant la messagerie.
  const notified = demande.author_id
    ? await sendConversationNotification(recipient, {
        listingTitle: listing.title,
        conversationsUrl: `${siteUrl}/messages`,
      })
    : await sendRequestNotification(recipient, {
        listingTitle: listing.title,
        listingUrl: `${siteUrl}/annonces/${listing.slug}`,
        city: cityLabel(listing.city),
        fullName: demande.full_name ?? "",
        phone: demande.phone ?? "",
        email: demande.email,
        message: demande.message,
        desiredDate: demande.desired_date,
        guests: demande.guests,
      });

  return Response.json({ ok: true, notified });
```

- [ ] **Step 5: Ajouter messages et pseudonyme à l'export**

Dans `src/app/api/mon-compte/export/route.ts`, remplacer `const [requests, reviews, listings] = await Promise.all([` et son tableau par :

```ts
  const [requests, reviews, listings, messages, profile] = await Promise.all([
    supabase
      .from("requests")
      .select("id, listing_id, full_name, phone, email, message, desired_date, guests, status, created_at")
      .eq("author_id", user.id),
    supabase
      .from("reviews")
      .select("id, listing_id, rating, comment, created_at")
      .eq("author_id", user.id),
    supabase
      .from("listings")
      .select("id, slug, title, city, price_xaf, price_unit, status, created_at")
      .eq("owner_id", user.id),
    supabase
      .from("messages")
      .select("id, request_id, body, created_at")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("display_name, created_at").eq("user_id", user.id).maybeSingle(),
  ]);
```

et dans `payload`, après `offres_publiees: listings.data ?? [],`, ajouter :

```ts
    pseudonyme: profile.data ?? null,
    messages_envoyes: messages.data ?? [],
```

- [ ] **Step 6: Vérifier**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur de type ; tous les tests passent.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts src/lib/notifications.ts src/app/api/webhooks/new-request/route.ts src/app/api/mon-compte/export/route.ts
git commit -m "feat(messagerie): types, alerte « nouveau message » sans contenu, export des messages"
```

---

### Task 5: Server Actions de la messagerie

**Files:**
- Create: `src/app/actions/messages.ts`
- Modify: `src/app/actions/payments.ts:43,83`, `src/app/actions/reviews.ts:41,67`

**Interfaces:**
- Consumes : fonctions SQL (tâche 2), types (tâche 4), `validateMessageBody`, `validateDisplayName`, `messageErrorText`, `ChatMessage` (tâche 3).
- Produces (dans `@/app/actions/messages`) :
  - `interface StartConversationState { error: string | null; fields: { body: string; display_name: string } }`
  - `startConversation(prev: StartConversationState, formData: FormData): Promise<StartConversationState>` — champs `listing_id`, `body`, `display_name` (facultatif) ; redirige vers `/messages/{id}` en cas de succès
  - `type SendMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string }`
  - `sendMessage(requestId: string, body: string): Promise<SendMessageResult>`
  - `markConversationRead(requestId: string): Promise<void>`
  - `closeConversation(requestId: string): Promise<{ error: string | null }>`
  - `confirmPrestation(requestId: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Écrire les actions**

Créer `src/app/actions/messages.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  messageErrorText,
  validateDisplayName,
  validateMessageBody,
  type ChatMessage,
} from "@/lib/messages";

export interface StartConversationState {
  error: string | null;
  fields: { body: string; display_name: string };
}

const MESSAGE_COLUMNS = "id, request_id, sender_id, body, created_at";

/** Premier message à un profil : crée le pseudonyme si besoin, puis la conversation. */
export async function startConversation(
  _prev: StartConversationState,
  formData: FormData,
): Promise<StartConversationState> {
  const listingId = String(formData.get("listing_id") ?? "");
  const rawBody = String(formData.get("body") ?? "");
  const rawName = formData.get("display_name");
  const fields = { body: rawBody, display_name: typeof rawName === "string" ? rawName : "" };

  const body = validateMessageBody(rawBody);
  if (!body.ok) return { error: body.error, fields };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suivant=/messages");

  // Le champ n'est présent que si le compte n'a pas encore de pseudonyme.
  if (typeof rawName === "string") {
    const name = validateDisplayName(rawName);
    if (!name.ok) return { error: name.error, fields };

    const { error } = await supabase.from("profiles").insert({ user_id: user.id, display_name: name.value });
    // 23505 : déjà créé (double envoi) — sans conséquence.
    if (error && error.code !== "23505") {
      console.error("[messages] pseudonyme", error);
      return { error: messageErrorText(""), fields };
    }
  }

  const { data: requestId, error } = await supabase.rpc("start_conversation", {
    p_listing_id: listingId,
    p_body: body.body,
  });

  if (error || !requestId) return { error: messageErrorText(error?.message ?? ""), fields };

  revalidatePath("/messages");
  redirect(`/messages/${requestId}`);
}

export type SendMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(requestId: string, rawBody: string): Promise<SendMessageResult> {
  const body = validateMessageBody(rawBody);
  if (!body.ok) return { ok: false, error: body.error };

  const supabase = await createClient();
  const { data: messageId, error } = await supabase.rpc("send_message", {
    p_request_id: requestId,
    p_body: body.body,
  });
  if (error || !messageId) return { ok: false, error: messageErrorText(error?.message ?? "") };

  const { data: message } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", messageId)
    .single<ChatMessage>();
  if (!message) return { ok: false, error: messageErrorText("") };

  return { ok: true, message };
}

export async function markConversationRead(requestId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_conversation_read", { p_request_id: requestId });
  if (error) console.error("[messages] lecture", error);
}

export async function closeConversation(requestId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_conversation", { p_request_id: requestId });
  if (error) return { error: messageErrorText(error.message) };
  revalidatePath(`/messages/${requestId}`);
  revalidatePath("/messages");
  return { error: null };
}

/**
 * Confirmation par le partenaire. Passe par l'écriture de statut existante :
 * `requests_listing_owner_update` la borne au propriétaire du profil.
 */
export async function confirmPrestation(requestId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ status: "confirmed" })
    .eq("id", requestId)
    .in("status", ["pending", "contacted"])
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("[messages] confirmation", error);
    return { error: "La confirmation a échoué. Rechargez la page puis réessayez." };
  }
  revalidatePath(`/messages/${requestId}`);
  revalidatePath("/messages");
  return { error: null };
}
```

- [ ] **Step 2: Rediriger paiement et avis vers la messagerie**

Dans `src/app/actions/payments.ts` et `src/app/actions/reviews.ts` :
- remplacer `redirect("/connexion?suivant=/mes-demandes")` par `redirect("/connexion?suivant=/messages")` ;
- remplacer `revalidatePath("/mes-demandes");` par `revalidatePath("/messages", "layout");` (rafraîchit la liste et toutes les conversations).

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/messages.ts src/app/actions/payments.ts src/app/actions/reviews.ts
git commit -m "feat(messagerie): Server Actions (ouverture, envoi, lecture, clôture, confirmation)"
```

---

### Task 6: Liste des conversations

**Files:**
- Create: `src/app/messages/page.tsx`
- Modify: `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `public/sw.js`
- Modify (remplacement complet): `src/app/mes-demandes/page.tsx`

**Interfaces:**
- Consumes : `list_conversations` (tâche 2), `ConversationSummary` (tâche 4), `formatConversationDate` (tâche 3).
- Produces : route `/messages` protégée ; `/mes-demandes` redirige vers `/messages`.

- [ ] **Step 1: Protéger `/messages`**

Dans `src/middleware.ts`, ajouter `"/messages/:path*",` au tableau `matcher`, juste après `"/mes-demandes/:path*",`.
Dans `src/lib/supabase/middleware.ts`, remplacer `const guarded = ["/partenaire", "/admin", "/mes-demandes", "/compte"];` par `const guarded = ["/partenaire", "/admin", "/mes-demandes", "/messages", "/compte"];`.

- [ ] **Step 2: Exclure la messagerie du cache hors ligne**

Dans `public/sw.js`, juste après `if (url.pathname.startsWith("/auth/")) return;`, ajouter :

```js
  // Messagerie : jamais en cache. Le HTML d'une conversation resterait sur
  // l'appareil, lisible hors ligne par quiconque l'ouvre.
  if (url.pathname.startsWith("/messages")) return;
```

- [ ] **Step 3: Écrire la page**

Créer `src/app/messages/page.tsx` :

```tsx
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { cx } from "@/lib/format";
import { formatConversationDate } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import type { ConversationSummary } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suivant=/messages");

  const { data } = await supabase.rpc("list_conversations");
  const conversations = (data ?? []) as ConversationSummary[];

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight text-white">Messages</h1>

        {conversations.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <MessagesSquare className="mx-auto size-8 text-gold" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold text-white">Aucune conversation</h2>
            <p className="mt-1 text-sm text-slate-400">
              Écrivez à un profil depuis sa fiche pour démarrer une conversation.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex h-10 items-center rounded-xl bg-action px-4 text-sm font-semibold text-slate-950"
            >
              Découvrir les annonces
            </Link>
          </section>
        ) : (
          <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {conversations.map((c) => (
              <li key={c.request_id}>
                <Link
                  href={`/messages/${c.request_id}`}
                  className="flex items-center gap-3 p-3 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon/70"
                >
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-slate-900">
                    <Image src={c.listing_cover_url} alt="" fill sizes="48px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cx(
                          "truncate text-sm",
                          c.unread > 0 ? "font-semibold text-white" : "font-medium text-slate-200",
                        )}
                      >
                        {c.other_name}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-500">
                        {formatConversationDate(c.last_message_at)}
                      </span>
                    </span>
                    {c.role === "partner" && (
                      <span className="block truncate text-[11px] text-slate-500">{c.listing_title}</span>
                    )}
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cx("min-w-0 truncate text-xs", c.unread > 0 ? "text-slate-200" : "text-slate-500")}>
                        {c.last_message ?? "Aucun message"}
                      </span>
                      <ConversationBadge status={c.status} unread={c.unread} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ConversationBadge({ status, unread }: { status: string; unread: number }) {
  if (unread > 0) {
    return (
      <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-neon px-1.5 text-[11px] font-bold text-white">
        {unread}
        <span className="sr-only"> non lu{unread > 1 ? "s" : ""}</span>
      </span>
    );
  }
  if (status === "confirmed") {
    return <span className="ml-auto shrink-0 text-[11px] text-emerald-300">Confirmée</span>;
  }
  if (status === "cancelled") {
    return <span className="ml-auto shrink-0 text-[11px] text-slate-500">Close</span>;
  }
  return null;
}
```

- [ ] **Step 4: Rediriger `/mes-demandes`**

Remplacer tout le contenu de `src/app/mes-demandes/page.tsx` par :

```tsx
import { redirect } from "next/navigation";

/** Les demandes sont devenues des conversations : tout se suit dans /messages. */
export default function MesDemandesPage() {
  redirect("/messages");
}
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npm run build`
Expected: build réussi ; la table des routes contient `ƒ /messages`.

- [ ] **Step 6: Commit**

```bash
git add src/app/messages/page.tsx src/app/mes-demandes/page.tsx src/middleware.ts src/lib/supabase/middleware.ts public/sw.js
git commit -m "feat(messagerie): liste des conversations, /mes-demandes redirigée"
```

---

### Task 7: Premier message

**Files:**
- Create: `src/app/messages/nouveau/[slug]/page.tsx`
- Create: `src/components/messages/NewConversationForm.tsx`
- Modify (remplacement complet): `src/app/demande/[slug]/page.tsx`

**Interfaces:**
- Consumes : `startConversation`, `StartConversationState` (tâche 5), `MESSAGE_MAX_LENGTH` (tâche 3).
- Produces : route `/messages/nouveau/[slug]` ; formulaire aux libellés « Votre pseudonyme », « Votre message », bouton « Envoyer » (utilisés par les tests e2e de la tâche 11).

- [ ] **Step 1: Écrire le formulaire**

Créer `src/components/messages/NewConversationForm.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { SendHorizontal } from "lucide-react";

import { startConversation, type StartConversationState } from "@/app/actions/messages";
import { MESSAGE_MAX_LENGTH } from "@/lib/messages";

const INITIAL: StartConversationState = { error: null, fields: { body: "", display_name: "" } };

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20";

export function NewConversationForm({ listingId, needsDisplayName }: { listingId: string; needsDisplayName: boolean }) {
  const [state, action, pending] = useActionState(startConversation, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="listing_id" value={listingId} />

      {needsDisplayName && (
        <div className="space-y-1.5">
          <label htmlFor="display_name" className="text-sm font-medium text-slate-200">
            Votre pseudonyme
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            minLength={2}
            maxLength={30}
            autoComplete="nickname"
            defaultValue={state.fields.display_name}
            className={INPUT}
          />
          <p className="text-xs text-slate-500">
            C&apos;est le seul nom que verra le partenaire. Votre vrai nom n&apos;est jamais demandé.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium text-slate-200">
          Votre message
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={5}
          maxLength={MESSAGE_MAX_LENGTH}
          defaultValue={state.fields.body}
          placeholder="Présentez-vous et précisez votre demande : date, durée, lieu…"
          className={`${INPUT} resize-y`}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-rose-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
      >
        <SendHorizontal className="size-4" aria-hidden />
        {pending ? "Envoi…" : "Envoyer"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Écrire la page**

Créer `src/app/messages/nouveau/[slug]/page.tsx` :

```tsx
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NewConversationForm } from "@/components/messages/NewConversationForm";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nouveau message", robots: { index: false, follow: false } };

export default async function NewConversationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suivant=/messages/nouveau/${slug}`);

  const { data: listing } = await supabase
    .from("listings")
    .select("id, slug, title, city, cover_url, owner_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ id: string; slug: string; title: string; city: string; cover_url: string; owner_id: string | null }>();
  if (!listing) notFound();

  if (listing.owner_id === user.id) {
    return (
      <main className="min-h-dvh bg-slate-950 px-4 py-10 text-slate-100">
        <section className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <h1 className="text-lg font-semibold text-white">C&apos;est votre propre profil</h1>
          <p className="mt-2 text-sm text-slate-400">Les messages de vos clients arrivent dans votre messagerie.</p>
          <Link href="/messages" className="mt-5 inline-flex h-10 items-center rounded-xl bg-action px-4 text-sm font-semibold text-slate-950">
            Voir mes messages
          </Link>
        </section>
      </main>
    );
  }

  // Une seule conversation par profil : ouverte ou close, on y retourne.
  const { data: existing } = await supabase
    .from("requests")
    .select("id")
    .eq("listing_id", listing.id)
    .eq("author_id", user.id)
    .maybeSingle<{ id: string }>();
  if (existing) redirect(`/messages/${existing.id}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle<{ display_name: string }>();

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-slate-900">
            <Image src={listing.cover_url} alt="" fill sizes="56px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Écrire à</p>
            <h1 className="truncate font-display text-2xl font-semibold text-white">{listing.title}</h1>
            <p className="text-xs text-slate-400">{cityLabel(listing.city)}</p>
          </div>
        </div>

        <NewConversationForm listingId={listing.id} needsDisplayName={!profile} />

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Vos échanges restent sur Matripa : aucune coordonnée n&apos;est partagée.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Rediriger l'ancien formulaire**

Remplacer tout le contenu de `src/app/demande/[slug]/page.tsx` par :

```tsx
import { redirect } from "next/navigation";

/** Le formulaire de demande est remplacé par la messagerie. */
export default async function DemandePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/messages/nouveau/${slug}`);
}
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit && npm run build`
Expected: build réussi ; routes `ƒ /messages/nouveau/[slug]` et `ƒ /demande/[slug]`.

- [ ] **Step 5: Commit**

```bash
git add src/app/messages/nouveau src/components/messages/NewConversationForm.tsx "src/app/demande/[slug]/page.tsx"
git commit -m "feat(messagerie): premier message avec pseudonyme, /demande redirigée"
```

---

### Task 8: Fil de discussion en temps réel

**Files:**
- Create: `src/components/payments/PaymentStatus.tsx`
- Create: `src/components/messages/ConversationThread.tsx`
- Create: `src/components/messages/ConversationActions.tsx`
- Create: `src/components/messages/unread-events.ts`
- Create: `src/app/messages/[id]/page.tsx`

**Interfaces:**
- Consumes : actions de la tâche 5 ; `ChatMessage`, `groupMessagesByDay`, `formatMessageTime`, `mergeMessages`, `validateMessageBody`, `conversationReadOnlyReason`, `MESSAGE_MAX_LENGTH` (tâche 3) ; `ConversationSummary` (tâche 4) ; `PaymentForm({ requestId, amountXaf })`, `ReviewForm({ requestId })` existants.
- Produces : `UNREAD_REFRESH_EVENT = "matripa:unread-refresh"` (dans `@/components/messages/unread-events`), émis après chaque lecture ; boutons « Confirmer la prestation » et « Clore la conversation » ; libellé de saisie « Votre message » et bouton « Envoyer ».

- [ ] **Step 1: Sortir le statut de paiement dans son composant**

Créer `src/components/payments/PaymentStatus.tsx` :

```tsx
import { cx, formatXAF } from "@/lib/format";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Paiement initié", className: "border-slate-400/30 bg-slate-500/10 text-slate-200" },
  processing: {
    label: "Paiement en attente de votre validation sur le téléphone",
    className: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  },
  completed: { label: "Paiement reçu", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" },
  failed: { label: "Paiement échoué — vous pouvez réessayer", className: "border-rose-400/30 bg-rose-500/10 text-rose-100" },
};

export function PaymentStatus({ status, amountXaf }: { status: string; amountXaf: number }) {
  const { label, className } = STATUS[status] ?? STATUS.pending;
  return (
    <p className={cx("rounded-xl border px-4 py-3 text-sm", className)}>
      {label} — {formatXAF(amountXaf)}
    </p>
  );
}
```

- [ ] **Step 2: Écrire l'événement de rafraîchissement**

Créer `src/components/messages/unread-events.ts` :

```ts
/** Émis après une lecture : la pastille du dock se recalcule. */
export const UNREAD_REFRESH_EVENT = "matripa:unread-refresh";

export const requestUnreadRefresh = () => window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT));
```

- [ ] **Step 3: Écrire le fil**

Créer `src/components/messages/ConversationThread.tsx` :

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { SendHorizontal } from "lucide-react";

import { markConversationRead, sendMessage } from "@/app/actions/messages";
import { requestUnreadRefresh } from "@/components/messages/unread-events";
import { cx } from "@/lib/format";
import {
  MESSAGE_MAX_LENGTH,
  formatMessageTime,
  groupMessagesByDay,
  mergeMessages,
  validateMessageBody,
  type ChatMessage,
} from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";

interface ConversationThreadProps {
  requestId: string;
  currentUserId: string;
  status: string;
  initialMessages: ChatMessage[];
  /** `null` si l'on peut écrire, sinon la raison affichée à la place de la saisie. */
  readOnlyReason: string | null;
}

const MESSAGE_COLUMNS = "id, request_id, sender_id, body, created_at";

export function ConversationThread({
  requestId,
  currentUserId,
  status,
  initialMessages,
  readOnlyReason,
}: ConversationThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  // Pas de `at()` ni de `findLast` : absents des navigateurs Android anciens.
  const lastSeen = useRef<string | null>(initialMessages[initialMessages.length - 1]?.created_at ?? null);

  useEffect(() => {
    lastSeen.current = messages[messages.length - 1]?.created_at ?? null;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  /** Rattrapage : tout ce qui est arrivé depuis le dernier message connu. */
  const catchUp = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (lastSeen.current) query = query.gt("created_at", lastSeen.current);
    const { data } = await query.returns<ChatMessage[]>();
    if (data?.length) setMessages((current) => mergeMessages(current, data));
  }, [requestId]);

  // Temps réel, avec rattrapage à l'abonnement, au retour sur l'onglet et au
  // retour du réseau : une coupure ne perd aucun message.
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      // Sans jeton, Realtime s'abonnerait en anonyme et la RLS filtrerait tout.
      if (session) await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`conversation:${requestId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
          (payload) => setMessages((current) => mergeMessages(current, [payload.new as ChatMessage])),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "requests", filter: `id=eq.${requestId}` },
          // Chaque message met à jour la conversation : on ne recharge la page
          // que si le statut a changé (confirmation, clôture).
          (payload) => {
            if ((payload.new as { status?: string }).status !== status) router.refresh();
          },
        )
        .subscribe((state) => {
          if (state === "SUBSCRIBED") void catchUp();
        });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    const onOnline = () => void catchUp();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [requestId, status, catchUp, router]);

  // Lecture : à l'ouverture, puis à chaque message reçu de l'autre partie.
  const lastFromOther = [...messages].reverse().find((m) => m.sender_id !== currentUserId)?.id;
  useEffect(() => {
    void markConversationRead(requestId).then(requestUnreadRefresh);
  }, [requestId, lastFromOther]);

  const send = () => {
    const checked = validateMessageBody(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    startSending(async () => {
      const result = await sendMessage(requestId, checked.body);
      if (result.ok) {
        setDraft("");
        setMessages((current) => mergeMessages(current, [result.message]));
      } else {
        // Le texte reste dans la saisie : rien n'est perdu.
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-1 flex-col">
      <ol className="flex-1 space-y-5 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <li className="py-10 text-center text-sm text-slate-500">Aucun message pour l&apos;instant.</li>
        )}
        {groupMessagesByDay(messages).map((group) => (
          <li key={group.key} className="space-y-2">
            <p className="text-center text-[11px] font-medium text-slate-500">{group.label}</p>
            <ol className="space-y-1.5">
              {group.messages.map((m) => {
                const mine = m.sender_id === currentUserId;
                return (
                  <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cx(
                        "max-w-[80%] rounded-2xl px-3.5 py-2",
                        mine ? "rounded-br-md bg-gold/90 text-slate-950" : "rounded-bl-md bg-white/[0.07] text-slate-100",
                      )}
                    >
                      <p className="whitespace-pre-line break-words text-sm">{m.body}</p>
                      <p className={cx("mt-0.5 text-right text-[10px]", mine ? "text-slate-800/70" : "text-slate-500")}>
                        {formatMessageTime(m.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      {readOnlyReason ? (
        <p className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 py-4 text-center text-sm text-slate-400 backdrop-blur-xl">
          {readOnlyReason}
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="sticky bottom-0 space-y-1.5 border-t border-white/10 bg-slate-950/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="message" className="sr-only">
              Votre message
            </label>
            <textarea
              id="message"
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Entrée envoie, Maj+Entrée va à la ligne.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Écrire un message…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/20"
            />
            <button
              type="submit"
              disabled={sending}
              aria-label="Envoyer"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-action text-slate-950 transition hover:brightness-110 disabled:opacity-60"
            >
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error} Votre message n&apos;a pas été envoyé.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Écrire les actions de conversation**

Créer `src/components/messages/ConversationActions.tsx` :

```tsx
"use client";

import { useState, useTransition } from "react";

import { closeConversation, confirmPrestation } from "@/app/actions/messages";

export function ConversationActions({
  requestId,
  role,
  status,
}: {
  requestId: string;
  role: "client" | "partner";
  status: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Clore ou confirmer n'a de sens qu'avant la confirmation.
  if (status !== "pending" && status !== "contacted") return null;

  const run = (action: () => Promise<{ error: string | null }>, question: string) => {
    if (!window.confirm(question)) return;
    start(async () => setError((await action()).error));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {role === "partner" && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => confirmPrestation(requestId),
                "Confirmer la prestation ? Le client pourra alors laisser un avis.",
              )
            }
            className="inline-flex h-10 items-center rounded-xl bg-emerald-500/90 px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
          >
            Confirmer la prestation
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => closeConversation(requestId),
              "Clore la conversation ? Plus personne ne pourra y écrire.",
            )
          }
          className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
        >
          Clore la conversation
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Écrire la page de conversation**

Créer `src/app/messages/[id]/page.tsx` :

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";

import { ConversationActions } from "@/components/messages/ConversationActions";
import { ConversationThread } from "@/components/messages/ConversationThread";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { PaymentStatus } from "@/components/payments/PaymentStatus";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { cx, formatRating } from "@/lib/format";
import { conversationReadOnlyReason, type ChatMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import type { ConversationSummary } from "@/types/database";

export const dynamic = "force-dynamic";

// Titre neutre : jamais le nom de l'interlocuteur dans l'onglet.
export const metadata = { title: "Conversation", robots: { index: false, follow: false } };

interface LegacyRequest {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  message: string;
  desired_date: string | null;
  guests: number | null;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suivant=/messages/${id}`);

  const { data: summary } = await supabase
    .rpc("list_conversations")
    .eq("request_id", id)
    .maybeSingle<ConversationSummary>();
  if (!summary) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, request_id, sender_id, body, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<ChatMessage[]>();

  // Demande anonyme d'avant la messagerie : le partenaire garde ses coordonnées.
  let legacy: LegacyRequest | null = null;
  if (summary.role === "partner" && !summary.client_present) {
    const { data } = await supabase
      .from("requests")
      .select("full_name, phone, email, message, desired_date, guests")
      .eq("id", id)
      .maybeSingle<LegacyRequest>();
    legacy = data;
  }

  let payment: { status: string; amount_xaf: number } | null = null;
  let review: { rating: number; comment: string } | null = null;
  if (summary.role === "client") {
    const [paymentResult, reviewResult] = await Promise.all([
      supabase
        .from("payments")
        .select("status, amount_xaf")
        .eq("request_id", id)
        .eq("payer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string; amount_xaf: number }>(),
      supabase
        .from("reviews")
        .select("rating, comment")
        .eq("request_id", id)
        .eq("author_id", user.id)
        .maybeSingle<{ rating: number; comment: string }>(),
    ]);
    payment = paymentResult.data;
    review = reviewResult.data;
  }

  const readOnlyReason = conversationReadOnlyReason(summary, Boolean(legacy?.full_name));

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        {/* Réserve à droite : le bouton de panique occupe ce coin. */}
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 py-3 pl-4 pr-16 sm:pr-36">
          <Link
            href="/messages"
            aria-label="Retour aux messages"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{summary.other_name}</p>
            <Link
              href={`/annonces/${summary.listing_slug}`}
              className="block truncate text-xs text-slate-400 hover:text-gold-soft"
            >
              {summary.listing_title}
            </Link>
          </div>
          <StatusPill status={summary.status} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4">
        {legacy?.full_name && (
          <section className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="font-medium text-white">{legacy.full_name}</p>
            {legacy.phone && (
              <a href={`tel:${legacy.phone.replace(/\s/g, "")}`} className="text-gold-soft hover:text-gold">
                {legacy.phone}
              </a>
            )}
            {legacy.email && <p className="text-slate-400">{legacy.email}</p>}
            {legacy.message && <p className="whitespace-pre-line pt-1 text-slate-300">{legacy.message}</p>}
          </section>
        )}

        {!readOnlyReason && <ConversationActions requestId={id} role={summary.role} status={summary.status} />}

        {summary.role === "client" && (
          <section className="space-y-3">
            {/* Même règle qu'avant la messagerie : paiement dès que le partenaire
                a répondu, avis une fois la prestation confirmée. */}
            {!payment && (summary.status === "contacted" || summary.status === "confirmed") && (
              <PaymentForm requestId={id} amountXaf={summary.listing_price_xaf} />
            )}
            {payment && <PaymentStatus status={payment.status} amountXaf={payment.amount_xaf} />}

            {review ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-white">
                  <Star className="size-4 fill-amber-300 text-amber-300" aria-hidden />
                  {formatRating(review.rating)} — votre avis
                </p>
                {review.comment && <p className="whitespace-pre-line text-sm text-slate-300">{review.comment}</p>}
              </div>
            ) : summary.status === "confirmed" ? (
              <ReviewForm requestId={id} />
            ) : (
              <p className="text-xs text-slate-500">
                La notation s&apos;ouvrira une fois la prestation confirmée par le partenaire.
              </p>
            )}
          </section>
        )}

        <ConversationThread
          requestId={id}
          currentUserId={user.id}
          status={summary.status}
          initialMessages={messages ?? []}
          readOnlyReason={readOnlyReason}
        />
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-amber-500/15 text-amber-300" },
    contacted: { label: "Contacté", className: "bg-sky-500/15 text-sky-300" },
    confirmed: { label: "Confirmée", className: "bg-emerald-500/15 text-emerald-300" },
    cancelled: { label: "Close", className: "bg-slate-500/15 text-slate-400" },
  };
  const { label, className } = map[status] ?? map.pending;
  return <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>{label}</span>;
}
```

- [ ] **Step 6: Vérifier**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: aucune erreur ; route `ƒ /messages/[id]`.

- [ ] **Step 7: Commit**

```bash
git add src/components/payments/PaymentStatus.tsx src/components/messages "src/app/messages/[id]"
git commit -m "feat(messagerie): fil de discussion en temps réel, confirmation et clôture"
```

---

### Task 9: Onglet Messages et pastille de non-lus

**Files:**
- Create: `src/components/messages/useUnreadCount.ts`
- Modify: `src/components/ui/NavigationBar.tsx`

**Interfaces:**
- Consumes : `unread_message_count` (tâche 2), `UNREAD_REFRESH_EVENT` (tâche 8).
- Produces : lien du dock au nom accessible « Messages » suivi de « , N non lu(s) » quand N > 0 (utilisé par les tests e2e) ; dock masqué sur `/messages/[id]`.

- [ ] **Step 1: Écrire le hook**

Créer `src/components/messages/useUnreadCount.ts` :

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { UNREAD_REFRESH_EVENT } from "@/components/messages/unread-events";
import { createClient } from "@/lib/supabase/client";

/**
 * Nombre total de messages non lus de l'utilisateur connecté (0 sinon).
 * Recalculé à chaque nouveau message reçu (Realtime), après chaque lecture
 * (événement), et à chaque changement de page.
 */
export function useUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let signedIn = false;

    const refresh = async () => {
      if (!signedIn) return;
      const { data } = await supabase.rpc("unread_message_count");
      if (!cancelled) setCount(typeof data === "number" ? data : 0);
    };
    refreshRef.current = () => void refresh();

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      signedIn = true;
      await supabase.realtime.setAuth(session.access_token);
      await refresh();
      channel = supabase
        .channel("unread-badge")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => void refresh())
        .subscribe();
    })();

    const onRefresh = () => void refresh();
    window.addEventListener(UNREAD_REFRESH_EVENT, onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(UNREAD_REFRESH_EVENT, onRefresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    refreshRef.current();
  }, [pathname]);

  return count;
}
```

- [ ] **Step 2: Ajouter l'onglet et masquer le dock dans une conversation**

Dans `src/components/ui/NavigationBar.tsx` :

1. Remplacer l'import d'icônes par `import { Heart, LayoutGrid, MessageCircle, Plus, UserRound, type LucideIcon } from "lucide-react";` et ajouter `import { useUnreadCount } from "@/components/messages/useUnreadCount";`.
2. Dans `TABS`, insérer entre « Annonces » et « Favoris » :

```ts
  {
    href: "/messages",
    label: "Messages",
    icon: MessageCircle,
    isActive: (p) => p.startsWith("/messages"),
  },
```

3. Dans `NavigationBar`, après `const publishing = …`, ajouter :

```ts
  const unread = useUnreadCount(pathname);
  // Dans une conversation, la saisie occupe le bas de l'écran.
  const inConversation = /^\/messages\/(?!nouveau\/)[^/]+$/.test(pathname);
```

et remplacer `onListing ? "hidden lg:flex" : "flex",` par :

```ts
        inConversation ? "hidden" : onListing ? "hidden lg:flex" : "flex",
```

4. Réduire la largeur des onglets pour que cinq éléments tiennent à 320 px : remplacer `w-[clamp(3.75rem,19vw,4.75rem)]` par `w-[clamp(3.2rem,16vw,4.75rem)]`.
5. Dans le `<Link>` des onglets, remplacer `{label}` par :

```tsx
                  {label}
                  {href === "/messages" && unread > 0 && (
                    <span className="absolute right-1.5 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[10px] font-bold leading-none text-white">
                      {unread > 9 ? "9+" : unread}
                      <span className="sr-only">, {unread} non lu{unread > 1 ? "s" : ""}</span>
                    </span>
                  )}
```

- [ ] **Step 3: Vérifier le rendu à 320 px**

Run: `npm run build`, puis dans un second terminal `npx next start -p 3107`, puis :

```bash
mkdir -p test-results && cat > test-results/dock.mjs <<'EOF'
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newContext({
  viewport: { width: 320, height: 640 },
  storageState: { cookies: [], origins: [{ origin: "http://localhost:3107", localStorage: [{ name: "matripa:majeur", value: "1" }] }] },
}).then((c) => c.newPage());
await p.goto("http://localhost:3107/", { waitUntil: "load" });
await p.waitForTimeout(1500);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const links = await p.getByRole("navigation", { name: "Navigation principale" }).getByRole("link").count();
console.log(JSON.stringify({ overflow, links }));
await b.close();
EOF
node test-results/dock.mjs; rm test-results/dock.mjs
```

Expected: `{"overflow":false,"links":5}`. Arrêter ensuite le serveur.

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/useUnreadCount.ts src/components/ui/NavigationBar.tsx
git commit -m "feat(messagerie): onglet Messages et pastille de non-lus en temps réel"
```

---

### Task 10: « Écrire » partout, retrait de WhatsApp et du formulaire

**Files:**
- Modify: `src/components/listings/ProfileModal.tsx`, `src/components/listings/StickyActionBar.tsx`, `src/app/annonces/[slug]/page.tsx`, `src/components/listings/ListingCard.tsx`, `src/components/listings/VideoStories.tsx`, `src/types/listing.ts`, `src/lib/__mocks__/listings.ts`, `src/components/partner/ListingForm.tsx`, `src/app/actions/listings.ts`, `src/lib/listing-form.ts`, `src/app/partenaire/annonces/[id]/modifier/page.tsx`, `src/app/partenaire/page.tsx`, `src/lib/engagement.test.ts`, `src/lib/explore.test.ts`
- Delete: `src/components/listings/WhatsAppDirectButton.tsx`, `src/lib/whatsapp.ts`, `src/lib/whatsapp.test.ts`, `src/app/actions/requests.ts`, `src/components/requests/RequestForm.tsx`, `src/lib/request-form.ts`

**Interfaces:**
- Consumes : route `/messages/nouveau/[slug]` (tâche 7).
- Produces : liens « Écrire » (nom accessible exact) sur la fiche rapide, la fiche complète et le bandeau mobile.

- [ ] **Step 1: Fiche rapide**

Dans `src/components/listings/ProfileModal.tsx` :
1. Supprimer l'import `import { whatsAppLink } from "@/lib/whatsapp";` et la constante `whatsappHref` (avec son appel).
2. Remplacer `Send` par rien dans l'import `lucide-react` (garder `MessageCircle`).
3. Remplacer tout le bloc `{whatsappHref ? ( … ) : ( … )}` du pied de la fiche par :

```tsx
            <Link
              href={`/messages/nouveau/${listing.slug}`}
              className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-slate-950 shadow-[0_8px_25px_-10px_rgb(233_200_119/0.6)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
            >
              <MessageCircle className="size-5 shrink-0" aria-hidden />
              Écrire
            </Link>
```

- [ ] **Step 2: Bandeau mobile**

Dans `src/components/listings/StickyActionBar.tsx` :
1. Supprimer la prop `whatsappPhone` (interface et paramètres), l'import de `whatsAppLink`, la constante `whatsappUrl` et le bloc `{whatsappUrl && ( … )}`.
2. Remplacer `href={\`/demande/${listingSlug}\`}` par `href={\`/messages/nouveau/${listingSlug}\`}` et le libellé `Contacter` par `Écrire`.
3. Remplacer le commentaire de tête « Deux actions : … » par « Une action : écrire au profil, par la messagerie de Matripa. »

- [ ] **Step 3: Fiche complète**

Dans `src/app/annonces/[slug]/page.tsx` :
1. Supprimer l'import de `WhatsAppDirectButton` et le bloc `{/* WhatsApp direct instantané */}` + `<WhatsAppDirectButton … />`.
2. Dans `<StickyActionBar … />`, supprimer la ligne `whatsappPhone={listing.whatsapp_phone}`.
3. Remplacer `href={\`/demande/${listing.slug}\`}` par `href={\`/messages/nouveau/${listing.slug}\`}` et `Effectuer une demande formelle` par `Écrire`.
4. Remplacer le texte « Discrétion totale garantie. Vos coordonnées ne sont transmises qu'après confirmation mutuelle. » par « Vos échanges restent sur Matripa : aucune coordonnée n'est partagée. » (en JSX : `Vos échanges restent sur Matripa : aucune coordonnée n&apos;est partagée.`).

- [ ] **Step 4: Carte et stories**

Dans `src/components/listings/ListingCard.tsx` : supprimer l'import de `whatsAppLink`, la constante `whatsappHref`, le bloc `{whatsappHref && ( … )}`, l'import de `MessageCircle` s'il n'est plus utilisé, et remplacer `className={cx("relative flex flex-col gap-1.5 p-4", whatsappHref && "pr-14")}` par `className="relative flex flex-col gap-1.5 p-4"`.
Dans `src/components/listings/VideoStories.tsx` : supprimer l'import de `whatsAppLink`, la constante `whatsappHref` et le bloc `{/* Bouton WhatsApp … */}{whatsappHref && ( … )}` ; retirer `MessageCircle` de l'import s'il n'est plus utilisé.

- [ ] **Step 5: Types des projections**

Dans `src/types/listing.ts` :
- retirer `| "whatsapp_phone"` de `ListingCardData` et de `VideoStory` (avec leurs commentaires) ;
- retirer `, whatsapp_phone` de `LISTING_CARD_COLUMNS` et de `VIDEO_STORY_COLUMNS` ;
- remplacer le commentaire de `whatsapp_phone?: string | null;` dans `Listing` par `/** Plus affiché ni saisi depuis la messagerie (migration 0015) ; colonne conservée. */`.

Dans `src/lib/explore.test.ts`, supprimer la ligne `whatsapp_phone: null,` de la fixture.

Dans `src/lib/__mocks__/listings.ts`, supprimer les quatre lignes `whatsapp_phone: "+242…",` des annonces fictives et la ligne `whatsapp_phone: l.whatsapp_phone,` de la projection en cartes : ce champ ne fait plus partie de `ListingCardData`.

- [ ] **Step 6: Formulaire partenaire**

1. Dans `src/components/partner/ListingForm.tsx` : supprimer le `<Field label="Numéro WhatsApp" …>…</Field>` complet et la ligne `whatsapp_phone: string | null;` de `EditableListing`.
2. Dans `src/app/partenaire/annonces/[id]/modifier/page.tsx` : retirer `whatsapp_phone, ` de la projection.
3. Dans `src/app/actions/listings.ts` : supprimer l'import de `whatsAppForStorage`, la ligne `whatsapp_phone: string | null;` de `ParsedListing`, le bloc de validation `const whatsapp = whatsAppForStorage(…)` avec son `if`, et la ligne `whatsapp_phone: whatsapp.ok ? whatsapp.value : null,`.
4. Dans `src/lib/listing-form.ts` : retirer `| "whatsapp_phone"` du type des erreurs.

- [ ] **Step 7: Tableau de bord partenaire**

Dans `src/app/partenaire/page.tsx` :
1. Supprimer l'import `setRequestStatus`, l'interface `OwnRequest`, la requête `requests` du `Promise.all` (ne garder que `listings`, en écrivant `const { data: listings } = await supabase.from("listings")…`), les constantes `inbox` et `titleById`, et les fonctions `RequestStatusPill` et `RequestAction` en fin de fichier. Retirer `Inbox` et `Phone` de l'import `lucide-react` s'ils ne sont plus utilisés, et ajouter `MessageCircle`.
2. Après la ligne `const { data: listings } = …`, ajouter :

```ts
  const { data: unread } = await supabase.rpc("unread_message_count");
```

3. Remplacer toute la `<section>` « Demandes reçues » par :

```tsx
      <section>
        <Link
          href="/messages"
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-gold/30 hover:bg-white/[0.05]"
        >
          <MessageCircle className="size-5 text-gold" aria-hidden />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-white">Messages de vos clients</span>
            <span className="block text-xs text-slate-400">
              Répondez, confirmez les prestations et suivez vos échanges.
            </span>
          </span>
          {(unread ?? 0) > 0 && (
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-neon px-2 text-xs font-bold text-white">
              {unread}
            </span>
          )}
        </Link>
      </section>
```

- [ ] **Step 8: Supprimer le code devenu inutile**

```bash
git rm src/components/listings/WhatsAppDirectButton.tsx src/lib/whatsapp.ts src/lib/whatsapp.test.ts src/app/actions/requests.ts src/components/requests/RequestForm.tsx src/lib/request-form.ts
```

Dans `src/lib/engagement.test.ts`, supprimer l'import `whatsAppLink` et tout le bloc `describe("Formatage du contact WhatsApp direct", …)`.

- [ ] **Step 9: Vérifier qu'il ne reste aucune référence**

Run: `grep -rn "whatsapp\|WhatsApp\|RequestForm\|request-form\|actions/requests\|/demande/" src | grep -v "demande/\[slug\]/page.tsx"`
Expected: seule la ligne du commentaire `whatsapp_phone?:` de `src/types/listing.ts`.

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: aucune erreur ; tous les tests passent.

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "feat(messagerie): bouton « Écrire », retrait de WhatsApp et du formulaire de demande"
```

---

### Task 11: Parcours de bout en bout

**Files:**
- Modify: `e2e/helpers.ts`, `e2e/avis.spec.ts`, `e2e/catalogue.spec.ts`, `e2e/partenaire.spec.ts`
- Create: `e2e/messages.spec.ts`
- Delete: `e2e/demande.spec.ts`

**Interfaces:**
- Consumes : libellés des tâches 7 à 10 (« Votre pseudonyme », « Votre message », « Envoyer », « Écrire », « Confirmer la prestation », « Clore la conversation », « Cette conversation est close. », « C'est votre propre profil », nom accessible du dock « Messages, N non lu(s) »).
- Produces : `writeToListing(page, slug, body, displayName?)` dans `e2e/helpers.ts`.

- [ ] **Step 1: Aides**

Dans `e2e/helpers.ts` :
1. Dans `publishListing`, remplacer la signature `overrides: { city?: string; category?: string; whatsapp?: string } = {},` par `overrides: { city?: string; category?: string } = {},` et supprimer la ligne `if (overrides.whatsapp) …`.
2. Ajouter à la fin :

```ts
/** Écrit à un profil ; renseigne le pseudonyme au premier message. */
export async function writeToListing(page: Page, slug: string, body: string, displayName = "Client E2E") {
  await gotoReady(page, `/messages/nouveau/${slug}`);
  const pseudo = page.getByLabel("Votre pseudonyme");
  if (await pseudo.count()) await pseudo.fill(displayName);
  await page.getByLabel("Votre message").fill(body);
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
}

/** Slug d'un profil publié par le partenaire connecté, depuis son tableau de bord. */
export async function ownListingSlug(page: Page, titre: string): Promise<string> {
  const href = await page.getByRole("link", { name: new RegExp(titre) }).first().getAttribute("href");
  return href!.split("/").pop()!;
}
```

- [ ] **Step 2: Nouveau fichier `e2e/messages.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

import {
  TEST_PASSWORD,
  firstListingPath,
  gotoReady,
  ownListingSlug,
  publishListing,
  signUpPartner,
  uniqueEmail,
  writeToListing,
} from "./helpers";

test.describe("Messagerie", () => {
  test("sans session, écrire passe par l'inscription puis revient au message", async ({ page }) => {
    const slug = (await firstListingPath(page)).split("/").pop()!;

    await page.goto(`/messages/nouveau/${slug}`);
    await expect(page).toHaveURL(
      ({ pathname, searchParams }) =>
        pathname === "/connexion" && searchParams.get("suivant") === `/messages/nouveau/${slug}`,
    );

    await page.getByRole("tab", { name: "inscription" }).click();
    await page.getByLabel("Adresse e-mail").fill(uniqueEmail());
    await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    await page.waitForURL(`**/messages/nouveau/${slug}`);
    await expect(page.getByLabel("Votre pseudonyme")).toBeVisible();
  });

  test("le partenaire reçoit le message et la réponse arrive sans recharger", async ({ browser }) => {
    test.slow();
    const partnerCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const partner = await partnerCtx.newPage();
    const client = await clientCtx.newPage();

    await signUpPartner(partner);
    const titre = await publishListing(partner);
    const slug = await ownListingSlug(partner, titre);

    await signUpPartner(client);
    await writeToListing(client, slug, "Bonjour, êtes-vous disponible samedi ?", "Awa");
    await expect(client.getByText("Bonjour, êtes-vous disponible samedi ?")).toBeVisible();

    await gotoReady(partner, "/messages");
    await expect(
      partner.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: /Messages, 1 non lu/ }),
    ).toBeVisible();
    await partner.getByRole("link", { name: /Awa/ }).click();
    await expect(partner.getByText("Bonjour, êtes-vous disponible samedi ?")).toBeVisible();

    await partner.getByLabel("Votre message").fill("Oui, à partir de 14 h.");
    await partner.getByRole("button", { name: "Envoyer" }).click();

    // Le client n'a pas rechargé sa page : le message arrive par Realtime.
    await expect(client.getByText("Oui, à partir de 14 h.")).toBeVisible({ timeout: 15_000 });

    await partnerCtx.close();
    await clientCtx.close();
  });

  test("une conversation close ne peut plus recevoir de message", async ({ browser }) => {
    test.slow();
    const partnerCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const partner = await partnerCtx.newPage();
    const client = await clientCtx.newPage();

    await signUpPartner(partner);
    const slug = await ownListingSlug(partner, await publishListing(partner));

    await signUpPartner(client);
    await writeToListing(client, slug, "Premier message.");

    client.once("dialog", (dialog) => dialog.accept());
    await client.getByRole("button", { name: "Clore la conversation" }).click();
    await expect(client.getByText("Cette conversation est close.")).toBeVisible();
    await expect(client.getByLabel("Votre message")).toHaveCount(0);

    // « Écrire » ramène à l'historique, sans rouvrir.
    await client.goto(`/messages/nouveau/${slug}`);
    await client.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
    await expect(client.getByText("Cette conversation est close.")).toBeVisible();

    await partnerCtx.close();
    await clientCtx.close();
  });

  test("on ne peut pas s'écrire à soi-même", async ({ page }) => {
    await signUpPartner(page);
    const slug = await ownListingSlug(page, await publishListing(page));

    await gotoReady(page, `/messages/nouveau/${slug}`);
    await expect(page.getByText("C'est votre propre profil")).toBeVisible();
  });
});
```

- [ ] **Step 3: Réécrire `e2e/avis.spec.ts` sur la messagerie**

Remplacer tout le fichier par :

```ts
import { expect, test } from "@playwright/test";

import { gotoReady, ownListingSlug, publishListing, signUpPartner, writeToListing } from "./helpers";

test.describe("Suivi client et avis", () => {
  test("l'accès sans session redirige vers la connexion", async ({ page }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(({ pathname, searchParams }) => {
      return pathname === "/connexion" && searchParams.get("suivant") === "/messages";
    });
  });

  test("un nouveau compte n'a aucune conversation", async ({ page }) => {
    await signUpPartner(page);
    await gotoReady(page, "/messages");

    await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
    await expect(page.getByText("Aucune conversation")).toBeVisible();
  });

  /**
   * La chaîne de confiance de bout en bout : le client écrit, le partenaire
   * répond puis confirme, le client note. Seul test qui prouve que la note
   * publique provient d'une prestation confirmée.
   */
  test("une prestation confirmée devient une note publique", async ({ browser }) => {
    test.slow();
    const partnerCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const partner = await partnerCtx.newPage();
    const client = await clientCtx.newPage();

    await signUpPartner(partner);
    const slug = await ownListingSlug(partner, await publishListing(partner));

    await signUpPartner(client);
    await writeToListing(client, slug, "Bonjour, je souhaite réserver.", "Cliente Test");
    await expect(client.getByText(/La notation s.ouvrira/)).toBeVisible();
    await expect(client.getByRole("button", { name: "Publier mon avis" })).toBeHidden();

    await gotoReady(partner, "/messages");
    await partner.getByRole("link", { name: /Cliente Test/ }).click();
    await partner.getByLabel("Votre message").fill("Avec plaisir.");
    await partner.getByRole("button", { name: "Envoyer" }).click();
    partner.once("dialog", (dialog) => dialog.accept());
    await partner.getByRole("button", { name: "Confirmer la prestation" }).click();
    await expect(partner.getByText("Confirmée")).toBeVisible();

    await gotoReady(client, client.url());
    await client.getByRole("radio", { name: "4 étoiles" }).click();
    await client.getByRole("button", { name: "Publier mon avis" }).click();
    await expect(client.getByText(/4,0 — votre avis/)).toBeVisible();

    await gotoReady(client, `/annonces/${slug}`);
    await expect(client.getByText(/\(1 avis\)/)).toBeVisible();
    await expect(client.getByText("4,0").first()).toBeVisible();

    await partnerCtx.close();
    await clientCtx.close();
  });
});
```

- [ ] **Step 4: Ajuster les autres fichiers**

- `e2e/catalogue.spec.ts` : dans le test « la fiche détail expose les informations clés », remplacer `page.getByRole("link", { name: /Effectuer une demande/ }),` par `page.getByRole("link", { name: "Écrire" }),`.
- `e2e/partenaire.spec.ts` : supprimer le test « le numéro WhatsApp saisi par le partenaire ouvre la bonne conversation » ; retirer `publishListing` de l'import s'il n'est plus utilisé.
- Supprimer `e2e/demande.spec.ts` : `git rm e2e/demande.spec.ts` (le formulaire n'existe plus ; l'anti-spam est couvert par les tests pgTAP de la tâche 2).

- [ ] **Step 5: Lancer toute la suite**

Run: `npx playwright test`
Expected: tous les tests passent. En cas d'échec d'inscription (« La création du compte a échoué ») sur plusieurs tests consécutifs, vérifier qu'aucun autre programme n'a réinitialisé la base locale pendant le passage (`docker inspect -f '{{.State.StartedAt}}' supabase_db_MATRIPA_FINAL`) avant de chercher une cause dans le code.

- [ ] **Step 6: Commit**

```bash
git add -A e2e
git commit -m "test(e2e): parcours de messagerie, avis et temps réel"
```

---

### Task 12: Mise en production (avec Tricia)

**Files:** aucun.

- [ ] **Step 1: Vérifications finales en local**

Run: `npx tsc --noEmit && npx vitest run && supabase test db && npm run build`
Expected: tout passe.

- [ ] **Step 2: Essai à blanc sur la production**

Run: `supabase migration list --linked && supabase db push --dry-run`
Expected: seules `0015_messagerie_schema.sql` et `0016_messagerie_fonctions.sql` sont listées. Si d'autres migrations apparaissent, s'arrêter et prévenir Tricia.

- [ ] **Step 3: Tricia applique la migration**

Tricia lance `supabase db push` dans son terminal. Si la migration 0015 échoue avec « plusieurs demandes d'un même client sur un même profil », s'arrêter : des doublons existent en production et doivent être fusionnés à la main avant de recommencer.

- [ ] **Step 4: Envoi du code, immédiatement après**

Tricia envoie le code (`git push` avec un jeton neuf). Entre les deux étapes, l'ancien formulaire de demande est inutilisable : la fenêtre doit être la plus courte possible.

- [ ] **Step 5: Vérifier en production**

Une fois le déploiement Vercel *Ready* :
- `/messages` sans session redirige vers `/connexion?suivant=/messages` ;
- la fiche rapide et la fiche complète affichent « Écrire », aucun lien `wa.me` ni `/demande/` ;
- en visiteur anonyme, `GET /rest/v1/messages?select=id` renvoie `42501`.

Prévenir Tricia : les 15 profils de démonstration n'ont pas de partenaire propriétaire ; les messages qui leur sont écrits restent sans réponse possible.
