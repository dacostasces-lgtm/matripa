import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import type { RawSearchParams } from "@/lib/filters";

export const metadata: Metadata = {
  title: "Signalement transmis",
  robots: { index: false, follow: false },
};

export default async function ReportThanksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { urgent } = await searchParams;

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-4 py-8 sm:px-6">
        {/*
         * Confirmation sur sa propre route, distincte de `/signaler/[slug]` :
         * un signalement urgent suspend immédiatement le profil concerné, et
         * la politique RLS `listings_public_read` masque alors ce profil à la
         * lecture publique. Si la confirmation restait affichée sur
         * `/signaler/[slug]`, le rafraîchissement de route que Next.js
         * déclenche après toute Server Action re-exécuterait la page et
         * tomberait sur un `notFound()` — le signaleur ne verrait jamais son
         * propre message de confirmation.
         */}
        <div
          role="status"
          className="flex w-full flex-col items-center gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-6 py-12 text-center"
        >
          <CheckCircle2 className="size-10 text-emerald-400" aria-hidden />
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-white">Signalement transmis</h2>
            <p className="text-sm text-slate-300">
              Merci. Votre signalement a été transmis à l&apos;équipe Matripa.
            </p>
            {urgent === "1" && (
              <p className="text-sm font-medium text-amber-200">
                Si une personne est en danger immédiat, contactez sans attendre la police ou les
                services d&apos;urgence.
              </p>
            )}
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
          >
            Retour aux profils
          </Link>
        </div>
      </div>
    </main>
  );
}
