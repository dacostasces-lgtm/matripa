"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Archive, ShieldX, X } from "lucide-react";

import { reviewReport } from "@/app/actions/reports";
import { INITIAL_REVIEW_REPORT_STATE, MAX_RESOLUTION_NOTE } from "@/lib/reports";

export function ReportReview({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState(reviewReport, INITIAL_REVIEW_REPORT_STATE);
  const [confirmBlock, setConfirmBlock] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="report_id" value={reportId} />

      <div className="space-y-1.5">
        <label htmlFor={`note-${reportId}`} className="text-xs font-medium text-slate-400">
          Note de décision
        </label>
        <input
          id={`note-${reportId}`}
          name="note"
          type="text"
          maxLength={MAX_RESOLUTION_NOTE}
          placeholder="Obligatoire pour retirer le profil"
          // Plusieurs boutons partagent ce formulaire : Entrée soumettrait le
          // premier d'entre eux, sans que la décision ait été choisie.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="dismiss"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
          Signalement infondé
        </button>
        <button
          type="submit"
          name="decision"
          value="remove"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
        >
          <Archive className="size-4" aria-hidden />
          Retirer le profil
        </button>
      </div>

      {confirmBlock ? (
        <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-sm text-red-100">
            Tous les profils du compte seront archivés et suspendus, le compte sera bloqué et sa
            vérification d&apos;identité retirée.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              name="decision"
              value="block_minor"
              disabled={pending}
              className="inline-flex h-9 items-center rounded-lg bg-red-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirmer le blocage
            </button>
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-slate-300 hover:bg-white/[0.06]"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmBlock(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          <ShieldX className="size-4" aria-hidden />
          Personne mineure : bloquer le compte
        </button>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}
    </form>
  );
}
