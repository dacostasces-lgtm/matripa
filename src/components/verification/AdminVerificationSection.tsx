import Image from "next/image";
import Link from "next/link";
import { Trash2, UserCheck } from "lucide-react";

import { blockMinorVerification, purgeVerificationVideos, revokeVerification } from "@/app/actions/admin";
import { VerificationReview } from "@/components/verification/VerificationReview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { completeRows, FINAL_STATUSES, planVideoPurge, type VideoReference } from "@/lib/verification";
import { listVerificationVideos } from "@/lib/verification-storage";
import { documentLabel } from "@/types/verification";

const PAGE_SIZE = 20;

type QueueItem = {
  id: string;
  user_id: string;
  document_type: string | null;
  submitted_at: string;
  challenge_code: string;
};

type VerifiedItem = { id: string; user_id: string; reviewed_at: string };

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Précondition : l'appelant a vérifié `is_admin()`. Les adresses e-mail ne
 * sont lisibles qu'avec service_role ; elles ne quittent pas le serveur.
 */
export async function AdminVerificationSection({ page }: { page: number }) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  const [{ data: queueData }, { data: verifiedData, count }, pendingResult, decidedResult, files] = await Promise.all([
    supabase
      .from("verification_requests")
      .select("id, user_id, document_type, submitted_at, challenge_code")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true })
      .returns<QueueItem[]>(),
    supabase
      .from("verification_requests")
      .select("id, user_id, reviewed_at", { count: "exact" })
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .returns<VerifiedItem[]>(),
    supabase
      .from("verification_requests")
      .select("id, status, video_path", { count: "exact" })
      .eq("status", "pending")
      .not("video_path", "is", null)
      .returns<VideoReference[]>(),
    supabase
      .from("verification_requests")
      .select("id, status, video_path", { count: "exact" })
      .in("status", FINAL_STATUSES)
      .not("video_path", "is", null)
      .returns<VideoReference[]>(),
    listVerificationVideos(),
  ]);

  const queue = queueData ?? [];
  const verifiedAccounts = verifiedData ?? [];
  // Même garde que `purgeVerificationVideos` : une lecture en échec ou
  // tronquée (nombre exact supérieur aux lignes reçues) ferait compter les
  // vidéos de demandes `pending` comme abandonnées. Le bandeau est alors
  // simplement masqué, de même quand le listing du bucket échoue.
  const pending = completeRows(pendingResult);
  const decided = completeRows(decidedResult);
  if (!pending || !decided) console.error("[admin] purge refs incomplete");
  const toPurge =
    pending && decided && files ? planVideoPurge(files, [...pending, ...decided], new Date()).paths.length : 0;

  const userIds = [...new Set([...queue, ...verifiedAccounts].map((item) => item.user_id))];
  const admin = createAdminClient();
  const emails = new Map(
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? "Compte supprimé"] as const;
      }),
    ),
  );

  const { data: covers } = queue.length
    ? await supabase
        .from("listings")
        .select("owner_id, cover_url")
        .in("owner_id", queue.map((item) => item.user_id))
        .returns<{ owner_id: string; cover_url: string }[]>()
    : { data: [] as { owner_id: string; cover_url: string }[] };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <section className="mb-14 space-y-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">Vérifications d&apos;identité</h2>
        <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
          {queue.length} demande{queue.length > 1 ? "s" : ""} en attente. La vidéo est supprimée dès la décision.
        </p>

        {toPurge > 0 && (
          <form
            action={purgeVerificationVideos}
            className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <p className="flex-1">
              {toPurge} vidéo{toPurge > 1 ? "s" : ""} à purger (déjà jugée{toPurge > 1 ? "s" : ""} ou abandonnée{toPurge > 1 ? "s" : ""}).
            </p>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300/40 px-3 text-xs font-medium hover:bg-amber-500/20"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Purger
            </button>
          </form>
        )}

        {queue.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Aucune vérification en attente.
          </p>
        ) : (
          <ul className="space-y-4">
            {queue.map((item) => (
              <li key={item.id} className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-white">{emails.get(item.user_id)}</p>
                  <p className="text-xs text-slate-400">
                    Envoyée le {dateFr(item.submitted_at)} · {documentLabel(item.document_type ?? "")}
                  </p>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">Code attendu</p>
                    <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-white">{item.challenge_code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(covers ?? [])
                      .filter((cover) => cover.owner_id === item.user_id)
                      .map((cover) => (
                        <div key={cover.cover_url} className="relative size-16 overflow-hidden rounded-lg">
                          <Image src={cover.cover_url} alt="" fill sizes="64px" className="object-cover" />
                        </div>
                      ))}
                  </div>
                </div>
                <VerificationReview requestId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">Comptes vérifiés</h2>
        <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
          La révocation retire le badge et masque immédiatement les profils du compte. Un constat de
          minorité archive les profils et bloque le compte.
        </p>

        {verifiedAccounts.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Aucun compte vérifié.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {verifiedAccounts.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                <UserCheck className="size-4 shrink-0 text-emerald-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{emails.get(item.user_id)}</p>
                  <p className="text-xs text-slate-500">Vérifié le {dateFr(item.reviewed_at)}</p>
                </div>
                <form action={revokeVerification} className="flex flex-wrap gap-2">
                  <input type="hidden" name="request_id" value={item.id} />
                  <label htmlFor={`revoke-${item.id}`} className="sr-only">
                    Motif de la révocation, visible par le partenaire
                  </label>
                  <input
                    id={`revoke-${item.id}`}
                    name="note"
                    required
                    maxLength={300}
                    placeholder="Motif, visible par le partenaire (obligatoire)"
                    className="h-9 w-72 max-w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white placeholder:text-slate-600"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-lg border border-rose-400/30 px-3 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    Révoquer
                  </button>
                </form>
                <form action={blockMinorVerification} className="flex w-full flex-wrap items-center justify-end gap-2">
                  <input type="hidden" name="request_id" value={item.id} />
                  <label className="flex items-center gap-1.5 text-xs text-red-300">
                    <input type="checkbox" name="confirm_minor" required className="size-3.5 accent-red-500" />
                    Archiver les profils et bloquer le compte
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-lg border border-red-500/40 px-3 text-xs font-medium text-red-300 hover:bg-red-500/10"
                  >
                    Signaler une personne mineure
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav aria-label="Pagination des comptes vérifiés" className="mt-4 flex items-center gap-3 text-sm text-slate-400">
            {page > 1 && <Link href={`/admin?verifies=${page - 1}`} className="hover:text-white">Précédents</Link>}
            <span>
              Page {page} / {totalPages}
            </span>
            {page < totalPages && <Link href={`/admin?verifies=${page + 1}`} className="hover:text-white">Suivants</Link>}
          </nav>
        )}
      </div>
    </section>
  );
}
