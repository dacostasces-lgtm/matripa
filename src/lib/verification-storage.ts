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

/** Toutes les vidéos du bucket, à plat. Les dossiers sont renvoyés sans `id`. */
export async function listVerificationVideos(): Promise<StoredVideo[]> {
  const storage = bucket();
  const { data: folders, error } = await storage.list("", { limit: 1000 });

  if (error) {
    console.error("[verification] bucket listing failed", error);
    return [];
  }

  const nested = await Promise.all(
    folders
      .filter((entry) => !entry.id)
      .map(async (folder) => {
        const { data: files, error: folderError } = await storage.list(folder.name, { limit: 1000 });
        if (folderError) {
          console.error("[verification] folder listing failed", folderError);
          return [];
        }
        return files
          .filter((file) => file.id && file.created_at)
          .map((file) => ({ path: `${folder.name}/${file.name}`, createdAt: file.created_at as string }));
      }),
  );

  return nested.flat();
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
