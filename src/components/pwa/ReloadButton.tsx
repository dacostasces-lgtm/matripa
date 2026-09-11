"use client";

import { RotateCcw } from "lucide-react";

export function ReloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110"
    >
      <RotateCcw className="size-4" aria-hidden />
      Réessayer
    </button>
  );
}
