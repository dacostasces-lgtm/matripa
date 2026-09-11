"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

import { submitRequest } from "@/app/actions/requests";
import { INITIAL_REQUEST_STATE } from "@/lib/request-form";
import { cx } from "@/lib/format";

interface RequestFormProps {
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  /** Une demande déposée en invité n'est rattachée à aucun compte : elle ne
   *  peut donc être ni suivie, ni notée ensuite. */
  isAuthenticated: boolean;
}

export function RequestForm({
  listingId,
  listingSlug,
  listingTitle,
  isAuthenticated,
}: RequestFormProps) {
  // React 19 : `useActionState` câble la Server Action et expose son retour.
  const [state, formAction] = useActionState(submitRequest, INITIAL_REQUEST_STATE);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-6 py-12 text-center backdrop-blur-xl">
        <CheckCircle2 className="size-10 text-emerald-400" aria-hidden />
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-white">Demande envoyée</h2>
          <p className="text-sm text-slate-300">{state.message}</p>
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Link
            href={`/annonces/${listingSlug}`}
            className="inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
          >
            Retour au profil
          </Link>
          {isAuthenticated && (
            <Link
              href="/mes-demandes"
              className="inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
            >
              Suivre ma demande
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="listing_slug" value={listingSlug} />

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <Field label="Nom complet" name="full_name" error={state.errors.full_name} required>
        {(props) => <input {...props} type="text" autoComplete="name" maxLength={80} />}
      </Field>

      <Field
        label="Téléphone"
        name="phone"
        error={state.errors.phone}
        hint="WhatsApp de préférence"
        required
      >
        {(props) => (
          <input {...props} type="tel" autoComplete="tel" placeholder="+242 06 123 45 67" />
        )}
      </Field>

      <Field label="E-mail" name="email" error={state.errors.email} hint="Facultatif">
        {(props) => <input {...props} type="email" autoComplete="email" />}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Date souhaitée" name="desired_date" hint="Facultatif">
          {(props) => <input {...props} type="date" className={cx(props.className, "[color-scheme:dark]")} />}
        </Field>

        <Field label="Nombre de personnes" name="guests" error={state.errors.guests} hint="Facultatif">
          {(props) => <input {...props} type="number" min={1} max={200} inputMode="numeric" />}
        </Field>
      </div>

      <Field
        label="Message"
        name="message"
        error={state.errors.message}
        hint="Précisez vos attentes et vos horaires souhaités…"
      >
        {(props) => (
          <textarea
            {...props}
            rows={4}
            maxLength={1000}
            className={cx(props.className, "resize-y")}
            defaultValue={`Bonjour, je souhaite en savoir plus sur « ${listingTitle} ».`}
          />
        )}
      </Field>

      <SubmitButton />

      <p className="text-center text-xs leading-relaxed text-slate-500">
        Vos coordonnées ne sont transmises qu&apos;au profil concerné. Aucun paiement
        n&apos;est prélevé à cette étape.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white " +
  "placeholder:text-slate-600 backdrop-blur-md transition " +
  "focus:border-neon/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-neon/30";

interface RenderProps {
  id: string;
  name: string;
  className: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

/**
 * Le champ est passé en render-prop : le libellé, l'erreur et le câblage ARIA
 * sont mutualisés, tandis que chaque appelant garde la main sur le contrôle
 * (`input`, `textarea`, type, autocomplete…).
 */
function Field({
  label,
  name,
  error,
  hint,
  required = false,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: RenderProps) => React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-200">
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {hint && (
          <span id={hintId} className="text-xs text-slate-500">
            {hint}
          </span>
        )}
      </div>

      {children({
        id,
        name,
        className: cx(INPUT_CLASS, error && "border-red-400/50 focus:ring-neon/40"),
        required,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}

      {error && (
        <p id={errorId} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  // `useFormStatus` doit être appelé dans un composant enfant du <form>.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "bg-action text-sm font-semibold text-slate-950",
        "shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition",
        "hover:brightness-110 active:scale-[0.99]",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
      )}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Envoi en cours…
        </>
      ) : (
        <>
          <Send className="size-4" aria-hidden />
          Envoyer la demande
        </>
      )}
    </button>
  );
}
