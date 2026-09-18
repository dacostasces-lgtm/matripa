"use client";

import { EyeOff } from "lucide-react";

/** Quitte immédiatement Matripa vers une page d'actualité neutre. */
export function PanicButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "https://news.google.com";
      }}
      title="Quitter immédiatement"
      aria-label="Quitter immédiatement vers les actualités"
      className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-2.5 text-xs font-medium text-slate-300 shadow-lg backdrop-blur-xl transition hover:border-gold/40 hover:text-gold-soft focus:outline-none focus:ring-2 focus:ring-neon/70 active:scale-95 sm:right-4 sm:px-3.5"
    >
      <EyeOff className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Quitter</span>
    </button>
  );
}
