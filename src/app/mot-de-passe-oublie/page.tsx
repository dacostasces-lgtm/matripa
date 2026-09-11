import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { PasswordResetRequestForm } from "@/components/auth/PasswordForm";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function MotDePasseOubliePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md">
        <Link
          href="/connexion"
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la connexion
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Mot de passe oublié</h1>
          <p className="mb-6 mt-1.5 text-sm leading-relaxed text-slate-400">
            Indiquez l&apos;adresse de votre compte : nous vous enverrons un lien pour définir un
            nouveau mot de passe.
          </p>

          <PasswordResetRequestForm />
        </div>
      </div>
    </main>
  );
}
