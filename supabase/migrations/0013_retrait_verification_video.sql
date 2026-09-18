-- Retrait de la vérification vidéo factice introduite par la migration 0010.
--
-- Trois défauts, dans l'ordre de gravité :
--
--   1. `video_verifications` accordait `insert` au rôle `authenticated` sans
--      restreindre les colonnes, et sa policy ne vérifiait que l'appartenance
--      de la ligne. N'importe quel compte pouvait donc s'insérer lui-même avec
--      `status = 'approved'` : le badge attestait exactement ce que son
--      titulaire voulait bien déclarer.
--   2. Aucun code n'écrivait jamais `listings.is_video_verified`, et aucun
--      espace de stockage privé n'accueillait les vidéos : le parcours côté
--      interface était une simulation.
--   3. Le badge « Selfie Vérifié » affiché sur les cartes et les fiches ne
--      reposait donc sur rien, à côté du badge « Certifié » qui, lui, découle
--      d'une vérification d'identité réellement examinée (migration 0011).
--
-- Les `if exists` rendent cette migration applicable quel que soit l'ordre de
-- fusion des branches.

drop table if exists public.video_verifications;

-- Type propre à cette table. La vérification d'identité utilise ses propres
-- types, préfixés `identity_*` : ils ne sont pas concernés.
drop type if exists public.verification_status;

alter table public.listings drop column if exists is_video_verified;
