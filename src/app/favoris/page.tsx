import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false, follow: false } };

export default function FavorisPage() {
  return (
    <main className="min-h-dvh px-4 py-10 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
        <Heart className="mx-auto size-9 text-neon" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold text-white">Mes favoris</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">Ajoutez des profils depuis les annonces pour les retrouver rapidement.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-xl bg-action px-4 text-sm font-semibold text-slate-950">Découvrir les annonces</Link>
      </section>
    </main>
  );
}
