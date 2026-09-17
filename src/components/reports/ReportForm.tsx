"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Flag, Loader2 } from "lucide-react";

import { submitReport } from "@/app/actions/reports";
import { INITIAL_REPORT_STATE, MAX_REPORT_DETAILS } from "@/lib/reports";
import { REPORT_REASONS } from "@/types/reports";

export function ReportForm({ listingId, listingSlug }: { listingId: string; listingSlug: string }) {
  const [state, formAction] = useActionState(submitReport, INITIAL_REPORT_STATE);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="slug" value={listingSlug} />

      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-sm font-medium text-slate-200">Motif du signalement</legend>
        {REPORT_REASONS.map((reason) => (
          <label
            key={reason.slug}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition hover:bg-white/[0.06]"
          >
            <input type="radio" name="reason" value={reason.slug} required className="mt-1 size-4 accent-rose-500" />
            <span className="text-sm text-slate-200">
              {reason.label}
              <span className="mt-0.5 block text-xs text-slate-500">{reason.help}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-amber-200/80">
          Pour une personne mineure présumée ou une contrainte, le profil est masqué immédiatement,
          par précaution, pendant l&apos;examen.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="details" className="text-sm font-medium text-slate-200">
          Précisions
        </label>
        <textarea
          id="details"
          name="details"
          rows={4}
          maxLength={MAX_REPORT_DETAILS}
          placeholder="Ce qui vous alerte (obligatoire pour « Autre »)"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
        />
      </div>

      <p className="text-xs text-slate-500">
        Chaque signalement est enregistré avec votre compte. Les signalements abusifs sont tracés.
      </p>

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-500 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}
      Envoyer le signalement
    </button>
  );
}
