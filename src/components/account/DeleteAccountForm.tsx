"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

import { deleteMyAccount } from "@/app/actions/account";
import { INITIAL_AUTH_STATE } from "@/lib/auth-form";
import { cx } from "@/lib/format";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(deleteMyAccount, INITIAL_AUTH_STATE);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-400/30 px-4 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
      >
        <Trash2 className="size-4" aria-hidden />
        Supprimer mon compte
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-rose-400/30 bg-rose-500/[0.07] p-4">
      {state.status === "error" && state.message && (
        <p role="alert" className="flex items-start gap-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="confirmation" className="text-sm font-medium text-white">
          Saisissez <span className="font-mono text-rose-200">{email}</span> pour confirmer
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white transition focus:border-rose-400/50 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <ConfirmButton disabled={typed.trim().toLowerCase() !== email.toLowerCase()} />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="inline-flex h-10 items-center rounded-xl px-4 text-sm text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function ConfirmButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(
        "inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white",
        "transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      Supprimer définitivement
    </button>
  );
}
