"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Enregistre le service worker et propose la mise à jour lorsqu'une nouvelle
 * version est en attente. L'enregistrement est volontairement limité à la
 * production : en développement, un SW actif sert des assets périmés et rend
 * le hot reload trompeur.
 */
export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;

        // Une version est déjà prête à prendre la main.
        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // `controller` non nul ⇒ il ne s'agit pas de la première install.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      } catch (error) {
        console.error("[pwa] service worker registration failed", error);
      }
    };

    void register();

    // Le nouveau SW a pris le contrôle : on recharge pour servir la version à jour.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6">
      <p className="text-sm font-medium text-white">Nouvelle version disponible</p>
      <p className="mt-1 text-xs text-slate-400">
        Rechargez pour bénéficier des dernières offres et corrections.
      </p>

      <button
        type="button"
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Mettre à jour
      </button>
    </div>
  );
}
