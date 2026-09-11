"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, MailCheck } from "lucide-react";

import { requestPasswordReset, updatePassword } from "@/app/actions/auth";
import { INITIAL_AUTH_STATE } from "@/lib/auth-form";
import { cx } from "@/lib/format";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white " +
  "placeholder:text-slate-600 backdrop-blur-md transition " +
  "focus:border-neon/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-neon/30";

/** Demande d'envoi du lien de réinitialisation. */
export function PasswordResetRequestForm() {
  const [state, formAction] = useActionState(requestPasswordReset, INITIAL_AUTH_STATE);

  // Succès volontairement terminal : on n'affiche plus le formulaire, pour ne
  // pas inviter à réessayer et transformer la page en oracle de comptes.
  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-8 text-center">
        <MailCheck className="size-8 text-emerald-400" aria-hidden />
        <p className="text-sm leading-relaxed text-emerald-100">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Feedback state={state} />

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-200">
          Adresse e-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={INPUT} />
      </div>

      <Submit icon={MailCheck} label="Envoyer le lien" />
    </form>
  );
}

/** Saisie du nouveau mot de passe, après ouverture de la session de récupération. */
export function PasswordUpdateForm() {
  const [state, formAction] = useActionState(updatePassword, INITIAL_AUTH_STATE);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Feedback state={state} />

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-200">
          Nouveau mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={INPUT}
        />
        <p className="text-xs text-slate-500">8 caractères minimum.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="password_confirmation" className="text-sm font-medium text-slate-200">
          Confirmation
        </label>
        <input
          id="password_confirmation"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          required
          className={INPUT}
        />
      </div>

      <Submit icon={KeyRound} label="Définir le mot de passe" />
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Feedback({ state }: { state: { status: string; message: string | null } }) {
  if (state.status === "idle" || !state.message) return null;

  const isError = state.status === "error";

  return (
    <p
      role="alert"
      className={cx(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        isError
          ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {state.message}
    </p>
  );
}

function Submit({
  icon: Icon,
  label,
}: {
  icon: typeof KeyRound;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "bg-neon-action text-sm font-semibold text-white",
        "transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {label}
    </button>
  );
}
