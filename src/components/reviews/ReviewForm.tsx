"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Send, Star } from "lucide-react";

import { submitReview } from "@/app/actions/reviews";
import { INITIAL_REVIEW_STATE } from "@/lib/review-form";
import { cx } from "@/lib/format";

export function ReviewForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState(submitReview, INITIAL_REVIEW_STATE);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);

  if (state.status === "success") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="rating" value={rating} />

      <p className="text-sm font-medium text-zinc-200">Noter cette prestation</p>

      {state.status === "error" && state.message && (
        <p role="alert" className="flex items-start gap-2 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      {/* Boutons radio déguisés : chaque étoile reste atteignable au clavier
          et annonce sa valeur, ce qu'un simple onMouseOver ne ferait pas. */}
      <div
        role="radiogroup"
        aria-label="Note sur cinq"
        className="flex gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHovered(value)}
            className="rounded p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
          >
            <Star
              className={cx(
                "size-6 transition",
                value <= (hovered || rating)
                  ? "fill-amber-300 text-amber-300"
                  : "text-zinc-600",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>

      <label htmlFor={`comment-${requestId}`} className="sr-only">
        Commentaire
      </label>
      <textarea
        id={`comment-${requestId}`}
        name="comment"
        rows={3}
        maxLength={1000}
        placeholder="Comment s'est passée la prestation ? (facultatif)"
        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-zinc-600 transition focus:border-rose-400/50 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
      />

      <SubmitButton disabled={rating === 0} />
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5",
        "bg-gradient-to-r from-rose-500 to-violet-600 text-sm font-semibold text-white",
        "transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Send className="size-4" aria-hidden />
      )}
      Publier mon avis
    </button>
  );
}
