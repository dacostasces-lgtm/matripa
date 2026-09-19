"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AGE_GATE_KEY, isAgeGateExempt } from "@/lib/age-gate";
import { panicExit } from "@/lib/panic";

/**
 * Écran de confirmation de majorité (cf. lib/age-gate).
 *
 * Rendu dès le serveur et opaque : tant que l'âge n'est pas confirmé, rien du
 * catalogue n'est visible. Pour un visiteur déjà confirmé, le script du
 * <head> et la règle `html[data-majeur="1"] [data-age-gate]` de globals.css
 * le masquent avant le premier affichage.
 */
export function AgeGate() {
  const pathname = usePathname();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(AGE_GATE_KEY) === "1") setConfirmed(true);
    } catch {
      // Stockage indisponible : l'écran reste, la confirmation vaudra pour la visite.
    }
  }, []);

  const open = !confirmed && !isAgeGateExempt(pathname);

  // Bloque le défilement de la page derrière l'écran — sauf si le script du
  // <head> a déjà établi que l'âge était confirmé (l'écran est alors masqué).
  useEffect(() => {
    if (!open || document.documentElement.dataset.majeur === "1") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const confirm = () => {
    try {
      window.localStorage.setItem(AGE_GATE_KEY, "1");
    } catch {
      // Sans stockage, l'accès vaut pour cette visite uniquement.
    }
    document.documentElement.dataset.majeur = "1";
    setConfirmed(true);
  };

  return (
    <div
      data-age-gate
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      aria-describedby="age-gate-text"
      className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-surface px-5 py-10"
    >
      <div className="w-full max-w-md text-center">
        <p className="font-display text-2xl font-semibold tracking-wide text-gold-soft">Matripa</p>

        <h1 id="age-gate-title" className="mt-8 font-display text-4xl font-semibold leading-tight text-white">
          Réservé aux adultes
        </h1>
        <p id="age-gate-text" className="mt-4 text-pretty text-sm leading-relaxed text-slate-300">
          Ce site présente des annonces de rencontres, de massages et d&apos;accompagnement destinées aux
          personnes majeures. En entrant, vous confirmez avoir au moins 18&nbsp;ans et acceptez les
          conditions d&apos;utilisation.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            autoFocus
            onClick={confirm}
            className="h-12 w-full rounded-xl bg-action px-5 text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-10px_rgb(233_200_119/0.6)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            J&apos;ai 18 ans ou plus, entrer
          </button>
          <button
            type="button"
            onClick={() => panicExit()}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
          >
            Quitter
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          <Link href="/cgu" className="underline-offset-2 hover:text-slate-300 hover:underline">
            Conditions d&apos;utilisation
          </Link>
          <span aria-hidden className="mx-2">·</span>
          <Link href="/confidentialite" className="underline-offset-2 hover:text-slate-300 hover:underline">
            Confidentialité
          </Link>
        </p>
      </div>
    </div>
  );
}
