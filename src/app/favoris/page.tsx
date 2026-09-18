import type { Metadata } from "next";

import { FavoritesList } from "@/components/listings/FavoritesList";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false, follow: false } };

export default function FavorisPage() {
  return (
    <main className="min-h-dvh px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-8 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Mes favoris</h1>
        <FavoritesList />
      </div>
    </main>
  );
}
