-- Notification du partenaire à chaque nouvelle demande.
--
-- pg_net effectue l'appel HTTP de façon asynchrone : le trigger n'attend pas
-- la réponse, donc une panne du webhook ne bloque jamais l'insertion.

create extension if not exists pg_net with schema extensions;

-- Table de configuration : évite de coder l'URL et le secret en dur dans la
-- fonction, et permet de les changer sans migration.
create table if not exists private_config (
  key   text primary key,
  value text not null
);

alter table private_config enable row level security;
-- Aucune policy, et aucun GRANT pour anon/authenticated : la table est
-- inatteignable depuis le client. Seul service_role y accède.
revoke all on private_config from anon, authenticated;
grant select, insert, update, delete on private_config to service_role;

comment on table private_config is
  'Secrets applicatifs. Aucune policy RLS : inaccessible aux rôles anon/authenticated.';

create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private_config where key = 'webhook_url';
  select value into v_secret from private_config where key = 'webhook_secret';

  if v_url is null or v_secret is null then
    raise warning 'notify_new_request: configuration absente, notification ignorée';
    return new;
  end if;

  -- Seul l'identifiant transite : le webhook relit les coordonnées côté
  -- serveur. Aucune donnée personnelle ne stationne dans la file pg_net.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-matripa-signature', v_secret
               ),
    body    := jsonb_build_object('request_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create trigger requests_notify_partner
  after insert on public.requests
  for each row
  execute function public.notify_new_request();

-- Configuration (à exécuter une fois, avec la clé service_role) :
--
--   insert into private_config (key, value) values
--     ('webhook_url', 'https://matripa.cg/api/webhooks/new-request'),
--     ('webhook_secret', '<REQUEST_WEBHOOK_SECRET>')
--   on conflict (key) do update set value = excluded.value;
--
-- `webhook_secret` doit être identique à REQUEST_WEBHOOK_SECRET côté Next.js.
