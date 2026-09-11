-- Matripa — table des annonces
-- Les libellés métier restent côté application ; la base ne stocke que des slugs.

create type listing_category as enum ('categorie-a', 'categorie-b', 'categorie-c');
create type listing_option   as enum ('option_1', 'option_2', 'option_3');
create type listing_mobility as enum ('sur_place', 'a_domicile', 'les_deux');
create type listing_status   as enum ('draft', 'published', 'archived');
create type price_unit       as enum ('hour', 'night', 'service');

create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  highlight     text,
  description   text not null default '',

  category      listing_category not null,
  option_type   listing_option   not null,
  mobility      listing_mobility not null,

  city          text not null,
  district      text,

  -- XAF : entier, la devise n'a pas de sous-unité.
  price_xaf     integer not null check (price_xaf >= 0),
  price_unit    price_unit not null default 'service',
  rates         jsonb not null default '[]'::jsonb,

  cover_url     text not null,
  images        text[] not null default '{}',

  rating        numeric(2,1) check (rating between 0 and 5),
  reviews_count integer not null default 0,

  is_vip        boolean not null default false,
  is_verified   boolean not null default false,

  languages     text[] not null default '{}',
  availability  text[] not null default '{}',

  status        listing_status not null default 'draft',
  owner_id      uuid references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),

  search_vector tsvector generated always as (
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(highlight, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(description, '')), 'C')
  ) stored
);

-- Ordre du fil : VIP d'abord, puis les plus récentes, dans la portée demandée.
create index listings_feed_idx
  on public.listings (city, category, is_vip desc, created_at desc)
  where status = 'published';

create index listings_price_idx on public.listings (price_xaf) where status = 'published';
create index listings_search_idx on public.listings using gin (search_vector);

alter table public.listings enable row level security;

-- Lecture publique limitée aux annonces publiées.
create policy "listings_public_read"
  on public.listings for select
  using (status = 'published');

-- Un partenaire ne gère que ses propres annonces.
create policy "listings_owner_read"
  on public.listings for select
  using (auth.uid() = owner_id);

create policy "listings_owner_insert"
  on public.listings for insert
  with check (auth.uid() = owner_id);

create policy "listings_owner_update"
  on public.listings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "listings_owner_delete"
  on public.listings for delete
  using (auth.uid() = owner_id);

-- RLS filtre les *lignes*, pas les colonnes : sans les GRANT ci-dessous, un
-- partenaire pourrait passer sa propre annonce en `is_verified` ou `is_vip`.
-- Ces deux champs relèvent du back-office (contrôle d'identité, paiement) et
-- ne sont donc jamais accessibles en écriture au rôle `authenticated`.
revoke all on public.listings from anon, authenticated;

grant select on public.listings to anon, authenticated;

grant insert (
  slug, title, highlight, description,
  category, option_type, mobility,
  city, district,
  price_xaf, price_unit, rates,
  cover_url, images,
  languages, availability,
  status, owner_id
) on public.listings to authenticated;

grant update (
  slug, title, highlight, description,
  category, option_type, mobility,
  city, district,
  price_xaf, price_unit, rates,
  cover_url, images,
  languages, availability,
  status
) on public.listings to authenticated;

grant delete on public.listings to authenticated;

-- `rating` et `reviews_count` ne sont volontairement accessibles à aucun rôle
-- client : une note que le vendeur peut écrire lui-même ne vaut rien. Elles
-- sont pour l'instant alimentées par le back-office (clé service_role) ; le
-- jour où une table d'avis existera, elles seront dérivées par trigger.

-- service_role contourne RLS, mais RLS et GRANT sont deux mécanismes
-- distincts : sans droits explicites, la clé service_role se voit refuser
-- l'accès à la table. Les privilèges par défaut varient selon les versions de
-- Supabase, on ne s'y fie donc pas.
grant select, insert, update, delete on public.listings to service_role;
