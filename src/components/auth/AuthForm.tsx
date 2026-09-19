"use client";

import Link from "next/link";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, LogIn, UserPlus } from "lucide-react";

import { signIn, signUp } from "@/app/actions/auth";
import { SocialLogin } from "@/components/auth/SocialLogin";
import type { AuthProvider } from "@/lib/auth-providers";
import { INITIAL_AUTH_STATE } from "@/lib/auth-form";
import { cx } from "@/lib/format";

type Mode = "connexion" | "inscription";

export function AuthForm({ next, providers = [] }: { next: string; providers?: AuthProvider[] }) {
  const [mode, setMode] = useState<Mode>("connexion");
  const action = mode === "connexion" ? signIn : signUp;
  const [state, formAction] = useActionState(action, INITIAL_AUTH_STATE);

  return (
    <div className="mt-6 space-y-5">
      <SocialLogin providers={providers} next={next} />

      <div
        role="tablist"
        aria-label="Mode d'authentification"
        className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
      >
        {(["connexion", "inscription"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cx(
              "h-9 rounded-lg text-sm font-medium capitalize transition",
              mode === value
                ? "bg-white text-slate-950"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {/* La clé remonte le formulaire au changement d'onglet : l'état de
          l'action précédente ne doit pas rester affiché. */}
      <form key={mode} action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="suivant" value={next} />

        {state.status !== "idle" && state.message && (
          <p
            role="alert"
            className={cx(
              "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
              state.status === "error"
                ? "border-red-400/30 bg-red-500/10 text-red-200"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
            )}
          >
            {state.status === "error" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {state.message}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-200">
            Adresse e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={INPUT}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "connexion" ? "current-password" : "new-password"}
            required
            minLength={mode === "inscription" ? 8 : undefined}
            className={INPUT}
          />
          {mode === "inscription" ? (
            <p className="text-xs text-slate-500">8 caractères minimum.</p>
          ) : (
            <p className="text-right">
              <Link
                href="/mot-de-passe-oublie"
                className="text-xs text-slate-400 underline-offset-2 transition hover:text-white hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </p>
          )}
        </div>

        <SubmitButton mode={mode} />
      </form>
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white " +
  "placeholder:text-slate-600 backdrop-blur-md transition " +
  "focus:border-neon/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-neon/30";

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  const Icon = mode === "connexion" ? LogIn : UserPlus;

  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "bg-action text-sm font-semibold text-slate-950",
        "shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {mode === "connexion" ? "Se connecter" : "Créer mon compte"}
    </button>
  );
}
