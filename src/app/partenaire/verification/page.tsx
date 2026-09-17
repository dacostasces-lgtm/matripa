import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Clock, ShieldCheck, ShieldX } from "lucide-react";

import { startVerification } from "@/app/actions/verification";
import { VerificationUpload } from "@/components/verification/VerificationUpload";
import { createClient } from "@/lib/supabase/server";
import { verificationErrorMessage, verificationView, type LatestVerification } from "@/lib/verification";
import { findVerificationUpload } from "@/lib/verification-storage";
import { rejectionReason } from "@/types/verification";
import type { RawSearchParams } from "@/lib/filters";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vérification d'identité" };

type Latest = LatestVerification & {
  id: string;
  challenge_code: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
};

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire/verification");

  // Filtre `user_id` explicite : un administrateur lit toutes les demandes
  // (policies combinées en OU), il ne doit voir ici que la sienne.
  const [{ data: latest }, { data: blocked }] = await Promise.all([
    supabase
      .from("verification_requests")
      .select("id, status, challenge_code, code_expires_at, submitted_at, reviewed_at, rejection_reason, rejection_note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Latest>(),
    supabase.rpc("is_verification_blocked"),
  ]);

  const view = verificationView(latest ?? null, new Date(), blocked === true);
  const erreur = typeof params.erreur === "string" ? verificationErrorMessage(params.erreur) : null;
  const uploadedPath =
    view === "upload" && latest ? await findVerificationUpload(user.id, latest.id) : null;
  const reason = latest?.rejection_reason ? rejectionReason(latest.rejection_reason) : null;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Link
        href="/partenaire"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tableau de bord
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Vérification d&apos;identité</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Obligatoire pour publier un profil. Elle garantit que chaque profil appartient à une
          personne majeure, réelle, qui correspond à ses photos.
        </p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erreur}
        </p>
      )}

      {(view === "start" || view === "rejected" || view === "revoked") && (
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {view === "rejected" && (
            <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {/* Un motif sans texte partenaire (constat de minorité, blocage
                  depuis levé) reçoit une formulation neutre. */}
              {reason?.partner ? (
                <>
                  <p className="font-medium">Votre précédente vidéo n&apos;a pas pu être validée : {reason.label.toLowerCase()}.</p>
                  <p className="mt-1 text-amber-200/80">{reason.partner}</p>
                </>
              ) : (
                <p className="font-medium">Votre précédente vérification n&apos;a pas pu être validée.</p>
              )}
              {latest?.rejection_note && <p className="mt-1 text-amber-200/80">{latest.rejection_note}</p>}
            </div>
          )}
          {view === "revoked" && (
            <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium">Votre vérification a été retirée.</p>
              {latest?.rejection_note && <p className="mt-1 text-amber-200/80">{latest.rejection_note}</p>}
            </div>
          )}

          <ul className="space-y-2 text-sm text-slate-300">
            <li>• Une vidéo de 15 secondes, visage et pièce d&apos;identité visibles.</li>
            <li>• Elle est examinée par une personne de l&apos;équipe Matripa, jamais publiée.</li>
            <li>• Elle est <strong className="text-white">supprimée dès la décision</strong>.</li>
            <li>• Nous ne conservons ni le numéro de votre pièce ni votre date de naissance.</li>
          </ul>

          <form action={startVerification}>
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              <ShieldCheck className="size-4" aria-hidden />
              {view === "start" ? "Commencer" : "Recommencer"}
            </button>
          </form>
        </section>
      )}

      {view === "upload" && latest && (
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Votre code</p>
            <p data-testid="challenge-code" className="font-mono text-4xl font-semibold tracking-[0.3em] text-white">
              {latest.challenge_code}
            </p>
            <p className="text-xs text-slate-500">
              Valable jusqu&apos;à{" "}
              {new Date(latest.code_expires_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          <ol className="space-y-2 text-sm text-slate-300">
            <li>1. Filmez-vous de face, dans un endroit bien éclairé.</li>
            <li>2. Tenez votre pièce d&apos;identité à côté de votre visage, date de naissance lisible.</li>
            <li>3. Prononcez distinctement le code affiché.</li>
            <li>4. 15 secondes suffisent.</li>
          </ol>

          <VerificationUpload userId={user.id} requestId={latest.id} uploadedPath={uploadedPath} />
        </section>
      )}

      {view === "expired" && (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-300">
            Ce code a expiré. Une vidéo doit porter un code récent : demandez-en un nouveau, puis
            filmez à nouveau.
          </p>
          <form action={startVerification}>
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Obtenir un nouveau code
            </button>
          </form>
        </section>
      )}

      {view === "pending" && latest?.submitted_at && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 text-sm text-sky-100">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Vérification en cours d&apos;examen</p>
            <p className="mt-1 text-sky-200/80">Vidéo envoyée le {dateFr(latest.submitted_at)}.</p>
          </div>
        </section>
      )}

      {view === "approved" && latest?.reviewed_at && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <BadgeCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Identité vérifiée</p>
            <p className="mt-1 text-emerald-200/80">
              Validée le {dateFr(latest.reviewed_at)}. Vos profils portent le badge « Certifié ».
            </p>
          </div>
        </section>
      )}

      {view === "blocked" && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
          <ShieldX className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
          <p>La vérification n&apos;est pas disponible pour ce compte. Contactez le support.</p>
        </section>
      )}
    </div>
  );
}
