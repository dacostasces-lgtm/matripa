-- Paiements mobile money via pawaPay.
--
-- Le Congo est couvert par deux opérateurs (MTN_MOMO_COG, AIRTEL_COG), en XAF
-- et **sans décimales** — ce qui coïncide avec `price_xaf`, déjà stocké en
-- entier. Aucune conversion n'est donc nécessaire.

create type payment_status as enum (
  'pending',      -- créé chez nous, pas encore accepté par pawaPay
  'processing',   -- accepté, en attente d'autorisation du payeur
  'completed',
  'failed'
);

create type payment_provider as enum ('MTN_MOMO_COG', 'AIRTEL_COG');

create table public.payments (
  -- Identifiant transmis à pawaPay comme `depositId`. C'est notre clé
  -- d'idempotence : un rejeu porte le même id et pawaPay renvoie
  -- DUPLICATE_IGNORED au lieu de débiter deux fois.
  id            uuid primary key default gen_random_uuid(),

  request_id    uuid not null references public.requests (id) on delete cascade,
  listing_id    uuid not null references public.listings (id) on delete cascade,
  payer_id      uuid references auth.users (id) on delete set null,

  -- Recopié depuis l'annonce au moment de l'initiation, jamais fourni par le
  -- client : c'est la seule garantie qu'on ne débite pas un montant choisi par
  -- le payeur lui-même.
  amount_xaf    integer not null check (amount_xaf > 0),
  currency      text not null default 'XAF' check (currency = 'XAF'),

  provider      payment_provider not null,
  phone         text not null check (phone ~ '^[0-9]{9,15}$'),

  status        payment_status not null default 'pending',
  failure_code  text,
  provider_txn_id text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un seul paiement abouti par demande. L'index partiel laisse coexister
-- plusieurs tentatives échouées, ce qui est le cas normal en mobile money.
create unique index payments_one_success_per_request
  on public.payments (request_id)
  where status in ('pending', 'processing', 'completed');

create index payments_status_idx on public.payments (status, created_at desc);

alter table public.payments enable row level security;

-- Le payeur suit ses propres paiements ; le partenaire voit ceux qui portent
-- sur ses annonces. Personne d'autre.
create policy "payments_payer_read"
  on public.payments for select
  using (payer_id is not null and payer_id = auth.uid());

create policy "payments_listing_owner_read"
  on public.payments for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = payments.listing_id and l.owner_id = auth.uid()
    )
  );

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant select, insert, update on public.payments to service_role;

/* -------------------------------------------------------------------------- */
/*                        Initiation d'un paiement                            */
/* -------------------------------------------------------------------------- */

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
  v_listing uuid;
  v_amount  integer;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- La demande doit appartenir à l'appelant. Le montant est lu sur l'annonce,
  -- pas reçu en paramètre : un client ne peut pas se facturer 1 FCFA.
  select r.listing_id, l.price_xaf
    into v_listing, v_amount
    from public.requests r
    join public.listings l on l.id = r.listing_id
   where r.id = p_request_id
     and r.author_id = auth.uid()
     and r.status <> 'cancelled';

  if v_listing is null then
    raise exception 'not_eligible' using errcode = '42501';
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

grant execute on function public.create_payment to authenticated;

-- La transition d'état vient exclusivement du callback pawaPay, reçu côté
-- serveur avec la clé service_role : aucun rôle client ne peut marquer un
-- paiement comme abouti.
create or replace function public.settle_payment(
  p_payment_id  uuid,
  p_status      payment_status,
  p_failure_code text default null,
  p_provider_txn text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
     set status          = p_status,
         failure_code    = nullif(trim(coalesce(p_failure_code, '')), ''),
         provider_txn_id = coalesce(p_provider_txn, provider_txn_id),
         updated_at      = now()
   where id = p_payment_id;

  if not found then
    raise exception 'payment_not_found' using errcode = '22023';
  end if;
end;
$$;

-- Volontairement hors de portée du rôle `authenticated`.
revoke execute on function public.settle_payment from public, anon, authenticated;
grant execute on function public.settle_payment to service_role;
