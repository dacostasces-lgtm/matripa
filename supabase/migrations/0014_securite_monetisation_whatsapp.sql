-- Sécurisation des tables de monétisation (0010) et saisie du numéro WhatsApp.
--
-- 0010 créait ses tables sans retirer les privilèges que Supabase accorde par
-- défaut à `anon` et `authenticated` — contrairement à toutes les migrations
-- précédentes — et deux de ses policies ouvraient le contenu payant :
--
--   1. `private_media_public_select … using (true)` : tout visiteur, même sans
--      compte, pouvait lire `storage_path`, c'est-à-dire le média payant en
--      clair. Le flou de l'aperçu ne protégeait rien.
--   2. `private_media_unlocks_user_insert` : tout membre pouvait s'insérer un
--      déblocage à lui-même, sans payer.
--   3. `boosts_owner_insert` : un partenaire pouvait s'accorder un boost
--      gratuit ; `boosts_public_read` exposait en outre qui a payé quoi.
--
-- Principe retenu : ces lignes-là naissent d'un paiement confirmé, donc côté
-- serveur (clé service_role, comme `settle_payment`). Les clients ne font que
-- lire ce qui les concerne.
--
-- Les tables sont vides en production au moment de cette migration : rien n'a
-- été exposé, mais il fallait fermer avant le premier média réel.

/* -------------------------------------------------------------------------- */
/*                        Numéro WhatsApp des annonces                        */
/* -------------------------------------------------------------------------- */

-- 0010 a ajouté la colonne sans GRANT : le formulaire partenaire ne pouvait
-- pas l'écrire. Même logique que les colonnes de 0001 et 0006.
grant insert (whatsapp_phone) on public.listings to authenticated;
grant update (whatsapp_phone) on public.listings to authenticated;

/* -------------------------------------------------------------------------- */
/*                 Aucun privilège implicite sur les tables 0010              */
/* -------------------------------------------------------------------------- */

revoke all on public.private_media         from anon, authenticated;
revoke all on public.private_media_unlocks from anon, authenticated;
revoke all on public.boosts                from anon, authenticated;
revoke all on public.wallets               from anon, authenticated;
revoke all on public.wallet_transactions   from anon, authenticated;

-- Cf. 0001 : RLS et GRANT sont distincts, service_role a besoin de droits explicites.
grant select, insert, update, delete on public.private_media         to service_role;
grant select, insert, update, delete on public.private_media_unlocks to service_role;
grant select, insert, update, delete on public.boosts                to service_role;
grant select, insert, update, delete on public.wallets               to service_role;
grant select, insert, update, delete on public.wallet_transactions   to service_role;

/* -------------------------------------------------------------------------- */
/*                               Médias privés                                */
/* -------------------------------------------------------------------------- */

drop policy if exists "private_media_public_select" on public.private_media;

-- L'aperçu (flou, prix) reste public pour les annonces publiées ; le
-- propriétaire voit aussi ceux de ses brouillons.
create policy "private_media_teaser_select"
  on public.private_media for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = private_media.listing_id
        and (l.status = 'published' or l.owner_id = auth.uid())
    )
  );

-- `storage_path` n'est accordé à personne côté client : le média complet ne
-- sera servi qu'après vérification du déblocage, par le serveur.
grant select (id, listing_id, media_type, blur_path, price_xaf, is_locked, created_at)
  on public.private_media to anon, authenticated;

/* -------------------------------------------------------------------------- */
/*                                 Déblocages                                 */
/* -------------------------------------------------------------------------- */

drop policy if exists "private_media_unlocks_user_insert" on public.private_media_unlocks;

-- La policy de lecture de ses propres déblocages (0010) est conservée.
grant select on public.private_media_unlocks to authenticated;

/* -------------------------------------------------------------------------- */
/*                                   Boosts                                   */
/* -------------------------------------------------------------------------- */

drop policy if exists "boosts_owner_insert" on public.boosts;
drop policy if exists "boosts_public_read" on public.boosts;

-- Le classement public s'appuie sur `listings.boosted_until` ; le détail des
-- boosts (montant, payeur) ne regarde que le propriétaire de l'annonce.
create policy "boosts_owner_read"
  on public.boosts for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = boosts.listing_id and l.owner_id = auth.uid()
    )
  );

grant select on public.boosts to authenticated;

/* -------------------------------------------------------------------------- */
/*                         Portefeuille (lecture seule)                       */
/* -------------------------------------------------------------------------- */

-- Policies de lecture de 0010 conservées ; aucun crédit ni débit côté client.
grant select on public.wallets             to authenticated;
grant select on public.wallet_transactions to authenticated;
