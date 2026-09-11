-- Demandes de mise en relation émises depuis une fiche annonce.

create type request_status as enum ('pending', 'contacted', 'confirmed', 'cancelled');

create table public.requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,

  full_name    text not null check (char_length(trim(full_name)) between 2 and 80),
  phone        text not null check (phone ~ '^\+?[0-9 ]{8,20}$'),
  email        text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message      text not null default '' check (char_length(message) <= 1000),

  desired_date date,
  guests       smallint check (guests between 1 and 200),

  status       request_status not null default 'pending',
  -- Renseigné si l'auteur était connecté ; null pour une demande invité.
  author_id    uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index requests_listing_idx on public.requests (listing_id, created_at desc);
create index requests_status_idx on public.requests (status) where status = 'pending';

alter table public.requests enable row level security;

-- Les demandes contiennent des coordonnées personnelles : aucune lecture
-- publique. Seuls le partenaire destinataire et l'auteur y accèdent.
create policy "requests_listing_owner_read"
  on public.requests for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = requests.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "requests_author_read"
  on public.requests for select
  using (author_id is not null and author_id = auth.uid());

-- Le partenaire fait avancer le statut de ses propres demandes.
create policy "requests_listing_owner_update"
  on public.requests for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = requests.listing_id and l.owner_id = auth.uid()
    )
  );

revoke all on public.requests from anon, authenticated;
grant select on public.requests to authenticated;
grant update (status) on public.requests to authenticated;

-- Requis par le webhook de notification, qui relit la demande avec la clé
-- service_role. Contourner RLS ne dispense pas d'un GRANT.
grant select, update on public.requests to service_role;

-- L'insertion passe exclusivement par la Server Action (SECURITY DEFINER) :
-- cela permet d'appliquer un anti-spam côté serveur sans exposer la table en
-- écriture directe au client.
create function public.submit_request(
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
  -- L'annonce doit exister et être publiée.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id and status = 'published'
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

grant execute on function public.submit_request to anon, authenticated;
