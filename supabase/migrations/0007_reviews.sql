-- Avis clients.
--
-- Cette migration comble la seule dépendance que le schéma déclarait sans la
-- tenir : `listings.rating` et `reviews_count` étaient fermés à tout rôle
-- client, en attendant le trigger annoncé dans la migration 0001. Jusqu'ici,
-- les notes affichées ne venaient que du seed.
--
-- Règle de confiance : on ne peut noter qu'une prestation réellement rendue.
-- La preuve est la demande passée en `confirmed` par le partenaire, ce qui
-- donne enfin une suite au workflow de `requests`.

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),

  -- Un avis par demande : la contrainte d'unicité fait office de garde-fou,
  -- même si `submit_review` vérifie déjà l'absence de doublon.
  request_id uuid not null unique references public.requests (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,

  rating     smallint not null check (rating between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 1000),

  created_at timestamptz not null default now()
);

create index reviews_listing_idx on public.reviews (listing_id, created_at desc);

alter table public.reviews enable row level security;

-- Lecture publique : un avis n'a de valeur que s'il est visible.
create policy "reviews_public_read"
  on public.reviews for select
  using (true);

-- L'auteur peut corriger ou retirer son avis ; il ne peut pas en écrire un
-- directement (aucun GRANT d'insertion), c'est `submit_review` qui contrôle
-- l'éligibilité.
create policy "reviews_author_update"
  on public.reviews for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "reviews_author_delete"
  on public.reviews for delete
  using (author_id = auth.uid());

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant update (rating, comment), delete on public.reviews to authenticated;
grant select, insert, update, delete on public.reviews to service_role;

/* -------------------------------------------------------------------------- */
/*                    Recalcul de la note portée par l'annonce                 */
/* -------------------------------------------------------------------------- */

-- SECURITY DEFINER indispensable : `rating` et `reviews_count` ne sont
-- accessibles en écriture à aucun rôle client, précisément pour qu'une note ne
-- puisse jamais être posée à la main.
create or replace function public.recompute_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
     set rating = (
           select round(avg(r.rating)::numeric, 1)
             from public.reviews r
            where r.listing_id = v_listing
         ),
         reviews_count = (
           select count(*) from public.reviews r where r.listing_id = v_listing
         )
   where l.id = v_listing;

  return null;  -- trigger AFTER : la valeur de retour est ignorée.
end;
$$;

create trigger reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row
  execute function public.recompute_listing_rating();

/* -------------------------------------------------------------------------- */
/*                            Dépôt d'un avis                                  */
/* -------------------------------------------------------------------------- */

create or replace function public.submit_review(
  p_request_id uuid,
  p_rating     smallint,
  p_comment    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- La demande doit appartenir à l'appelant ET avoir été confirmée. Une
  -- demande déposée en invité a `author_id` nul : elle ne donne donc pas
  -- droit à un avis, faute de pouvoir en attribuer la paternité.
  select r.listing_id into v_listing
    from public.requests r
   where r.id = p_request_id
     and r.author_id = auth.uid()
     and r.status = 'confirmed';

  if v_listing is null then
    raise exception 'not_eligible' using errcode = '42501';
  end if;

  if exists (select 1 from public.reviews where request_id = p_request_id) then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  insert into public.reviews (request_id, listing_id, author_id, rating, comment)
  values (p_request_id, v_listing, auth.uid(), p_rating, coalesce(nullif(trim(p_comment), ''), ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_review to authenticated;

-- Les notes du jeu de démonstration devenaient incohérentes : elles n'étaient
-- adossées à aucun avis. On repart de zéro, et l'interface masque les étoiles
-- tant que `reviews_count` vaut 0.
update public.listings set rating = null, reviews_count = 0;
