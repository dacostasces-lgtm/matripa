-- Propriétés de sécurité du signalement d'annonces.
--
-- Exécution :  supabase test db     (nécessite `supabase start`)
--
-- Ce qui est verrouillé ici : on ne signale qu'avec un compte et jamais sa
-- propre annonce, un motif urgent masque immédiatement le profil, le
-- partenaire ne peut pas lever la suspension, le signaleur ne voit pas la
-- suite donnée, et chaque décision de l'équipe est tracée.

begin;
select plan(40);

-- Jeu d'essai ---------------------------------------------------------------
-- r1, r2, r3 : signaleurs · o1 : propriétaire vérifié · o2 : propriétaire
-- vérifié, bloqué en fin de fichier · adm : administrateur
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, 'x', '', '', '', '', '', '', '', '', now(), now(), now()
  from (values
    ('d0000000-0000-0000-0000-000000000001', 'rep-r1@test.cg'),
    ('d0000000-0000-0000-0000-000000000002', 'rep-r2@test.cg'),
    ('d0000000-0000-0000-0000-000000000003', 'rep-o1@test.cg'),
    ('d0000000-0000-0000-0000-000000000004', 'rep-admin@test.cg'),
    ('d0000000-0000-0000-0000-000000000005', 'rep-o2@test.cg'),
    ('d0000000-0000-0000-0000-000000000006', 'rep-r3@test.cg')
  ) as u(id, email);

insert into public.admins (user_id) values ('d0000000-0000-0000-0000-000000000004');

-- Insérées en superutilisateur : le trigger de publication ne s'applique pas.
insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified
)
select l.id::uuid, l.slug, 'Profil ' || l.slug,
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 30000, 'hour',
       'https://exemple/' || l.slug || '.jpg', 'published', l.owner::uuid, true
  from (values
    ('d1000000-0000-0000-0000-000000000001', 'rep-l1', 'd0000000-0000-0000-0000-000000000003'),
    ('d1000000-0000-0000-0000-000000000002', 'rep-l2', 'd0000000-0000-0000-0000-000000000003'),
    ('d1000000-0000-0000-0000-000000000003', 'rep-l3', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000004', 'rep-l4', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000005', 'rep-l5', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000006', 'rep-l6', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000007', 'rep-l7', 'd0000000-0000-0000-0000-000000000005'),
    ('d1000000-0000-0000-0000-000000000008', 'rep-l8', 'd0000000-0000-0000-0000-000000000005')
  ) as l(id, slug, owner);

insert into public.verification_requests (user_id, status, challenge_code, document_type, reviewed_at)
values ('d0000000-0000-0000-0000-000000000005', 'approved', 'FIXTUR', 'cni', now());

/* -------------------------------------------------------------------------- */
/*                                  Accès                                     */
/* -------------------------------------------------------------------------- */

select ok(
  not has_function_privilege('anon', 'public.submit_report(uuid,report_reason,text)', 'EXECUTE'),
  'un visiteur non connecté ne peut pas signaler'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into public.listing_reports (listing_id, reporter_id, reason, is_urgent)
     values ('d1000000-0000-0000-0000-000000000001',
             'd0000000-0000-0000-0000-000000000001', 'faux_profil', false) $$,
  '42501',
  null,
  'un signalement ne peut pas être inséré directement'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'faux_profil', null) $$,
  'own_listing',
  'un partenaire ne peut pas signaler sa propre annonce'
);

/* -------------------------------------------------------------------------- */
/*                              Signalement                                   */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'faux_profil',
       'Photos reprises d''un autre site.') $$,
  'un compte peut signaler une annonce visible'
);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000001', 'arnaque', null) $$,
  'already_reported',
  'un second signalement ouvert sur la même annonce est refusé'
);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000002', 'autre', 'court') $$,
  'details_required',
  '« autre » exige des précisions'
);

select is(
  (select reason::text from public.listing_reports),
  'faux_profil',
  'le signaleur relit le motif de son signalement'
);

select throws_ok(
  $$ select status from public.listing_reports $$,
  '42501',
  null,
  'le signaleur ne peut pas lire la suite donnée à son signalement'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l1'),
  1,
  'un motif non urgent ne masque pas le profil'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.listing_reports),
  0,
  'un tiers ne voit aucun signalement'
);

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000002', 'personne_mineure', null) $$,
  'un compte peut signaler une personne mineure présumée'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  0,
  'un motif urgent masque immédiatement le profil'
);

select throws_ok(
  $$ select submit_request('d1000000-0000-0000-0000-000000000002'::uuid,
       'Client Test', '+242 06 505 50 50', null, '', null::date, null::smallint) $$,
  'listing_unavailable',
  'un profil suspendu ne reçoit plus de demande'
);

reset role;

insert into public.requests (id, listing_id, full_name, phone, status, author_id)
values ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
        'Client Paiement', '+242 06 606 60 60', 'pending', 'd0000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from create_payment('d3000000-0000-0000-0000-000000000001'::uuid,
       'MTN_MOMO_COG'::payment_provider, '242061234567') $$,
  'listing_unavailable',
  'une réservation sur un profil suspendu ne peut pas être payée'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ update public.listings set suspended_at = null
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'le partenaire ne peut pas lever la suspension'
);

select lives_ok(
  $$ update public.listings set status = 'draft'
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  'le partenaire peut repasser son profil suspendu en brouillon'
);

select lives_ok(
  $$ update public.listings set status = 'published'
      where id = 'd1000000-0000-0000-0000-000000000002' $$,
  'le partenaire vérifié peut le republier'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  0,
  'republier ne lève pas la suspension'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                             Limite horaire                                 */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select * from submit_report('d1000000-0000-0000-0000-000000000004', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000005', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000006', 'arnaque', null);
select * from submit_report('d1000000-0000-0000-0000-000000000007', 'arnaque', null);

select throws_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000008', 'arnaque', null) $$,
  'rate_limited',
  'le sixième signalement en une heure est refusé'
);

/* -------------------------------------------------------------------------- */
/*                              Administration                                */
/* -------------------------------------------------------------------------- */

select throws_ok(
  $$ select review_report((select id from public.listing_reports limit 1), 'dismiss') $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas trancher un signalement'
);

select throws_ok(
  $$ select * from admin_list_open_reports() $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas lister les signalements'
);

reset role;

-- Un profil suspendu n'est plus signalable par l'application : le second
-- signalement urgent est posé en superutilisateur.
insert into public.listing_reports (id, listing_id, owner_id, reporter_id, reason, is_urgent)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000006',
        'contrainte_exploitation', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from admin_list_open_reports()),
  7,
  'l''administrateur voit tous les signalements ouverts'
);

select is(
  (select is_urgent from admin_list_open_reports() limit 1),
  true,
  'les signalements urgents sont listés en tête'
);

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports() where reason = 'personne_mineure'), 'dismiss') $$,
  'un administrateur peut juger un signalement infondé'
);

reset role;

select ok(
  (select suspended_at is not null from public.listings
    where id = 'd1000000-0000-0000-0000-000000000002'),
  'la suspension reste tant qu''un autre signalement urgent est ouvert'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ select review_report('d2000000-0000-0000-0000-000000000001', 'dismiss', 'Vérification faite') $$,
  'le second signalement urgent est aussi jugé infondé'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings where slug = 'rep-l2'),
  1,
  'la suspension est levée quand plus aucun signalement urgent n''est ouvert'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000001'), 'remove') $$,
  'note_required',
  'retirer un profil exige une note'
);

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000001'),
       'remove', 'Photos volées confirmées') $$,
  'un administrateur peut retirer un profil'
);

select throws_ok(
  $$ select review_report('d2000000-0000-0000-0000-000000000001', 'dismiss') $$,
  'already_reviewed',
  'un signalement déjà traité ne peut pas l''être une seconde fois'
);

reset role;

select is(
  (select status::text from public.listings where id = 'd1000000-0000-0000-0000-000000000001'),
  'archived',
  'retirer le profil l''archive'
);

select ok(
  (select suspended_at is not null from public.listings
    where id = 'd1000000-0000-0000-0000-000000000001'),
  'et le suspend définitivement'
);

/* -------------------------------------------------------------------------- */
/*                            Constat de minorité                             */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000006","role":"authenticated"}';

select lives_ok(
  $$ select * from submit_report('d1000000-0000-0000-0000-000000000003', 'personne_mineure',
       'Semble avoir moins de 18 ans.') $$,
  'un troisième compte signale le profil d''un autre partenaire'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ select review_report(
       (select id from admin_list_open_reports()
         where listing_id = 'd1000000-0000-0000-0000-000000000003'), 'block_minor') $$,
  'un administrateur peut constater la minorité depuis un signalement'
);

reset role;

select is(
  (select count(*)::int from public.listings
    where owner_id = 'd0000000-0000-0000-0000-000000000005' and status <> 'archived'),
  0,
  'constat de minorité : tous les profils du compte sont archivés'
);

select is(
  (select count(*)::int from public.verification_blocks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  1,
  'le compte est bloqué'
);

select is(
  (select status::text from public.verification_requests
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  'revoked',
  'sa vérification approuvée est révoquée'
);

select is(
  (select count(*)::int from public.listing_reports
    where owner_id = 'd0000000-0000-0000-0000-000000000005' and status = 'open'),
  0,
  'les autres signalements ouverts sur ses profils sont clos'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'blocked',
  'le compte bloqué ne peut plus demander de vérification'
);

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log where report_id is not null),
  4,
  'chaque décision sur un signalement est journalisée'
);

reset role;

select * from finish();
rollback;
