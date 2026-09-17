-- Propriétés de sécurité de la vérification d'identité.
--
-- Exécution :  supabase test db     (nécessite `supabase start`)
--
-- Ce qui est verrouillé ici : personne ne se déclare vérifié soi-même, une
-- annonce non vérifiée disparaît à l'issue du délai de grâce, la vidéo d'un
-- compte n'est lisible que par l'équipe, et chaque décision est tracée.

begin;
select plan(56);

-- Jeu d'essai ---------------------------------------------------------------
-- p1 : partenaire à vérifier · p2 : tiers, puis compte mineur · adm : administrateur
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-p1@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now()),
  ('0a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-p2@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now()),
  ('0a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-admin@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now());

insert into public.admins (user_id) values ('0a000000-0000-0000-0000-000000000003');

-- Insérées en superutilisateur : le trigger ne s'applique pas, ce qui permet
-- de poser directement l'état « publiée en délai de grâce ».
insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified, verification_grace_until
) values
  ('0b000000-0000-0000-0000-000000000001', 'verif-publiee', 'Annonce en grâce',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-a', 'option_1', 'sur_place', 'brazzaville', 40000, 'hour',
   'https://exemple/v1.jpg', 'published', '0a000000-0000-0000-0000-000000000001',
   false, now() + interval '7 days'),
  ('0b000000-0000-0000-0000-000000000002', 'verif-brouillon', 'Annonce brouillon',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-b', 'option_2', 'sur_place', 'brazzaville', 30000, 'hour',
   'https://exemple/v2.jpg', 'draft', '0a000000-0000-0000-0000-000000000001',
   false, null),
  ('0b000000-0000-0000-0000-000000000004', 'verif-mineur', 'Annonce du compte mineur',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-c', 'option_3', 'sur_place', 'pointe-noire', 30000, 'hour',
   'https://exemple/v4.jpg', 'published', '0a000000-0000-0000-0000-000000000002',
   false, now() + interval '7 days');

/* -------------------------------------------------------------------------- */
/*                              Délai de grâce                                */
/* -------------------------------------------------------------------------- */

set local role anon;

select is(
  (select count(*)::int from public.listings where slug = 'verif-publiee'),
  1,
  'une annonce non vérifiée reste visible pendant le délai de grâce'
);

reset role;
update public.listings set verification_grace_until = now() - interval '1 minute'
 where slug = 'verif-publiee';
set local role anon;

select is(
  (select count(*)::int from public.listings where slug = 'verif-publiee'),
  0,
  'une fois le délai écoulé, l''annonce disparaît du catalogue sans tâche planifiée'
);

select throws_ok(
  $$ select submit_request('0b000000-0000-0000-0000-000000000001'::uuid,
       'Client Test', '+242 06 404 40 40', null, '', null::date, null::smallint) $$,
  'listing_unavailable',
  'une annonce masquée ne peut plus recevoir de demande'
);

reset role;
update public.listings set verification_grace_until = now() + interval '7 days'
 where slug = 'verif-publiee';

/* -------------------------------------------------------------------------- */
/*                          Publication conditionnelle                        */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.listings set title = 'Annonce en grâce modifiée'
      where slug = 'verif-publiee' $$,
  'un partenaire en délai de grâce peut modifier son annonce publiée'
);

select throws_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-brouillon' $$,
  'verification_required',
  'un compte non vérifié ne peut pas publier un brouillon'
);

select throws_ok(
  $$ insert into public.listings (slug, title, description, category, option_type, mobility,
       city, price_xaf, price_unit, cover_url, status, owner_id)
     values ('verif-nouvelle', 'Nouvelle annonce',
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 20000, 'hour',
       'https://exemple/v3.jpg', 'published', '0a000000-0000-0000-0000-000000000001') $$,
  'verification_required',
  'un compte non vérifié ne peut pas créer une annonce publiée'
);

select lives_ok(
  $$ update public.listings set status = 'draft' where slug = 'verif-publiee' $$,
  'un partenaire non vérifié peut dépublier son annonce'
);

select throws_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-publiee' $$,
  'verification_required',
  'une annonce repassée en brouillon ne peut plus être republiée sans vérification'
);

select throws_ok(
  $$ update public.listings set verification_grace_until = now() + interval '1 year'
      where slug = 'verif-brouillon' $$,
  '42501',
  null,
  'un partenaire ne peut pas prolonger son délai de grâce'
);

select throws_ok(
  $$ insert into public.verification_requests (user_id, challenge_code, status)
     values ('0a000000-0000-0000-0000-000000000001', 'AAAAAA', 'approved') $$,
  '42501',
  null,
  'un partenaire ne peut pas se déclarer vérifié en écrivant dans la table'
);

/* -------------------------------------------------------------------------- */
/*                           Démarrage et soumission                          */
/* -------------------------------------------------------------------------- */

select lives_ok(
  $$ select * from start_verification() $$,
  'un partenaire peut démarrer une vérification'
);

select ok(
  (select challenge_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
     from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001' and status = 'awaiting_video'),
  'le code de défi compte 6 caractères sans ambiguïté'
);

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'video_missing',
  'la soumission exige une vidéo réellement déposée'
);

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000002/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'invalid_path',
  'la vidéo doit se trouver dans le dossier du compte et porter l''identifiant de la demande'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('verifications', '0a000000-0000-0000-0000-000000000002/intrus.mp4') $$,
  '42501',
  null,
  'un compte ne peut pas déposer dans le dossier d''un autre'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('verifications', '0a000000-0000-0000-0000-000000000001/sub/x.mp4') $$,
  '42501',
  null,
  'un compte ne peut pas déposer dans un sous-dossier, même sous son propre dossier'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'verifications', '0a000000-0000-0000-0000-000000000001/' || id::text || '.mp4'
       from public.verification_requests
      where user_id = '0a000000-0000-0000-0000-000000000001' $$,
  'un compte peut déposer sa vidéo dans son propre dossier'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'verifications'),
  0,
  'un compte ne relit pas sa propre vidéo : seule l''équipe y a accès'
);

reset role;
update public.verification_requests set code_expires_at = now() - interval '1 minute'
 where user_id = '0a000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'code_expired',
  'un code expiré est refusé, ce qui empêche de recycler une ancienne vidéo'
);

reset role;
update public.verification_requests set code_expires_at = now() + interval '30 minutes'
 where user_id = '0a000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'avec un code valide et une vidéo déposée, la demande est soumise'
);

select is(
  (select status::text from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001'),
  'pending',
  'la demande soumise passe en examen'
);

select throws_ok(
  $$ select * from start_verification() $$,
  'already_pending',
  'une seconde vérification ne peut pas être lancée pendant l''examen'
);

/* -------------------------------------------------------------------------- */
/*                                  Tiers                                     */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.verification_requests),
  0,
  'un tiers ne voit aucune demande de vérification qui ne le concerne pas'
);

select throws_ok(
  $$ select review_verification('00000000-0000-0000-0000-000000000000'::uuid, 'approve') $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas statuer sur une vérification'
);

/* -------------------------------------------------------------------------- */
/*                               Administration                               */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'verifications'),
  1,
  'un administrateur peut lire la vidéo à examiner'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'reject') $$,
  'reason_required',
  'un rejet sans motif est refusé'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'reject', 'personne_mineure') $$,
  'invalid_reason',
  'la minorité ne peut pas être traitée comme un rejet simple'
);

select is(
  (select review_verification(
     (select id from public.verification_requests
       where user_id = '0a000000-0000-0000-0000-000000000001'), 'approve')),
  (select '0a000000-0000-0000-0000-000000000001/' || id::text || '.mp4'
     from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001'),
  'l''approbation renvoie le chemin de la vidéo à supprimer'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'approve') $$,
  'already_reviewed',
  'une demande déjà jugée ne peut pas l''être une seconde fois'
);

reset role;

select ok(
  (select bool_and(is_verified) from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  'l''approbation certifie toutes les annonces du compte'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-publiee' $$,
  'un compte vérifié peut publier'
);

select lives_ok(
  $$ insert into public.listings (slug, title, description, category, option_type, mobility,
       city, price_xaf, price_unit, cover_url, status, owner_id)
     values ('verif-apres', 'Annonce après vérification',
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 20000, 'hour',
       'https://exemple/v5.jpg', 'published', '0a000000-0000-0000-0000-000000000001') $$,
  'un compte vérifié peut créer une annonce publiée'
);

reset role;

select is(
  (select is_verified from public.listings where slug = 'verif-apres'),
  true,
  'une nouvelle annonce d''un compte vérifié hérite du badge'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'already_verified',
  'un compte déjà vérifié ne relance pas de vérification'
);

/* -------------------------------------------------------------------------- */
/*                                Révocation                                  */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'revoke') $$,
  'reason_required',
  'une révocation sans note est refusée'
);

select lives_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'revoke', null, 'Pièce falsifiée constatée') $$,
  'un administrateur peut révoquer une vérification'
);

reset role;

select ok(
  (select not bool_or(is_verified) from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  'la révocation retire le badge de toutes les annonces du compte'
);

-- `request.jwt.claims` est une variable de session indépendante du rôle SQL :
-- sans ce reset, `auth.uid()` continuerait de renvoyer l'administrateur des
-- blocs précédents et `is_admin()` resterait vrai sous le rôle `anon`.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  0,
  'après révocation, les annonces du compte disparaissent du catalogue'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                            Constat de minorité                             */
/* -------------------------------------------------------------------------- */

insert into public.verification_requests (user_id, status, challenge_code, document_type, video_path, submitted_at)
values ('0a000000-0000-0000-0000-000000000002', 'pending', 'MINEUR', 'cni',
        '0a000000-0000-0000-0000-000000000002/fixture.mp4', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000002'), 'block_minor') $$,
  'un administrateur peut signaler une personne mineure'
);

reset role;

select is(
  (select status::text from public.listings where slug = 'verif-mineur'),
  'archived',
  'constat de minorité : les annonces du compte sont archivées'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'blocked',
  'un compte signalé mineur ne peut plus demander de vérification'
);

select is(
  (select count(*)::int from public.moderation_log where verification_id is not null),
  0,
  'le journal des décisions est invisible hors administration'
);

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log where verification_id is not null),
  3,
  'approbation, révocation et constat de minorité sont journalisés'
);

select lives_ok(
  $$ select set_listing_certification('0b000000-0000-0000-0000-000000000004'::uuid, true, null) $$,
  'la fonction de certification reste appelable pour le VIP'
);

reset role;

select is(
  (select is_verified from public.listings where slug = 'verif-mineur'),
  false,
  'la bascule manuelle ne peut plus certifier une annonce'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.review_verification(uuid,text,identity_rejection_reason,text)',
    'EXECUTE'),
  'le rôle anon ne peut pas appeler review_verification'
);

/* -------------------------------------------------------------------------- */
/*                    Minorité constatée après approbation                    */
/* -------------------------------------------------------------------------- */
-- p4 : compte déjà approuvé, dont la minorité n'est découverte qu'après coup.
-- Jeu d'essai dédié pour ne pas déplacer les comptages déjà vérifiés plus haut
-- (notamment celui de `moderation_log`).

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
) values (
  '0a000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'verif-p4@test.cg', 'x',
  '', '', '', '', '', '', '', '', now(), now(), now()
);

insert into public.verification_requests (
  user_id, status, challenge_code, document_type, video_path, submitted_at,
  reviewed_by, reviewed_at
) values (
  '0a000000-0000-0000-0000-000000000004', 'approved', 'APPRVD', 'cni',
  '0a000000-0000-0000-0000-000000000004/fixture.mp4', now(),
  '0a000000-0000-0000-0000-000000000003', now()
);

insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified
) values (
  '0b000000-0000-0000-0000-000000000005', 'verif-approuve', 'Annonce du compte approuvé',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-a', 'option_1', 'sur_place', 'brazzaville', 20000, 'hour',
  'https://exemple/v6.jpg', 'published', '0a000000-0000-0000-0000-000000000004', true
);

-- Demande posée par p1, qui va tenter de la payer une fois l'annonce archivée.
insert into public.requests (listing_id, full_name, phone, status, author_id)
values (
  '0b000000-0000-0000-0000-000000000005', 'Client Payeur', '+242 06 505 05 05',
  'confirmed', '0a000000-0000-0000-0000-000000000001'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000004'),
       'revoke', 'personne_mineure', 'Motif test') $$,
  'invalid_reason',
  'la minorité ne peut pas être traitée comme une révocation ordinaire'
);

select lives_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000004'), 'block_minor') $$,
  'la minorité peut être constatée après coup, sur un compte déjà approuvé'
);

reset role;

select is(
  (select status::text from public.listings where slug = 'verif-approuve'),
  'archived',
  'constat de minorité après approbation : les annonces du compte sont archivées'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'blocked',
  'un compte approuvé puis signalé mineur ne peut plus demander de vérification'
);

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select create_payment(
       (select id from public.requests where listing_id = '0b000000-0000-0000-0000-000000000005'),
       'MTN_MOMO_COG'::payment_provider, '242065050505') $$,
  'listing_unavailable',
  'un paiement sur une annonce archivée après constat de minorité est refusé'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                 Auto-examen interdit et levée du blocage                   */
/* -------------------------------------------------------------------------- */

-- Demande de l'administrateur lui-même, posée en superutilisateur.
insert into public.verification_requests (user_id, status, challenge_code, document_type, video_path, submitted_at)
values ('0a000000-0000-0000-0000-000000000003', 'pending', 'ADMINX', 'cni',
        '0a000000-0000-0000-0000-000000000003/fixture.mp4', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000003'), 'approve') $$,
  '42501',
  'forbidden',
  'un administrateur ne peut pas statuer sur sa propre vérification'
);

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select ok(
  is_verification_blocked(),
  'un compte signalé mineur se voit bloqué'
);

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select ok(
  not is_verification_blocked(),
  'un compte non signalé ne se voit pas bloqué'
);

-- Levée du blocage telle que documentée dans le README.
reset role;
delete from public.verification_blocks where user_id = '0a000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select ok(
  not is_verification_blocked(),
  'une fois la ligne de blocage supprimée, le compte ne se voit plus bloqué'
);

select lives_ok(
  $$ select * from start_verification() $$,
  'une fois le blocage levé, le partenaire peut recommencer la vérification'
);

reset role;

select * from finish();
rollback;
