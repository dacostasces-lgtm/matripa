-- Migration 0010 : Engagement Médias & Monétisation Matripa
--
-- 1. Matripa Shorts & Médias privés
-- 2. Système de Boost d'Annonce & Pass VIP Gold
-- 3. Portefeuille (Wallet) & Cadeaux Virtuels en FCFA
-- 4. Vérification par Selfie Vidéo

/* -------------------------------------------------------------------------- */
/*                            Extensions sur listings                         */
/* -------------------------------------------------------------------------- */

alter table public.listings
  add column if not exists boosted_until timestamptz,
  add column if not exists whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^\+?[0-9]{9,15}$'),
  add column if not exists is_video_verified boolean not null default false;

create index if not exists listings_boosted_idx
  on public.listings (boosted_until desc nulls last);

/* -------------------------------------------------------------------------- */
/*                                   Boosts                                   */
/* -------------------------------------------------------------------------- */

create type boost_plan_type as enum ('boost_24h', 'boost_7d');

create table public.boosts (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  payer_id     uuid references auth.users (id) on delete set null,
  plan         boost_plan_type not null,
  amount_xaf   integer not null check (amount_xaf > 0),
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

alter table public.boosts enable row level security;

create policy "boosts_public_read"
  on public.boosts for select
  using (true);

create policy "boosts_owner_insert"
  on public.boosts for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = boosts.listing_id and l.owner_id = auth.uid()
    )
  );

/* -------------------------------------------------------------------------- */
/*                             Médias Privés & Unlocks                        */
/* -------------------------------------------------------------------------- */

create table public.private_media (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  media_type   text not null default 'image' check (media_type in ('image', 'video')),
  storage_path text not null,
  blur_path    text,
  price_xaf    integer not null default 1500 check (price_xaf >= 0),
  is_locked    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.private_media enable row level security;

create policy "private_media_public_select"
  on public.private_media for select
  using (true);

create table public.private_media_unlocks (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references public.private_media (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (media_id, user_id)
);

alter table public.private_media_unlocks enable row level security;

create policy "private_media_unlocks_user_select"
  on public.private_media_unlocks for select
  using (auth.uid() = user_id);

create policy "private_media_unlocks_user_insert"
  on public.private_media_unlocks for insert
  with check (auth.uid() = user_id);

/* -------------------------------------------------------------------------- */
/*                          Wallet & Cadeaux Virtuels                         */
/* -------------------------------------------------------------------------- */

create table public.wallets (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  balance_xaf  integer not null default 0 check (balance_xaf >= 0),
  updated_at   timestamptz not null default now()
);

alter table public.wallets enable row level security;

create policy "wallets_owner_read"
  on public.wallets for select
  using (auth.uid() = user_id);

create table public.wallet_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  amount_xaf   integer not null check (amount_xaf > 0),
  tx_type      text not null check (tx_type in ('credit', 'debit')),
  description  text not null,
  created_at   timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "wallet_tx_owner_read"
  on public.wallet_transactions for select
  using (auth.uid() = user_id);

/* -------------------------------------------------------------------------- */
/*                        Vérification par Selfie Vidéo                       */
/* -------------------------------------------------------------------------- */

create type verification_status as enum ('pending', 'approved', 'rejected');

create table public.video_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  video_path   text not null,
  status       verification_status not null default 'pending',
  notes        text,
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

alter table public.video_verifications enable row level security;

create policy "video_verifications_owner_read"
  on public.video_verifications for select
  using (auth.uid() = user_id);

create policy "video_verifications_owner_insert"
  on public.video_verifications for insert
  with check (auth.uid() = user_id);

create policy "video_verifications_admin_all"
  on public.video_verifications for all
  using (public.is_admin());

-- Grants nécessaires
grant select, insert on public.boosts to authenticated;
grant select, insert on public.private_media_unlocks to authenticated;
grant select on public.wallets to authenticated;
grant select on public.wallet_transactions to authenticated;
grant select, insert on public.video_verifications to authenticated;
