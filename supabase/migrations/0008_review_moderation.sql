-- Modération des avis.
--
-- La migration 0007 a rendu les avis publics sans donner à l'équipe le moyen
-- d'en retirer un. Or `reviews_author_delete` ne vise que l'auteur : un
-- administrateur est bloqué par RLS comme n'importe quel tiers, et un avis
-- diffamatoire ou manifestement faux reste en ligne indéfiniment.
--
-- On garde le retrait hors de portée des rôles clients et on passe, comme pour
-- la certification, par une fonction qui vérifie explicitement l'appartenance
-- à `admins`.

create or replace function public.moderate_review(
  p_review_id uuid,
  p_reason    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.reviews
   where id = p_review_id
  returning listing_id into v_listing;

  if v_listing is null then
    raise exception 'review_not_found' using errcode = '22023';
  end if;

  -- Trace minimale : qui a retiré quoi et pourquoi. Sans cela, une modération
  -- contestée est indémontrable.
  insert into public.moderation_log (review_id, listing_id, moderator_id, reason)
  values (p_review_id, v_listing, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

create table public.moderation_log (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null,
  listing_id   uuid not null,
  moderator_id uuid references auth.users (id) on delete set null,
  reason       text,
  created_at   timestamptz not null default now()
);

alter table public.moderation_log enable row level security;

-- Journal interne : lisible des seuls administrateurs, jamais du public.
create policy "moderation_log_admin_read"
  on public.moderation_log for select
  using (public.is_admin());

revoke all on public.moderation_log from anon, authenticated;
grant select on public.moderation_log to authenticated;
grant select, insert on public.moderation_log to service_role;

grant execute on function public.moderate_review to authenticated;

-- La fonction est créée avant la table qu'elle référence : PL/pgSQL ne résout
-- les identifiants qu'à l'exécution, l'ordre importe donc peu ici. On le
-- signale pour que l'inversion apparente ne passe pas pour une erreur.
