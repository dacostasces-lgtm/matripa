import Link from "next/link";
import { LogOut, Plus, Sparkles } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Espace partenaire",
  robots: { index: false, follow: false },
};

export default async function PartenaireLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Le middleware a déjà redirigé les visiteurs non authentifiés ; on relit
  // l'utilisateur ici uniquement pour afficher son adresse.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        {/* Réserve à droite pour le bouton Discrétion, qui flotte en haut à droite. */}
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 py-3 pl-4 pr-14 sm:pl-6 sm:pr-36">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="size-4 text-amber-300" aria-hidden />
            Matripa
          </Link>

          <span aria-hidden className="text-slate-700">/</span>
          <span className="text-sm text-slate-400">Espace partenaire</span>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/partenaire/annonces/nouvelle"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-action px-3.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Nouveau profil</span>
            </Link>

            <Link
              href="/mes-demandes"
              className="hidden h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white sm:inline-flex"
            >
              Mes demandes
            </Link>

            <form action={signOut}>
              <button
                type="submit"
                title={user?.email ?? undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
