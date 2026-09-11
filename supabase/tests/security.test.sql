-- Propriétés de sécurité de la base : RLS, GRANT de colonne, anti-spam.
--
-- Exécution :  supabase test db     (nécessite `supabase start`)
--
-- Ces tests protègent ce qui est le plus coûteux à casser sans s'en rendre
-- compte : un partenaire capable de s'auto-certifier, un visiteur capable de
-- lire les coordonnées des clients, ou un formulaire de spam sans limite.

begin;
select plan(34);

-- Jeu d'essai ---------------------------------------------------------------
-- Les colonnes de jetons sont mises à '' et non laissées à NULL : GoTrue les
-- lit comme des chaînes non-nullables et l'API Admin échouerait sinon.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'proprietaire@test.cg', 'x',
  '', '', '', '', '', '', '', '', now(), now(), now()
), (
  '33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'intrus@test.cg', 'x',
  '', '', '', '', '', '', '', '', now(), now(), now()
);

insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id
) values (
  '22222222-2222-2222-2222-222222222222', 'offre-test', 'Offre de test',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-a', 'option_1', 'sur_place', 'brazzaville',
  50000, 'night', 'https://exemple/cover.jpg', 'published',
  '11111111-1111-1111-1111-111111111111'
), (
  '44444444-4444-4444-4444-444444444444', 'offre-brouillon', 'Offre en brouillon',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-b', 'option_2', 'a_domicile', 'pointe-noire',
  30000, 'service', 'https://exemple/cover2.jpg', 'draft',
  '11111111-1111-1111-1111-111111111111'
);

-- Visibilité publique -------------------------------------------------------
set local role anon;

-- Assertions ancrées sur les seules fixtures : `supabase db reset` applique
-- aussi seed.sql, un comptage global dépendrait du jeu de démonstration.
select is(
  (select count(*)::int from public.listings
    where slug in ('offre-test', 'offre-brouillon')),
  1,
  'anon ne voit que les annonces publiées, jamais les brouillons'
);

select throws_ok(
  $$ insert into public.requests (listing_id, full_name, phone)
     values ('22222222-2222-2222-2222-222222222222', 'Fraudeur', '+242060000000') $$,
  '42501',
  null,
  'anon ne peut pas insérer directement dans requests'
);

select throws_ok(
  $$ select * from private_config $$,
  '42501',
  null,
  'anon ne peut pas lire private_config, qui contient le secret du webhook'
);

select lives_ok(
  $$ select submit_request('22222222-2222-2222-2222-222222222222'::uuid,
       'Client Test', '+242 06 111 11 11', null, '', null::date, null::smallint) $$,
  'anon peut déposer une demande via submit_request'
);

select throws_ok(
  $$ select submit_request('44444444-4444-4444-4444-444444444444'::uuid,
       'Client Test', '+242 06 999 99 99', null, '', null::date, null::smallint) $$,
  'listing_unavailable',
  'une demande sur une annonce en brouillon est refusée'
);

select throws_ok(
  $$ select * from public.requests $$,
  '42501',
  null,
  'anon ne peut pas relire les demandes, qui contiennent des coordonnées'
);

reset role;

-- Anti-spam -----------------------------------------------------------------
-- Quatre appels supplémentaires portent le compteur à cinq pour ce numéro.
set local role anon;
select submit_request('22222222-2222-2222-2222-222222222222'::uuid,
  'Client Test', '+242 06 111 11 11', null, '', null::date, null::smallint)
from generate_series(1, 4);

select throws_ok(
  $$ select submit_request('22222222-2222-2222-2222-222222222222'::uuid,
       'Client Test', '+242 06 111 11 11', null, '', null::date, null::smallint) $$,
  'rate_limited',
  'la sixième demande en une heure pour un même numéro est refusée'
);
reset role;

-- Périmètre du propriétaire -------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.listings set title = 'Titre modifié'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  'le propriétaire peut modifier le titre de son annonce'
);

select throws_ok(
  $$ update public.listings set is_verified = true
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'le propriétaire ne peut pas se certifier lui-même'
);

select throws_ok(
  $$ update public.listings set is_vip = true
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'le propriétaire ne peut pas se placer en VIP'
);

select throws_ok(
  $$ update public.listings set rating = 5.0
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'le propriétaire ne peut pas gonfler sa propre note'
);

select is(
  (select count(*)::int from public.requests
    where listing_id = '22222222-2222-2222-2222-222222222222'),
  5,
  'le propriétaire voit les demandes reçues sur ses annonces'
);

select ok(
  (select bool_and(not is_admin) from (select public.is_admin() as is_admin) t),
  'un partenaire ordinaire n''est pas administrateur'
);

select throws_ok(
  $$ select set_listing_certification('22222222-2222-2222-2222-222222222222'::uuid, true, true) $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas certifier une annonce'
);

-- Un tiers authentifié ------------------------------------------------------
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.requests
    where listing_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'un autre partenaire ne voit aucune demande qui ne le concerne pas'
);

-- PostgREST renvoie 200 avec zéro ligne quand RLS bloque une mise à jour :
-- l'absence d'erreur ne vaut pas succès, d'où le comptage explicite.
update public.listings set title = 'Détourné'
 where id = '22222222-2222-2222-2222-222222222222';

reset role;

select is(
  (select title from public.listings where id = '22222222-2222-2222-2222-222222222222'),
  'Titre modifié',
  'la modification par un tiers ne change aucune ligne, sans lever d''erreur'
);

-- Avis ---------------------------------------------------------------------
-- Règle de confiance : on ne note que ce qu'on a réellement consommé.

insert into public.requests (id, listing_id, full_name, phone, status, author_id)
values ('55555555-5555-5555-5555-555555555555',
        '22222222-2222-2222-2222-222222222222',
        'Client Noteur', '+242 06 777 77 77', 'pending',
        '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (request_id, listing_id, author_id, rating)
     values ('55555555-5555-5555-5555-555555555555',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111', 5) $$,
  '42501',
  null,
  'un avis ne peut pas être inséré directement, même par son auteur'
);

select throws_ok(
  $$ select submit_review('55555555-5555-5555-5555-555555555555'::uuid, 5::smallint, '') $$,
  'not_eligible',
  'une demande non confirmée ne donne pas droit à un avis'
);

reset role;
update public.requests set status = 'confirmed'
 where id = '55555555-5555-5555-5555-555555555555';

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ select submit_review('55555555-5555-5555-5555-555555555555'::uuid, 1::smallint, 'Sabotage') $$,
  'not_eligible',
  'un tiers ne peut pas noter la demande de quelqu''un d''autre'
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select submit_review('55555555-5555-5555-5555-555555555555'::uuid, 4::smallint, 'Très bien') $$,
  'le client peut noter sa propre demande confirmée'
);

select throws_ok(
  $$ select submit_review('55555555-5555-5555-5555-555555555555'::uuid, 5::smallint, 'Encore') $$,
  'already_reviewed',
  'un second avis sur la même demande est refusé'
);

reset role;

-- Le trigger est la seule écriture possible sur `rating` : s'il ne se
-- déclenchait pas, la note resterait nulle sans qu'aucune erreur ne le dise.
select is(
  (select rating::text from public.listings
    where id = '22222222-2222-2222-2222-222222222222'),
  '4.0',
  'la note de l''annonce est recalculée par le trigger'
);

/* -------------------------------------------------------------------------- */
/*                           Modération des avis                              */
/* -------------------------------------------------------------------------- */

-- L'avis déposé plus haut sert de cible. Le propriétaire de l'annonce n'est
-- pas administrateur : il ne doit pas pouvoir faire disparaître une mauvaise
-- note sur sa propre offre.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select moderate_review(
       (select id from public.reviews
         where listing_id = '22222222-2222-2222-2222-222222222222' limit 1)) $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas retirer un avis'
);

reset role;

-- Promotion du tiers en administrateur, puis retrait effectif.
insert into public.admins (user_id)
values ('33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ select moderate_review(
       (select id from public.reviews
         where listing_id = '22222222-2222-2222-2222-222222222222' limit 1),
       'Contenu hors sujet') $$,
  'un administrateur peut retirer un avis'
);

reset role;

-- Le retrait doit remonter jusqu'à la note portée par l'annonce : sans cela,
-- une note fondée sur un avis supprimé continuerait d'être affichée.
select is(
  (select rating from public.listings
    where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'le retrait d''un avis remet la note à zéro via le trigger'
);

-- Le journal contient désormais une ligne. RLS filtre les *lignes* sans lever
-- d'erreur : un non-administrateur ne reçoit pas un refus, il reçoit un
-- résultat vide. C'est ce qu'il faut vérifier — attendre une exception ferait
-- passer le test pour vert alors qu'il ne prouverait rien.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log),
  0,
  'le journal de modération est invisible hors administration'
);

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log),
  1,
  'l''administrateur voit la trace du retrait qu''il a effectué'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                        Paiements mobile money                              */
/* -------------------------------------------------------------------------- */

-- L'annonce vaut 50 000 FCFA (fixture initiale). Le montant débité doit venir
-- de là, jamais du client.

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.payments (request_id, listing_id, payer_id, amount_xaf, provider, phone)
     values ('55555555-5555-5555-5555-555555555555',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111', 1, 'MTN_MOMO_COG', '242061234567') $$,
  '42501',
  null,
  'un paiement ne peut pas être inséré directement, ce qui interdit de choisir son montant'
);

-- `settle_payment` marque un paiement comme abouti. Si le rôle client pouvait
-- l'appeler, n'importe qui se déclarerait payé.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.settle_payment(uuid,payment_status,text,text)',
    'EXECUTE'),
  'un rôle client ne peut pas solder un paiement lui-même'
);

select lives_ok(
  $$ select create_payment('55555555-5555-5555-5555-555555555555'::uuid,
                           'MTN_MOMO_COG'::payment_provider, '242061234567') $$,
  'le client peut initier un paiement sur sa propre demande'
);

reset role;

select is(
  (select amount_xaf from public.payments
    where request_id = '55555555-5555-5555-5555-555555555555'),
  50000,
  'le montant est repris du tarif de l''annonce, pas fourni par le payeur'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select create_payment('55555555-5555-5555-5555-555555555555'::uuid,
                           'AIRTEL_COG'::payment_provider, '242069999999') $$,
  'payment_already_exists',
  'un second paiement en cours sur la même demande est refusé'
);

-- Un tiers ne doit ni initier un paiement sur la demande d'autrui, ni le voir.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ select create_payment('55555555-5555-5555-5555-555555555555'::uuid,
                           'MTN_MOMO_COG'::payment_provider, '242068888888') $$,
  'not_eligible',
  'un tiers ne peut pas initier de paiement sur la demande de quelqu''un d''autre'
);

select is(
  (select count(*)::int from public.payments),
  0,
  'un tiers ne voit aucun paiement qui ne le concerne pas'
);

reset role;

select * from finish();
rollback;
