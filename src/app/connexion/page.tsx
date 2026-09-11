import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { AuthForm } from "@/components/auth/AuthForm";
import type { RawSearchParams } from "@/lib/filters";

export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const next = typeof params.suivant === "string" ? params.suivant : "/partenaire";

  // Messages posés par `/auth/callback` quand l'échange du code échoue. Sans
  // cela, l'utilisateur revenant d'un lien périmé atterrit sur un formulaire
  // muet et ne comprend pas pourquoi.
  const ERREURS: Record<string, string> = {
    lien_invalide: "Ce lien est incomplet. Demandez-en un nouveau.",
    lien_expire: "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.",
  };
  const erreur = typeof params.erreur === "string" ? ERREURS[params.erreur] : undefined;

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-10 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] opacity-60"
        style={{
          background:
            "radial-gradient(55% 60% at 30% 0%, rgb(190 24 93 / 0.25) 0%, transparent 70%), radial-gradient(45% 55% at 80% 8%, rgb(109 40 217 / 0.22) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux profils
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Compte Matripa</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Suivez vos demandes et vos avis. Si vous publiez un profil, gérez-le depuis le même compte.
          </p>

          {erreur && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {erreur}{" "}
                <Link href="/mot-de-passe-oublie" className="underline underline-offset-2">
                  Renvoyer un lien
                </Link>
              </span>
            </p>
          )}

          <AuthForm next={next} />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          La certification « Vérifié » et la mise en avant VIP sont attribuées par l&apos;équipe
          Matripa après contrôle. Elles ne sont pas modifiables depuis cet espace.
        </p>
      </div>
    </main>
  );
}
