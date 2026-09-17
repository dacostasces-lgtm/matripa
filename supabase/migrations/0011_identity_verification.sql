-- Vérification d'identité par selfie vidéo.
--
-- Jusqu'ici, `is_verified` était une bascule manuelle de l'équipe : le badge
-- attestait un contrôle que rien ne documentait, et rien n'empêchait une
-- personne mineure de publier. Cette migration rend la publication
-- conditionnelle à une vérification humaine de l'âge et de l'identité.
--
-- Principes :
--   1. Le compte est vérifié, pas l'annonce ; `listings.is_verified` devient une
--      copie dérivée, maintenue par `review_verification` et par un trigger.
--   2. Toute écriture passe par des fonctions SECURITY DEFINER, sur le modèle
--      de `submit_request` et `set_listing_certification`.
--   3. Le délai de grâce s'applique à la *lecture* (policy RLS) : aucune tâche
--      planifiée ne peut tomber en panne et laisser des profils non vérifiés
--      en ligne.
--   4. Minimisation : ni numéro de pièce ni date de naissance ; la vidéo est
--      supprimée dès la décision (par l'application, via l'API Storage).

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

create type public.identity_verification_status as enum (
  'awaiting_video',  -- code émis, vidéo pas encore soumise
  'pending',         -- vidéo soumise, en attente d'examen
  'approved',
  'rejected',
  'revoked'          -- approbation retirée a posteriori
);

create type public.identity_document_type as enum ('cni', 'passeport', 'carte_consulaire');

create type public.identity_rejection_reason as enum (
  'video_illisible',
  'piece_non_visible',
  'code_absent_ou_faux',
  'personne_differente',
  'personne_mineure'
);

/* -------------------------------------------------------------------------- */
/*                                  Tables                                    */
/* -------------------------------------------------------------------------- */

create table public.verification_requests (
  -- Sert aussi de nom de fichier : `<user_id>/<id>.<ext>`.
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           public.identity_verification_status not null default 'awaiting_video',
  challenge_code   text not null,
  code_expires_at  timestamptz not null default now() + interval '30 minutes',
  document_type    public.identity_document_type,
  -- Remis à null une fois le fichier supprimé du bucket.
  video_path       text,
  submitted_at     timestamptz,
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason public.identity_rejection_reason,
  rejection_note   text check (rejection_note is null or char_length(rejection_note) <= 300),
  created_at       timestamptz not null default now(),

  constraint verification_rejected_has_reason
    check (status <> 'rejected' or rejection_reason is not null)
);

-- Une seule demande en cours et une seule approbation active par compte.
create unique index verification_requests_one_open
  on public.verification_requests (user_id)
  where status in ('awaiting_video', 'pending');

create unique index verification_requests_one_approved
  on public.verification_requests (user_id)
  where status = 'approved';

create index verification_requests_queue_idx
  on public.verification_requests (submitted_at)
  where status = 'pending';

alter table public.verification_requests enable row level security;

create policy "verification_requests_self_read"
  on public.verification_requests for select
  using (user_id = auth.uid());

create policy "verification_requests_admin_read"
  on public.verification_requests for select
  using (public.is_admin());

revoke all on public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;
grant select, insert, update, delete on public.verification_requests to service_role;

-- Comptes interdits de vérification après constat de minorité. Levée du
-- blocage : suppression manuelle de la ligne par un administrateur, en SQL.
create table public.verification_blocks (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  verification_id uuid references public.verification_requests (id) on delete set null,
  blocked_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.verification_blocks enable row level security;

revoke all on public.verification_blocks from anon, authenticated;
grant select, insert, update, delete on public.verification_blocks to service_role;

/* -------------------------------------------------------------------------- */
/*                          Journal de modération                             */
/* -------------------------------------------------------------------------- */

-- Pas de clé étrangère vers `verification_requests` : la suppression d'un
-- compte ferait passer la colonne à null et violerait la contrainte de cible
-- unique. Même choix que pour `review_id`.
alter table public.moderation_log
  alter column review_id drop not null,
  alter column listing_id drop not null,
  add column verification_id uuid,
  add column action text not null default 'remove_review'
    check (action in ('remove_review', 'approve', 'reject', 'block_minor', 'revoke')),
  add constraint moderation_log_single_target
    check (num_nonnulls(review_id, verification_id) = 1);

/* -------------------------------------------------------------------------- */
/*                                 Annonces                                   */
/* -------------------------------------------------------------------------- */

create or replace function public.is_account_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1 from public.verification_requests
     where user_id = p_user_id and status = 'approved'
  );
$$;

revoke execute on function public.is_account_verified(uuid) from public, anon;
grant execute on function public.is_account_verified(uuid) to authenticated;

alter table public.listings add column verification_grace_until timestamptz;

-- Aucun badge existant ne repose sur une vérification réelle.
update public.listings set is_verified = false;

-- Les annonces déjà en ligne restent visibles 7 jours, y compris celles sans
-- propriétaire, qui ne pourront jamais être vérifiées.
update public.listings
   set verification_grace_until = now() + interval '7 days'
 where status = 'published';

drop policy "listings_public_read" on public.listings;

create policy "listings_public_read"
  on public.listings for select
  using (
    status = 'published'
    and (is_verified or verification_grace_until > now())
  );

-- SECURITY INVOKER : `current_user` est le rôle réel de l'appelant. Le trigger
-- ne contraint que les rôles clients ; `service_role`, les migrations, le seed
-- et les fonctions SECURITY DEFINER (qui s'exécutent sous le rôle
-- propriétaire) passent.
create or replace function public.listings_enforce_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Verrou consultatif partagé, à la clé du compte : `review_verification`
  -- prend un verrou exclusif sur la même clé avant de modifier les annonces.
  -- Attendre ici force ce trigger à repartir d'un instantané postérieur à la
  -- décision en cours (chaque instruction PL/pgSQL prend un nouveau snapshot
  -- après une attente), ce qui évite qu'une annonce insérée ou modifiée
  -- pendant une révocation concurrente ne garde un badge déjà retiré.
  if new.owner_id is not null then
    perform pg_advisory_xact_lock_shared(hashtextextended(new.owner_id::text, 0));
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := public.is_account_verified(new.owner_id);
    new.verification_grace_until := null;
  else
    new.is_verified := old.is_verified;
    new.verification_grace_until := old.verification_grace_until;
  end if;

  if new.status = 'published' and not new.is_verified then
    -- Seule exception : une annonce déjà en ligne, encore dans son délai.
    if not (
      tg_op = 'UPDATE'
      and old.status = 'published'
      and old.verification_grace_until > now()
    ) then
      raise exception 'verification_required' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_enforce_verification
  before insert or update on public.listings
  for each row execute function public.listings_enforce_verification();

-- `is_verified` n'est plus modifiable à la main : `p_is_verified` est conservé
-- dans la signature pour ne pas casser les appelants, mais ignoré.
create or replace function public.set_listing_certification(
  p_listing_id  uuid,
  p_is_verified boolean,
  p_is_vip      boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.listings
     set is_vip = coalesce(p_is_vip, is_vip)
   where id = p_listing_id;

  if not found then
    raise exception 'listing_not_found' using errcode = '22023';
  end if;
end;
$$;

-- Une annonce masquée (délai écoulé, compte bloqué ou révoqué) ne doit plus
-- recevoir de demande ni de paiement : `submit_request` et `create_payment`
-- contournent RLS et doivent donc reprendre la même règle.
create or replace function public.submit_request(
  p_listing_id  uuid,
  p_full_name   text,
  p_phone       text,
  p_email       text,
  p_message     text,
  p_desired_date date,
  p_guests      smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- L'annonce doit exister, être publiée et visible publiquement.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id
      and status = 'published'
      and (is_verified or verification_grace_until > now())
  ) then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  -- Anti-spam : 5 demandes maximum par heure pour un même numéro.
  if (
    select count(*) from public.requests
    where phone = p_phone and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.requests (
    listing_id, full_name, phone, email, message, desired_date, guests, author_id
  ) values (
    p_listing_id, trim(p_full_name), p_phone, nullif(trim(p_email), ''),
    coalesce(p_message, ''), p_desired_date, p_guests, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Même règle que `submit_request`, côté paiement : un compte bloqué après
-- constat de minorité (annonces archivées) ou dont le délai de grâce est
-- écoulé ne doit plus pouvoir être payé. Redéfinition intégrale de la
-- fonction de la migration 0009 : seul l'ajout du contrôle de disponibilité,
-- juste après la vérification d'éligibilité, change. Le GRANT existant sur
-- la fonction n'est pas affecté par ce `create or replace`.
create or replace function public.create_payment(
  p_request_id uuid,
  p_provider   payment_provider,
  p_phone      text
) returns table (payment_id uuid, amount_xaf integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing     uuid;
  v_amount      integer;
  v_id          uuid;
  v_status      listing_status;
  v_is_verified boolean;
  v_grace_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- La demande doit appartenir à l'appelant. Le montant est lu sur l'annonce,
  -- pas reçu en paramètre : un client ne peut pas se facturer 1 FCFA.
  select r.listing_id, l.price_xaf, l.status, l.is_verified, l.verification_grace_until
    into v_listing, v_amount, v_status, v_is_verified, v_grace_until
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id
     and r.author_id = auth.uid()
     and r.status <> 'cancelled';

  if v_listing is null then
    raise exception 'not_eligible' using errcode = '42501';
  end if;

  if v_status <> 'published' or not (v_is_verified or v_grace_until > now()) then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.payments
     where request_id = p_request_id
       and status in ('pending', 'processing', 'completed')
  ) then
    raise exception 'payment_already_exists' using errcode = '22023';
  end if;

  insert into public.payments (request_id, listing_id, payer_id, amount_xaf, provider, phone)
  values (p_request_id, v_listing, auth.uid(), v_amount, p_provider, regexp_replace(p_phone, '\D', '', 'g'))
  returning id into v_id;

  return query select v_id, v_amount;
end;
$$;

/* -------------------------------------------------------------------------- */
/*                         Parcours de vérification                           */
/* -------------------------------------------------------------------------- */

create or replace function public.start_verification()
returns table (id uuid, challenge_code text, code_expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- `gen_random_uuid` est natif (pas d'extension) et tiré d'une source sûre.
  v_bytes    bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code     text := '';
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.verification_blocks b where b.user_id = v_uid) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  if public.is_account_verified(v_uid) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.verification_requests r
     where r.user_id = v_uid and r.status = 'pending'
  ) then
    raise exception 'already_pending' using errcode = 'P0001';
  end if;

  -- Une demande sans vidéo est remplacée ; son éventuel fichier devient
  -- orphelin et sera purgé depuis /admin.
  delete from public.verification_requests r
   where r.user_id = v_uid and r.status = 'awaiting_video';

  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;

  return query
    with inserted as (
      insert into public.verification_requests (user_id, challenge_code)
      values (v_uid, v_code)
      returning verification_requests.id,
                verification_requests.challenge_code,
                verification_requests.code_expires_at
    )
    select inserted.id, inserted.challenge_code, inserted.code_expires_at from inserted;
end;
$$;

create or replace function public.submit_verification(
  p_id         uuid,
  p_document   public.identity_document_type,
  p_video_path text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_request public.verification_requests%rowtype;
begin
  select * into v_request
    from public.verification_requests r
   where r.id = p_id and r.user_id = v_uid and r.status = 'awaiting_video'
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_request.code_expires_at < now() then
    raise exception 'code_expired' using errcode = 'P0001';
  end if;

  if p_video_path is null
     or p_video_path !~ ('^' || v_uid::text || '/' || p_id::text || '\.(mp4|mov|webm|3gp)$') then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'verifications' and o.name = p_video_path
  ) then
    raise exception 'video_missing' using errcode = 'P0001';
  end if;

  update public.verification_requests
     set status        = 'pending',
         document_type = p_document,
         video_path    = p_video_path,
         submitted_at  = now()
   where id = p_id;
end;
$$;

-- Renvoie le chemin de la vidéo à supprimer : la suppression du fichier passe
-- par l'API Storage (supprimer la ligne SQL laisserait le fichier en place).
create or replace function public.review_verification(
  p_id       uuid,
  p_decision text,
  p_reason   public.identity_rejection_reason default null,
  p_note     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.verification_requests%rowtype;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject', 'block_minor', 'revoke') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into v_request
    from public.verification_requests r
   where r.id = p_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- `block_minor` reste possible sur une demande déjà approuvée : la
  -- minorité peut être constatée après coup, pas seulement lors de l'examen
  -- initial.
  if (p_decision = 'revoke' and v_request.status <> 'approved')
     or (p_decision = 'block_minor' and v_request.status not in ('pending', 'approved'))
     or (p_decision not in ('revoke', 'block_minor') and v_request.status <> 'pending') then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  if (p_decision = 'reject' and p_reason is null)
     or (p_decision = 'revoke' and v_note is null) then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- La minorité est un constat (`block_minor`), pas un motif de rejet ou de
  -- révocation ordinaire : elle bloque le compte et archive ses annonces, ce
  -- que `reject`/`revoke` ne font pas.
  if p_decision in ('reject', 'revoke') and p_reason = 'personne_mineure' then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  -- Verrou consultatif exclusif, à la clé du compte : sérialise cette
  -- décision avec toute insertion ou mise à jour d'annonce concurrente
  -- (verrou partagé pris dans le trigger `listings_enforce_verification`),
  -- pour qu'aucune annonce ne garde ou ne perde son badge à contretemps.
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text, 0));

  if p_decision = 'approve' then
    update public.verification_requests
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    update public.listings
       set is_verified = true, verification_grace_until = null
     where owner_id = v_request.user_id;

  elsif p_decision = 'reject' then
    update public.verification_requests
       set status = 'rejected', rejection_reason = p_reason, rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

  elsif p_decision = 'block_minor' then
    update public.verification_requests
       set status = 'rejected', rejection_reason = 'personne_mineure', rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    insert into public.verification_blocks (user_id, verification_id, blocked_by)
    values (v_request.user_id, p_id, auth.uid())
    on conflict (user_id) do nothing;

    update public.listings
       set status = 'archived', is_verified = false, verification_grace_until = null
     where owner_id = v_request.user_id;

  else -- revoke
    update public.verification_requests
       set status = 'revoked', rejection_reason = p_reason, rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    update public.listings
       set is_verified = false
     where owner_id = v_request.user_id;
  end if;

  insert into public.moderation_log (verification_id, moderator_id, action, reason)
  values (p_id, auth.uid(), p_decision, coalesce(v_note, p_reason::text));

  return v_request.video_path;
end;
$$;

create or replace function public.clear_verification_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.verification_requests set video_path = null where id = p_id;
end;
$$;

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut : on le retire explicitement.
revoke execute on function public.start_verification() from public, anon;
revoke execute on function public.submit_verification(uuid, public.identity_document_type, text) from public, anon;
revoke execute on function public.review_verification(uuid, text, public.identity_rejection_reason, text) from public, anon;
revoke execute on function public.clear_verification_video(uuid) from public, anon;

grant execute on function public.start_verification() to authenticated;
grant execute on function public.submit_verification(uuid, public.identity_document_type, text) to authenticated;
grant execute on function public.review_verification(uuid, text, public.identity_rejection_reason, text) to authenticated;
grant execute on function public.clear_verification_video(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/*                                  Storage                                   */
/* -------------------------------------------------------------------------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verifications', 'verifications', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dépôt dans son propre dossier uniquement. Pas de policy update ni delete :
-- le dépôt est définitif pour le client, la suppression relève de service_role.
create policy "verifications_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture réservée à l'équipe, y compris pour le déposant.
create policy "verifications_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verifications' and public.is_admin());
