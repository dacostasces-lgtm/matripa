import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

/**
 * Gabarit commun aux pages légales.
 *
 * L'encart d'avertissement est délibérément visible : ces textes sont des
 * modèles de départ, pas un conseil juridique. Les laisser en l'état en
 * production reviendrait à afficher des engagements que personne n'a validés.
 */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux profils
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1.5 text-sm text-slate-500">Dernière mise à jour : {updatedAt}</p>

        <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Modèle à faire relire par un conseil juridique avant mise en ligne. Les mentions
            entre crochets doivent être complétées.
          </span>
        </p>

        <div className="legal-prose mt-8 space-y-6">{children}</div>
      </div>
    </main>
  );
}

export function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}
