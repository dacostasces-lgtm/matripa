-- Politiques d'accès au bucket `listings`.
--
-- Convention de chemin : listings/<auth.uid()>/<slug>/<fichier>.jpg
-- Le premier segment porte l'identité du propriétaire, ce qui permet de
-- confiner chaque partenaire à son propre dossier.

-- Lecture publique : le bucket sert les visuels des annonces.
create policy "listings_public_read"
  on storage.objects for select
  using (bucket_id = 'listings');

-- Un partenaire ne dépose que sous son propre préfixe. `foldername(name)[1]`
-- vaut le premier segment du chemin ; le comparer à auth.uid() empêche
-- d'écrire — ou d'écraser — les visuels d'un autre.
create policy "listings_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listings_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listings_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
