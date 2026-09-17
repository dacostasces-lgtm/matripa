import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { VERIFICATION_BUCKET, type StoredVideo } from "@/lib/verification";

/**
 * Accès au bucket privé `verifications` avec la clé service_role.
 *
 * Aucune policy ne permet au client de relire ou supprimer une vidéo : ces
 * opérations passent donc ici. Les appelants doivent avoir établi le droit
 * d'agir (session du propriétaire, ou `is_admin()`) **avant** d'appeler.
 */
const bucket = () => createAdminClient().storage.from(VERIFICATION_BUCKET);

/** Vidéo déjà déposée pour une demande, quand la soumission n'a pas abouti. */
export async function findVerificationUpload(userId: string, requestId: string): Promise<string | null> {
  const { data, error } = await bucket().list(userId, { limit: 20, search: requestId });

  if (error) {
    console.error("[verification] upload lookup failed", error);
    return null;
  }

  const match = data.find((file) => file.id && file.name.startsWith(`${requestId}.`));
  return match ? `${userId}/${match.name}` : null;
}

/**
 * Toutes les vidéos du bucket, à plat. Les dossiers sont renvoyés sans `id`.
 *
 * null si le listing du bucket ou d'un seul dossier échoue : une liste
 * partielle laisserait la purge remettre à null des références dont le
 * fichier n'a pas été vu, donc pas supprimé.
 */
export async function listVerificationVideos(): Promise<StoredVideo[] | null> {
  const storage = bucket();
  const { data: folders, error } = await storage.list("", { limit: 1000 });

  if (error) {
    console.error("[verification] bucket listing failed", error);
    return null;
  }

  const nested = await Promise.all(
    folders
      .filter((entry) => !entry.id)
      .map(async (folder) => {
        const { data: files, error: folderError } = await storage.list(folder.name, { limit: 1000 });
        if (folderError) {
          console.error("[verification] folder listing failed", folderError);
          return null;
        }
        // Un timestamp inconnu est traité comme ancien : l'objet sera éligible au nettoyage.
        // Les fichiers orphelins doivent être supprimables, ne pas se bloquer sur une métadonnée manquante.
        return files.filter((file) => file.id).map((file) => {
          if (!file.created_at) {
            console.error("[verification] file without created_at", `${folder.name}/${file.name}`);
          }
          return {
            path: `${folder.name}/${file.name}`,
            createdAt: file.created_at ?? new Date(0).toISOString(),
          };
        });
      }),
  );

  const videos: StoredVideo[] = [];
  for (const files of nested) {
    if (!files) return null;
    videos.push(...files);
  }
  return videos;
}

export async function deleteVerificationVideos(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;

  const { error } = await bucket().remove(paths);
  if (error) {
    console.error("[verification] video deletion failed", error);
    return false;
  }
  return true;
}

/** Suppression de compte : aucune pièce d'identité ne doit rester orpheline. */
export async function deleteUserVerificationFiles(userId: string): Promise<boolean> {
  const { data, error } = await bucket().list(userId, { limit: 1000 });

  if (error) {
    console.error("[verification] account files listing failed", error);
    return false;
  }

  return deleteVerificationVideos(data.filter((file) => file.id).map((file) => `${userId}/${file.name}`));
}
