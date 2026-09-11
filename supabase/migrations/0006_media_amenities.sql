-- Matripa — aperçus vidéo, équipements et disponibilité immédiate.
--
-- Trois besoins produit distincts, regroupés ici parce qu'ils touchent la même
-- table et le même jeu de GRANT :
--
--   1. `video_url` / `video_poster_url` alimentent le carrousel « Aperçus »
--      (shorts verticaux) et l'onglet Vidéo de la fiche détail.
--   2. `amenities` liste les services inclus (« Service 24/7 », « Salon privé »)
--      affichés en puces sur la fiche.
--   3. `is_available_now` pilote la pastille verte « Disponible immédiatement »
--      de la carte.

alter table public.listings
  add column video_url        text,
  add column video_poster_url text,
  add column amenities        text[] not null default '{}',
  add column is_available_now boolean not null default false;

-- Un aperçu doit être une URL http(s) : la valeur finit dans un `<video src>`,
-- donc un `javascript:` stocké en base deviendrait un vecteur d'injection.
alter table public.listings
  add constraint listings_video_url_scheme
    check (video_url is null or video_url ~ '^https?://'),
  add constraint listings_video_poster_scheme
    check (video_poster_url is null or video_poster_url ~ '^https?://');

-- Le carrousel d'aperçus ne lit que les annonces publiées *avec* vidéo, triées
-- VIP d'abord. L'index partiel évite un seq scan sur une table qui grossit
-- alors que la fraction « avec vidéo » reste minoritaire.
create index listings_video_idx
  on public.listings (is_vip desc, created_at desc)
  where status = 'published' and video_url is not null;

-- La disponibilité immédiate est un signal de tri secondaire sur le fil.
create index listings_available_now_idx
  on public.listings (city, is_available_now desc)
  where status = 'published' and is_available_now;

-- Ces quatre colonnes relèvent du partenaire (il connaît son planning et ses
-- équipements), contrairement à `is_vip` / `is_verified` qui restent réservées
-- au back-office. Les GRANT de la migration 0001 énumèrent les colonnes une à
-- une : il faut donc les étendre explicitement.
grant insert (video_url, video_poster_url, amenities, is_available_now)
  on public.listings to authenticated;

grant update (video_url, video_poster_url, amenities, is_available_now)
  on public.listings to authenticated;
