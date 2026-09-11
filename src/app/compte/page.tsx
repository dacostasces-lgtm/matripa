import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Download, Inbox, KeyRound, Store } from "lucide-react";

import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

export default async function ComptePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/compte");

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Mon compte</h1>
        <p className="mt-1.5 text-sm text-slate-400">{user.email}</p>

        <nav className="mt-8 grid gap-3 sm:grid-cols-2">
          <Shortcut href="/mes-demandes" icon={Inbox} label="Mes demandes" hint="Suivi et avis" />
          <Shortcut href="/partenaire" icon={Store} label="Mes annonces" hint="Mes profils" />
        </nav>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-white">Sécurité</h2>
          <Link
            href="/mot-de-passe-oublie"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:bg-white/[0.09] hover:text-white"
          >
            <KeyRound className="size-4" aria-hidden />
            Changer mon mot de passe
          </Link>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-white">Mes données</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Téléchargez l&apos;ensemble des données rattachées à votre compte : demandes, avis et
            offres publiées.
          </p>
          {/* Lien natif et non `next/link` : la route renvoie un fichier en
              pièce jointe, une navigation client l'intercepterait. */}
          <a
            href="/api/mon-compte/export"
            download
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:bg-white/[0.09] hover:text-white"
          >
            <Download className="size-4" aria-hidden />
            Exporter mes données (JSON)
          </a>
        </section>

        <section className="mt-10 space-y-3 border-t border-white/[0.07] pt-8">
          <h2 className="text-lg font-semibold text-white">Supprimer mon compte</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Cette action est irréversible. Vos offres publiées et vos avis sont supprimés ; la
            note des annonces concernées est recalculée. Les demandes que vous avez envoyées sont
            conservées par les partenaires, mais détachées de votre identité.
          </p>
          <DeleteAccountForm email={user.email ?? ""} />
        </section>
      </div>
    </main>
  );
}

function Shortcut({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: typeof Inbox;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.06]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
        <Icon className="size-4 text-slate-300" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </Link>
  );
}
