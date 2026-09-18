-- Signalement d'annonces.
--
-- Un compte connecté peut signaler une annonce visible. Les motifs graves
-- (personne mineure présumée, contrainte ou exploitation) masquent le profil
-- immédiatement, par précaution ; l'équipe tranche ensuite : signalement
-- infondé, retrait du profil, ou constat de minorité avec blocage du compte.
--
-- Principes, dans la continuité de la migration 0011 :
--   1. Aucune écriture directe : tout passe par des fonctions SECURITY DEFINER.
--   2. La suspension est une colonne dédiée, intégrée à la policy de lecture
--      publique : le statut choisi par le partenaire reste intact, et il ne
--      peut pas lever la suspension en republiant.
--   3. Le signaleur n'a aucun suivi : les GRANT de colonne l'empêchent de lire
--      `status` et la note de décision.

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

create type public.report_reason as enum (
  'personne_mineure',
  'contrainte_exploitation',
  'faux_profil',
  'arnaque',
  'autre'
);

create type public.report_status as enum ('open', 'confirmed', 'dismissed');

/* -------------------------------------------------------------------------- */
/*                                   Table                                    */
/* -------------------------------------------------------------------------- */

create table public.listing_reports (
  id              uuid primary key default gen_random_uuid(),
  -- `set null` partout : un signalement grave doit survivre à la suppression
  -- de l'annonce, du compte propriétaire ou du compte signaleur.
  listing_id      uuid references public.listings (id) on delete set null,
  owner_id        uuid references auth.users (id) on delete set null,
  reporter_id     uuid references auth.users (id) on delete set null,
  reason          public.report_reason not null,
  -- Colonne ordinaire contrôlée plutôt que générée : une colonne générée
  -- exige une expression immuable, et la comparaison à un littéral d'enum
  -- passe par une conversion qui ne l'est pas toujours.
  is_urgent       boolean not null,
  details         text check (details is null or char_length(details) <= 1000),
  -- Instantané de l'annonce au moment du signalement : le partenaire peut
  -- modifier l'annonce (ou la republier différemment) pendant qu'un
  -- signalement reste ouvert ; l'équipe doit juger ce qui a été signalé, pas
  -- l'état courant.
  listing_title_snapshot       text,
  listing_description_snapshot text
    check (listing_description_snapshot is null or char_length(listing_description_snapshot) <= 1000),
  listing_cover_url_snapshot   text,
  status          public.report_status not null default 'open',
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 300),
  created_at      timestamptz not null default now(),

  constraint listing_reports_urgency
    check (is_urgent = (reason in ('personne_mineure', 'contrainte_exploitation'))),
  constraint listing_reports_other_has_details
    check (reason <> 'autre' or char_length(trim(coalesce(details, ''))) >= 10)
);

create unique index listing_reports_one_open
  on public.listing_reports (reporter_id, listing_id)
  where status = 'open';

create index listing_reports_queue_idx
  on public.listing_reports (is_urgent desc, created_at)
  where status = 'open';

create index listing_reports_rate_idx
  on public.listing_reports (reporter_id, created_at);

alter table public.listing_reports enable row level security;

-- Seule policy de lecture : le signaleur relit ses propres signalements (export
-- de ses données). L'administration passe par `admin_list_open_reports`.
create policy "listing_reports_self_read"
  on public.listing_reports for select
  using (reporter_id = auth.uid());

revoke all on public.listing_reports from anon, authenticated;
-- GRANT de colonne : ni `status`, ni la note, ni le propriétaire.
grant select (id, listing_id, reason, details, created_at) on public.listing_reports to authenticated;
grant select, insert, update, delete on public.listing_reports to service_role;

/* -------------------------------------------------------------------------- */
/*                                Suspension                                  */
/* -------------------------------------------------------------------------- */

-- Hors des GRANT client (migrations 0001 et 0006) : seul le propriétaire de
-- la table, via les fonctions ci-dessous, peut la renseigner ou l'effacer.
alter table public.listings add column suspended_at timestamptz;

drop policy "listings_public_read" on public.listings;

create policy "listings_public_read"
  on public.listings for select
  using (
    status = 'published'
    and (is_verified or verification_grace_until > now())
    and suspended_at is null
  );

-- Sans cette condition, un partenaire pourrait échapper à un signalement en
-- supprimant le profil suspendu puis en le republiant à l'identique. Définition
-- identique à celle de la migration 0001, seule la condition de suspension
-- s'ajoute.
drop policy "listings_owner_delete" on public.listings;

create policy "listings_owner_delete"
  on public.listings for delete
  using (auth.uid() = owner_id and suspended_at is null);

-- Même règle que la lecture publique : ces fonctions contournent RLS.
-- Redéfinitions intégrales de la migration 0011 ; seule la condition
-- `suspended_at is null` s'ajoute.
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
  -- L'annonce doit exister, être publiée, visible publiquement et non suspendue.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id
      and status = 'published'
      and (is_verified or verification_grace_until > now())
      and suspended_at is null
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
  v_listing      uuid;
  v_amount       integer;
  v_id           uuid;
  v_status       listing_status;
  v_is_verified  boolean;
  v_grace_until  timestamptz;
  v_suspended_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- La demande doit appartenir à l'appelant. Le montant est lu sur l'annonce,
  -- pas reçu en paramètre : un client ne peut pas se facturer 1 FCFA.
  select r.listing_id, l.price_xaf, l.status, l.is_verified, l.verification_grace_until, l.suspended_at
    into v_listing, v_amount, v_status, v_is_verified, v_grace_until, v_suspended_at
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id
     and r.author_id = auth.uid()
     and r.status <> 'cancelled';

  if v_listing is null then
    raise exception 'not_eligible' using errcode = '42501';
  end if;

  if v_status <> 'published'
     or not (v_is_verified or v_grace_until > now())
     or v_suspended_at is not null then
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
/*                          Journal de modération                             */
/* -------------------------------------------------------------------------- */

alter table public.moderation_log add column report_id uuid;

alter table public.moderation_log drop constraint moderation_log_single_target;
alter table public.moderation_log add constraint moderation_log_single_target
  check (num_nonnulls(review_id, verification_id, report_id) = 1);

alter table public.moderation_log drop constraint moderation_log_action_check;
alter table public.moderation_log add constraint moderation_log_action_check
  check (action in (
    'remove_review', 'approve', 'reject', 'block_minor', 'revoke',
    'report_dismiss', 'report_remove', 'report_block_minor'
  ));

/* -------------------------------------------------------------------------- */
/*                                 Fonctions                                  */
/* -------------------------------------------------------------------------- */

create or replace function public.submit_report(
  p_listing_id uuid,
  p_reason     public.report_reason,
  p_details    text
) returns table (id uuid, is_urgent boolean, listing_title text, listing_city text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid         uuid := auth.uid();
  v_owner       uuid;
  v_title       text;
  v_city        text;
  v_description text;
  v_cover_url   text;
  v_details     text := nullif(trim(coalesce(p_details, '')), '');
  v_urgent      boolean;
  v_id          uuid;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Verrou consultatif exclusif, à la clé du compte signaleur (préfixé pour
  -- rester distinct de la clé par propriétaire prise dans `review_report`) :
  -- sérialise les appels concurrents d'un même compte, pour que la
  -- vérification « déjà signalé » et la limite horaire, toutes deux lues puis
  -- écrites plus bas, restent valables même face à des appels parallèles.
  perform pg_advisory_xact_lock(hashtextextended('listing_report:' || v_uid::text, 0));

  if p_reason is null then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  v_urgent := p_reason in ('personne_mineure', 'contrainte_exploitation');

  -- Même prédicat que `listings_public_read` : on ne signale que ce que le
  -- public voit.
  select l.owner_id, l.title, l.city, l.description, l.cover_url
    into v_owner, v_title, v_city, v_description, v_cover_url
    from public.listings l
   where l.id = p_listing_id
     and l.status = 'published'
     and (l.is_verified or l.verification_grace_until > now())
     and l.suspended_at is null;

  if not found then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  if v_owner = v_uid then
    raise exception 'own_listing' using errcode = '22023';
  end if;

  -- Couvre aussi un signalement déjà classé sans suite : sinon le même compte
  -- pourrait re-signaler indéfiniment un profil blanchi par l'équipe et le
  -- faire suspendre à nouveau (s'il choisit un motif urgent).
  if exists (
    select 1 from public.listing_reports r
     where r.reporter_id = v_uid and r.listing_id = p_listing_id
       and r.status in ('open', 'dismissed')
  ) then
    raise exception 'already_reported' using errcode = '22023';
  end if;

  if (
    select count(*) from public.listing_reports r
     where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'details_too_long' using errcode = '22023';
  end if;

  if p_reason = 'autre' and char_length(coalesce(v_details, '')) < 10 then
    raise exception 'details_required' using errcode = '22023';
  end if;

  insert into public.listing_reports as r (
    listing_id, owner_id, reporter_id, reason, is_urgent, details,
    listing_title_snapshot, listing_description_snapshot, listing_cover_url_snapshot
  )
  values (
    p_listing_id, v_owner, v_uid, p_reason, v_urgent, v_details,
    v_title, left(v_description, 1000), v_cover_url
  )
  returning r.id into v_id;

  if v_urgent then
    update public.listings l
       set suspended_at = now()
     where l.id = p_listing_id and l.suspended_at is null;
  end if;

  return query select v_id, v_urgent, v_title, v_city;
end;
$$;

create or replace function public.review_report(
  p_report_id uuid,
  p_decision  text,
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report   public.listing_reports%rowtype;
  v_owner_id uuid;
  v_note     text := left(nullif(trim(coalesce(p_note, '')), ''), 300);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('dismiss', 'remove', 'block_minor') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  -- Lecture sans verrou de ligne : détermine la clé du verrou consultatif
  -- avant de verrouiller la ligne. Les deux fonctions de décision par compte
  -- (`review_report` ici et `review_verification`, redéfinie plus bas dans
  -- cette migration) prennent désormais le verrou consultatif par compte
  -- AVANT tout verrou de ligne, ce qui évite l'interblocage entre un
  -- administrateur qui tranche une vérification et un autre qui bloque une
  -- personne mineure sur le même compte.
  select r.owner_id into v_owner_id
    from public.listing_reports r
   where r.id = p_report_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_owner_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text, 0));
  end if;

  select * into v_report
    from public.listing_reports r
   where r.id = p_report_id
   for update;

  -- Personne ne tranche un signalement visant sa propre annonce, pas même un
  -- administrateur.
  if v_report.owner_id = auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_report.status <> 'open' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  if p_decision = 'remove' and v_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;

  update public.listing_reports
     set status = case when p_decision = 'dismiss' then 'dismissed' else 'confirmed' end::public.report_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         resolution_note = v_note
   where id = p_report_id;

  if p_decision = 'dismiss' then
    -- Course : un signalement urgent concurrent peut suspendre l'annonce
    -- pendant que ce rejet s'exécute ; sans verrou sur la ligne `listings`,
    -- les tests ci-dessous liraient un instantané antérieur et le
    -- `suspended_at = null` remettrait en ligne une annonce visée par un
    -- signalement « personne mineure présumée ». On verrouille donc la ligne
    -- d'abord : les vérifications qui suivent voient l'état d'après verrou.
    if v_report.listing_id is not null then
      perform 1 from public.listings where id = v_report.listing_id for update;
    end if;

    -- La suspension ne tombe que si le profil n'est pas déjà archivé, qu'aucun
    -- signalement confirmé ne le vise, et que plus aucun signalement urgent
    -- ouvert ne le vise.
    if v_report.listing_id is not null and not exists (
      select 1 from public.listings l
       where l.id = v_report.listing_id and l.status = 'archived'
    ) and not exists (
      select 1 from public.listing_reports r
       where r.listing_id = v_report.listing_id
         and (r.status = 'confirmed' or (r.status = 'open' and r.is_urgent))
    ) then
      update public.listings set suspended_at = null where id = v_report.listing_id;
    end if;

  elsif p_decision = 'remove' then
    if v_report.listing_id is not null then
      update public.listings
         set status = 'archived', suspended_at = coalesce(suspended_at, now())
       where id = v_report.listing_id;

      update public.listing_reports
         set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = v_note
       where listing_id = v_report.listing_id and status = 'open';
    end if;

  else -- block_minor
    if v_report.owner_id is not null then
      update public.listings
         set status = 'archived',
             is_verified = false,
             verification_grace_until = null,
             suspended_at = coalesce(suspended_at, now())
       where owner_id = v_report.owner_id;

      insert into public.verification_blocks (user_id, verification_id, blocked_by)
      values (v_report.owner_id, null, auth.uid())
      on conflict (user_id) do nothing;

      update public.verification_requests
         set status = 'revoked', rejection_reason = 'personne_mineure',
             reviewed_by = auth.uid(), reviewed_at = now()
       where user_id = v_report.owner_id and status = 'approved';

      update public.verification_requests
         set status = 'rejected', rejection_reason = 'personne_mineure',
             reviewed_by = auth.uid(), reviewed_at = now()
       where user_id = v_report.owner_id and status = 'pending';

      delete from public.verification_requests
       where user_id = v_report.owner_id and status = 'awaiting_video';

      update public.listing_reports
         set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = v_note
       where owner_id = v_report.owner_id and status = 'open';

    elsif v_report.listing_id is not null then
      -- Annonce sans compte propriétaire (antérieure à la vérification
      -- d'identité) : personne à bloquer, mais le profil signalé est tout de
      -- même retiré, comme pour `remove`, sans exiger de note.
      update public.listings
         set status = 'archived', suspended_at = coalesce(suspended_at, now())
       where id = v_report.listing_id;

      update public.listing_reports
         set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = v_note
       where listing_id = v_report.listing_id and status = 'open';
    end if;
  end if;

  insert into public.moderation_log (report_id, listing_id, moderator_id, action, reason)
  values (p_report_id, v_report.listing_id, auth.uid(), 'report_' || p_decision, v_note);
end;
$$;

create or replace function public.admin_list_open_reports()
returns table (
  id                      uuid,
  reason                  public.report_reason,
  is_urgent               boolean,
  details                 text,
  created_at              timestamptz,
  reporter_id             uuid,
  owner_id                uuid,
  listing_id              uuid,
  listing_title           text,
  listing_city            text,
  listing_cover_url       text,
  listing_description     text,
  listing_status          public.listing_status,
  listing_suspended_at    timestamptz,
  listing_is_verified     boolean,
  listing_grace_until     timestamptz,
  open_reports_on_listing integer,
  snapshot_title          text,
  snapshot_description    text,
  snapshot_cover_url      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select r.id, r.reason, r.is_urgent, r.details, r.created_at,
           r.reporter_id, r.owner_id, r.listing_id,
           l.title, l.city, l.cover_url, left(l.description, 280),
           l.status, l.suspended_at, l.is_verified, l.verification_grace_until,
           (select count(*)::int from public.listing_reports o
             where o.listing_id = r.listing_id and o.status = 'open'),
           r.listing_title_snapshot, r.listing_description_snapshot, r.listing_cover_url_snapshot
      from public.listing_reports r
      left join public.listings l on l.id = r.listing_id
     where r.status = 'open'
     order by r.is_urgent desc, r.created_at asc
     limit 200;
end;
$$;

revoke execute on function public.submit_report(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.review_report(uuid, text, text) from public, anon;
revoke execute on function public.admin_list_open_reports() from public, anon;

grant execute on function public.submit_report(uuid, public.report_reason, text) to authenticated;
grant execute on function public.review_report(uuid, text, text) to authenticated;
grant execute on function public.admin_list_open_reports() to authenticated;

-- Redéfinition de `review_verification` (corps identique à la migration 0011,
-- messages, signature et droits compris) au seul détail de l'ordre des
-- verrous : le verrou consultatif par compte est désormais pris AVANT le
-- verrou de ligne. Les deux fonctions de décision par compte
-- (`review_verification` et `review_report`) suivent ainsi le même ordre
-- « verrou consultatif puis verrou de ligne », sans quoi deux administrateurs
-- travaillant sur le même compte (l'un tranchant une vérification, l'autre
-- bloquant une personne mineure) pouvaient s'interbloquer (40P01).
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
  v_user_id uuid;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject', 'block_minor', 'revoke') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  -- Lecture sans verrou de ligne : la clé du verrou consultatif est celle du
  -- compte, il faut donc la connaître avant de verrouiller quoi que ce soit.
  select r.user_id into v_user_id
    from public.verification_requests r
   where r.id = p_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Verrou consultatif exclusif, à la clé du compte : sérialise cette
  -- décision avec toute insertion ou mise à jour d'annonce concurrente
  -- (verrou partagé pris dans le trigger `listings_enforce_verification`),
  -- pour qu'aucune annonce ne garde ou ne perde son badge à contretemps.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_request
    from public.verification_requests r
   where r.id = p_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Personne ne statue sur sa propre vérification, pas même un administrateur.
  if v_request.user_id = auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
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

revoke execute on function public.review_verification(uuid, text, public.identity_rejection_reason, text) from public, anon;
grant execute on function public.review_verification(uuid, text, public.identity_rejection_reason, text) to authenticated;

-- Un examen en cours ne doit pas pouvoir être contourné en supprimant son
-- compte : la suppression en cascade ferait disparaître l'annonce, et
-- `review_report` n'aurait plus personne à bloquer.
--
-- Le blocage dure le temps de l'examen, pas au-delà de la décision. Un profil
-- retiré par une décision (`remove` ou `block_minor`) reste archivé et
-- suspendu définitivement : il ne doit plus empêcher la suppression du compte,
-- sans quoi le droit à l'effacement serait bloqué indéfiniment. Seuls
-- comptent donc un signalement encore ouvert, ou une suspension sur un profil
-- non archivé, c'est-à-dire masqué le temps de l'examen.
create or replace function public.account_has_open_moderation()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.listing_reports r
       where r.owner_id = auth.uid() and r.status = 'open'
    )
    or exists (
      select 1 from public.listings l
       where l.owner_id = auth.uid()
         and l.suspended_at is not null
         and l.status <> 'archived'
    )
  );
$$;

revoke execute on function public.account_has_open_moderation() from public, anon;
grant execute on function public.account_has_open_moderation() to authenticated;
