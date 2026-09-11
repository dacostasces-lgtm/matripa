"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, Smartphone } from "lucide-react";

import { startPayment } from "@/app/actions/payments";
import { INITIAL_PAYMENT_STATE } from "@/lib/payment-form";
import { cx, formatXAF } from "@/lib/format";

const PROVIDERS = [
  { value: "MTN_MOMO_COG", label: "MTN MoMo" },
  { value: "AIRTEL_COG", label: "Airtel Money" },
] as const;

export function PaymentForm({
  requestId,
  amountXaf,
}: {
  requestId: string;
  amountXaf: number;
}) {
  const [state, formAction] = useActionState(startPayment, INITIAL_PAYMENT_STATE);
  const [provider, setProvider] = useState<string>("");

  if (state.status === "processing") {
    return (
      <p className="flex items-start gap-2.5 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <input type="hidden" name="request_id" value={requestId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">Régler par mobile money</p>
        {/* Le montant est affiché mais jamais soumis : le serveur le relit sur
            l'annonce, seul moyen d'empêcher un montant choisi par le payeur. */}
        <p className="text-sm font-semibold text-white">{formatXAF(amountXaf)}</p>
      </div>

      {state.status === "error" && state.message && (
        <p role="alert" className="flex items-start gap-2 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Opérateur</legend>
        {PROVIDERS.map((option) => (
          <label
            key={option.value}
            className={cx(
              "cursor-pointer rounded-xl border px-3.5 py-2 text-sm transition",
              provider === option.value
                ? "border-transparent bg-neon-action font-medium text-white"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.09]",
            )}
          >
            <input
              type="radio"
              name="provider"
              value={option.value}
              checked={provider === option.value}
              onChange={(event) => setProvider(event.target.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`phone-${requestId}`} className="sr-only">
          Numéro mobile money
        </label>
        <input
          id={`phone-${requestId}`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="06 123 45 67"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 transition focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/30"
        />
      </div>

      <SubmitButton disabled={!provider} />

      <p className="text-xs leading-relaxed text-slate-500">
        Vous recevrez une demande de confirmation sur votre téléphone. Aucun montant
        n&apos;est débité avant votre validation.
      </p>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl",
        "bg-neon-action text-sm font-semibold text-white transition hover:brightness-110",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Smartphone className="size-4" aria-hidden />
      )}
      Payer maintenant
    </button>
  );
}
