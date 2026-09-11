import Link from "next/link";
import type { Metadata } from "next";

import { PasswordUpdateForm } from "@/components/auth/PasswordForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
};

/**
 * Atteinte via `/auth/callback`, qui a déjà échangé le code du courriel contre
 * une session. Sans session, le lien est expiré ou déjà consommé : on le dit
 * plutôt que d'afficher un formulaire qui échouerait à la soumission.
 */
export default async function MotDePassePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Nouveau mot de passe</h1>

        {user ? (
          <>
            <p className="mb-6 mt-1.5 text-sm leading-relaxed text-slate-400">
              Choisissez un nouveau mot de passe pour {user.email}.
            </p>
            <PasswordUpdateForm />
          </>
        ) : (
          <>
            <p className="mb-6 mt-1.5 text-sm leading-relaxed text-slate-400">
              Ce lien est expiré ou a déjà été utilisé. Les liens de réinitialisation ne servent
              qu&apos;une fois.
            </p>
            <Link
              href="/mot-de-passe-oublie"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-neon-action text-sm font-semibold text-white transition hover:brightness-110"
            >
              Demander un nouveau lien
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
