"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { reportError } from "@/lib/report-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "app");
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/20">
          <TriangleAlert className="size-7 text-amber-300" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Une erreur est survenue
          </h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Le chargement a échoué. Réessayez — si le problème persiste, revenez dans quelques
            minutes.
          </p>
          {error.digest && (
            <p className="pt-1 font-mono text-xs text-slate-600">Référence : {error.digest}</p>
          )}
        </div>

        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110"
        >
          <RotateCcw className="size-4" aria-hidden />
          Réessayer
        </button>
      </div>
    </main>
  );
}
