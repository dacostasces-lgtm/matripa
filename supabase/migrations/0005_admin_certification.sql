-- Certification des annonces par l'équipe Matripa.
--
-- `is_vip` et `is_verified` sont hors des GRANT du rôle `authenticated`
-- (migration 0001) : aucun partenaire ne peut se certifier lui-même. Or les
-- GRANT s'appliquent au rôle, pas à la ligne — on ne peut donc pas « ouvrir
-- ces colonnes aux seuls administrateurs » par ce biais.
--
-- D'où une fonction SECURITY DEFINER qui vérifie explicitement l'appartenance
-- à `admins`, sur le même modèle que `submit_request`.

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Un administrateur peut vérifier son propre statut ; personne ne peut lire
-- la liste complète ni s'y ajouter depuis le client.
create policy "admins_self_read"
  on public.admins for select
  using (user_id = auth.uid());

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.admins to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin to authenticated;

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
     set is_verified = coalesce(p_is_verified, is_verified),
         is_vip      = coalesce(p_is_vip, is_vip)
   where id = p_listing_id;

  if not found then
    raise exception 'listing_not_found' using errcode = '22023';
  end if;
end;
$$;

grant execute on function public.set_listing_certification to authenticated;

-- Un administrateur doit voir toutes les annonces, brouillons compris, pour
-- pouvoir les contrôler avant certification.
create policy "listings_admin_read"
  on public.listings for select
  using (public.is_admin());

-- Promotion d'un compte en administrateur (clé service_role requise) :
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'vous@matripa.cg';
