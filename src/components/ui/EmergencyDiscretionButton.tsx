"use client";

import { useEffect, useState } from "react";
import { EyeOff, ExternalLink, RefreshCw, ShieldAlert, Sparkles, Building2, Newspaper, Compass } from "lucide-react";

/**
 * Bouton d'Urgence & Mode Incognito ("Bouton Discrétion").
 *
 * Permet à l'utilisateur de masquer instantanément le contenu sensible de l'application
 * (rencontres/annonces privées) au moindre regard indiscret.
 *
 * Déclencheurs :
 *  1. Clic sur le bouton flottant discret "Discrétion"
 *  2. Raccourci clavier : double frappe rapide sur la touche Échap (Escape)
 *
 * Effet :
 *  Affiche un écran leurre crédible et sobre ("Congo Tourisme & Hôtellerie")
 *  avec option de redirection immédiate vers Google ou retour discret.
 */
export function EmergencyDiscretionButton() {
  const [isActive, setIsActive] = useState(false);
  const [lastEscapeTime, setLastEscapeTime] = useState(0);

  // Détection du double-tap sur Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEscapeTime < 500) {
          setIsActive((prev) => !prev);
        }
        setLastEscapeTime(now);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastEscapeTime]);

  const activateDiscretion = () => {
    setIsActive(true);
  };

  const deactivateDiscretion = () => {
    setIsActive(false);
  };

  const exitToExternal = () => {
    // Redirect to a real news site for discreet exit
    window.location.href = "https://news.google.com";
  };

  return (
    <>
      {/*
        Flottant en haut à droite : le bas de l'écran appartient au dock de
        navigation et au bandeau d'action des fiches. Toujours visible au
        défilement — c'est un bouton d'urgence. En z-40, sous les fenêtres
        modales (z-50), pour ne jamais masquer leur bouton de fermeture.
        Les barres collées en haut (filtres de l'accueil, en-tête partenaire)
        réservent sa place à droite.
      */}
      {!isActive && (
        <button
          type="button"
          onClick={activateDiscretion}
          title="Mode Discrétion (ou double appui sur Échap)"
          aria-label="Mode Discrétion immédiate"
          className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-2.5 text-xs font-medium text-slate-400 shadow-lg backdrop-blur-xl transition hover:border-white/25 hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50 active:scale-95 sm:right-4 sm:px-3.5"
        >
          <EyeOff className="size-3.5 text-slate-400" aria-hidden />
          <span className="hidden sm:inline">Discrétion</span>
        </button>
      )}

      {/* Écran leurre : Faux site d'information touristique et hôtelière du Congo */}
      {isActive && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mode Discrétion"
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950 text-slate-100 selection:bg-slate-700"
        >
          {/* Barre supérieure du portail leurre */}
          <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur-md sm:px-6">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-emerald-700/30 text-emerald-400 ring-1 ring-emerald-500/40">
                  <Compass className="size-4" />
                </div>
                <div>
                  <span className="block font-semibold text-sm tracking-wide text-white">
                    Mode Discrétion
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Accès sécurisé et privé
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exitToExternal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  <ExternalLink className="size-3" />
                  News
                </button>
                <button
                  type="button"
                  onClick={deactivateDiscretion}
                  className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
                >
                  Reprendre la session
                </button>
              </div>
            </div>
          </header>

          {/* Contenu sobre du leurre */}
          <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <p className="mt-3 text-sm text-slate-400">
                Vous êtes en mode discrétion. Le contenu a été masqué pour votre confidentialité.
              </p>
            </div>

            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Établissements partenaires répertoriés
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  name: "Grand Hôtel de Brazzaville",
                  loc: "Brazzaville - Centre des affaires",
                  desc: "Chambres d'affaires, salles de conférences et salons de détente.",
                  badge: "Hôtellerie 4*",
                },
                {
                  name: "Résidence Océan Pointe-Noire",
                  loc: "Pointe-Noire - Côte Sauvage",
                  desc: "Vue mer, restauration d'affaires et service de conciergerie 24h/24.",
                  badge: "Résidence hôtelière",
                },
                {
                  name: "Lodge Fluvial du Bassin",
                  loc: "Pool - Nord Brazzaville",
                  desc: "Éco-tourisme et séjours de repos le long du fleuve Congo.",
                  badge: "Éco-Lodge",
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3 text-slate-500" />
                      {item.loc}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-medium text-white">{item.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
