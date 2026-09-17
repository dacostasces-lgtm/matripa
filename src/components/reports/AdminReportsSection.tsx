import Image from "next/image";
import { MapPin } from "lucide-react";

import { ReportReview } from "@/components/reports/ReportReview";
import { cx } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";
import { reportReason } from "@/types/reports";
import type { OpenReportRow } from "@/types/database";

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Précondition : l'appelant a vérifié `is_admin()`. Les adresses e-mail et les
 * blocages sont lus avec service_role ; ils ne quittent pas le serveur.
 */
export async function AdminReportsSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_open_reports");

  if (error) {
    console.error("[admin] reports list failed", error);
    return (
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-white">Signalements</h2>
        <p role="alert" className="mt-3 text-sm text-red-300">
          Impossible de charger les signalements. Rechargez la page.
        </p>
      </section>
    );
  }

  const reports: OpenReportRow[] = data ?? [];
  const urgentCount = reports.filter((report) => report.is_urgent).length;

  const admin = createAdminClient();
  const userIds = [
    ...new Set(reports.flatMap((report) => [report.reporter_id, report.owner_id]).filter((id): id is string => id !== null)),
  ];
  const emails = new Map(
    await Promise.all(
      userIds.map(async (id) => {
        const { data: result, error: userError } = await admin.auth.admin.getUserById(id);
        if (userError) return [id, "Adresse indisponible"] as const;
        return [id, result.user?.email ?? "Compte supprimé"] as const;
      }),
    ),
  );

  const ownerIds = [...new Set(reports.map((report) => report.owner_id).filter((id): id is string => id !== null))];
  const { data: blocks } = ownerIds.length
    ? await admin.from("verification_blocks").select("user_id").in("user_id", ownerIds)
    : { data: [] as { user_id: string }[] };
  const blocked = new Set((blocks ?? []).map((block) => block.user_id));
  const now = new Date();

  const ownerState = (report: OpenReportRow): string => {
    if (!report.owner_id) return "Compte supprimé";
    if (blocked.has(report.owner_id)) return "Compte bloqué";
    if (report.listing_is_verified) return "Identité vérifiée";
    if (report.listing_grace_until && new Date(report.listing_grace_until) > now) return "En délai de grâce";
    return "Non vérifié";
  };

  return (
    <section className="mb-14">
      <h2 className="text-xl font-semibold tracking-tight text-white">Signalements</h2>
      <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
        {reports.length} signalement{reports.length > 1 ? "s" : ""} ouvert{reports.length > 1 ? "s" : ""}, dont{" "}
        {urgentCount} urgent{urgentCount > 1 ? "s" : ""}.
      </p>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
          Aucun signalement ouvert.
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li
              key={report.id}
              className={cx(
                "grid gap-5 rounded-2xl border bg-white/[0.03] p-4 md:grid-cols-2",
                report.is_urgent ? "border-red-500/40" : "border-white/10",
              )}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {report.is_urgent && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Urgent
                    </span>
                  )}
                  <span className="text-sm font-medium text-white">
                    {reportReason(report.reason)?.label ?? report.reason}
                  </span>
                  <span className="text-xs text-slate-500">{dateFr(report.created_at)}</span>
                </div>

                {report.details && (
                  <p className="whitespace-pre-line text-sm text-slate-300">{report.details}</p>
                )}

                {report.listing_id ? (
                  <div className="flex gap-3">
                    {/* Le contenu affiché ici est l'instantané pris au moment du
                        signalement : le partenaire a pu modifier son profil depuis,
                        et c'est bien ce qui a été signalé que l'admin doit juger. */}
                    {(report.snapshot_cover_url ?? report.listing_cover_url) && (
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg">
                        <Image
                          src={report.snapshot_cover_url ?? report.listing_cover_url!}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-white">
                        {report.snapshot_title ?? report.listing_title}
                      </p>
                      {report.listing_title !== null && report.listing_title !== report.snapshot_title && (
                        <p className="text-xs text-amber-300">Titre actuel : {report.listing_title}</p>
                      )}
                      <p className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        {report.listing_city ? cityLabel(report.listing_city) : ""}
                        {report.listing_suspended_at && (
                          <span className="ml-1 rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-300">Suspendu</span>
                        )}
                      </p>
                      {(report.snapshot_description ?? report.listing_description) && (
                        <p className="line-clamp-3 text-xs text-slate-500">
                          {report.snapshot_description ?? report.listing_description}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Profil supprimé</p>
                )}

                <dl className="space-y-1 text-xs text-slate-400">
                  <div>
                    <dt className="inline text-slate-500">Signalements ouverts sur ce profil : </dt>
                    <dd className="inline">{report.open_reports_on_listing}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Propriétaire : </dt>
                    <dd className="inline">
                      {report.owner_id ? emails.get(report.owner_id) : "—"} · {ownerState(report)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Signalé par : </dt>
                    <dd className="inline">{report.reporter_id ? emails.get(report.reporter_id) : "Compte supprimé"}</dd>
                  </div>
                </dl>
              </div>

              <ReportReview reportId={report.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
