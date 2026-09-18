"use client";

import { useEffect } from "react";
import { EyeOff } from "lucide-react";

import { isDoubleTap, panicExit } from "@/lib/panic";

/**
 * Quitte immédiatement Matripa vers une page d'actualité neutre (cf. panicExit).
 *
 * Au premier plan en permanence (z-[100]), fiche, tiroir ou stories ouverts
 * compris : c'est précisément quand un profil est affiché qu'il doit rester
 * accessible. Les fenêtres dont le bouton « Fermer » occupait ce coin l'ont
 * décalé vers la gauche.
 *
 * Raccourci clavier : double appui sur Échap. Le premier appui ferme la
 * fenêtre éventuellement ouverte, le second fait sortir.
 */
export function PanicButton() {
  useEffect(() => {
    let lastEscape: number | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const now = event.timeStamp;
      if (isDoubleTap(lastEscape, now)) panicExit();
      lastEscape = now;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <button
      type="button"
      onClick={() => panicExit()}
      title="Quitter immédiatement (ou double appui sur Échap)"
      aria-label="Quitter immédiatement vers les actualités"
      className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-2.5 text-xs font-medium text-slate-300 shadow-lg backdrop-blur-xl transition hover:border-gold/40 hover:text-gold-soft focus:outline-none focus:ring-2 focus:ring-neon/70 active:scale-95 sm:right-4 sm:px-3.5"
    >
      <EyeOff className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Quitter</span>
    </button>
  );
}
