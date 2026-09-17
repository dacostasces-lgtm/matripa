"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, Eye, Loader2, ShieldX, X } from "lucide-react";

import { getVerificationVideoUrl, reviewVerification } from "@/app/actions/admin";
import { APPROVAL_CHECKS, INITIAL_VERIFICATION_STATE } from "@/lib/verification";
import { ADMIN_REJECT_OPTIONS } from "@/types/verification";

/** Lecteur monté seulement au clic, sur une URL signée de 5 minutes. */
function VerificationVideo({ requestId }: { requestId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    const signed = await getVerificationVideoUrl(requestId);
    setLoading(false);
    if (signed) setUrl(signed);
    else setFailed(true);
  }

  if (url) {
    return <video src={url} controls playsInline className="aspect-[9/16] max-h-96 w-full rounded-xl bg-black object-contain" />;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        Voir la vidéo
      </button>
      {failed && <p className="text-xs text-red-300">Vidéo indisponible. Rechargez la page.</p>}
    </div>
  );
}

export function VerificationReview({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(reviewVerification, INITIAL_VERIFICATION_STATE);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirmMinor, setConfirmMinor] = useState(false);

  const allChecked = APPROVAL_CHECKS.every(({ name }) => checked[name]);

  return (
    <div className="space-y-4">
      <VerificationVideo requestId={requestId} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="request_id" value={requestId} />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Contrôles</legend>
          {APPROVAL_CHECKS.map(({ name, label }) => (
            <label key={name} className="flex items-center gap-2.5 text-sm text-slate-300">
              <input
                type="checkbox"
                name={name}
                checked={Boolean(checked[name])}
                onChange={(event) => setChecked((prev) => ({ ...prev, [name]: event.target.checked }))}
                className="size-4 accent-emerald-400"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={!allChecked || pending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-4" aria-hidden />
          Approuver
        </button>

        <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
          <label htmlFor={`reason-${requestId}`} className="sr-only">
            Motif du rejet
          </label>
          <select
            id={`reason-${requestId}`}
            name="reason"
            defaultValue=""
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white"
          >
            <option value="" disabled className="bg-slate-900">
              Motif du rejet
            </option>
            {ADMIN_REJECT_OPTIONS.map((option) => (
              <option key={option.slug} value={option.slug} className="bg-slate-900">
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor={`note-${requestId}`} className="sr-only">
            Complément
          </label>
          <input
            id={`note-${requestId}`}
            name="note"
            type="text"
            maxLength={300}
            placeholder="Complément (facultatif)"
            // Ce champ partage le formulaire avec le bouton « Approuver » :
            // sans ce garde-fou, Entrée dans ce champ validerait implicitement
            // l'identité au lieu de ne rien faire.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-slate-600"
          />
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-400/30 px-4 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
            Rejeter
          </button>
        </div>

        <div className="border-t border-white/[0.07] pt-4">
          {confirmMinor ? (
            <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-sm text-red-100">
                Toutes les annonces du compte seront archivées et le compte ne pourra plus demander
                de vérification.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="block_minor"
                  disabled={pending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Confirmer le signalement
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMinor(false)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-slate-300 hover:bg-white/[0.06]"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmMinor(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-red-300 transition hover:bg-red-500/10"
            >
              <ShieldX className="size-4" aria-hidden />
              Signaler une personne mineure
            </button>
          )}
        </div>

        {state.status === "error" && state.message && (
          <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
