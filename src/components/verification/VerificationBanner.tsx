import Link from "next/link";
import { ArrowRight, Clock, ShieldAlert } from "lucide-react";

const dateFr = (date: Date) =>
  date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** Accord singulier/pluriel du message de délai de grâce. */
function graceMessage(grace: { deadline: Date; count: number }): string {
  const date = dateFr(grace.deadline);
  if (grace.count === 1) {
    return `Votre profil en ligne sera masqué le ${date} sans vérification d'identité.`;
  }
  return `Vos ${grace.count} profils en ligne seront masqués le ${date} sans vérification d'identité.`;
}

/** Accord singulier/pluriel du message de profils déjà masqués. */
function hiddenMessage(count: number): string {
  if (count === 1) {
    return "Votre profil est masqué du catalogue : vérifiez votre identité pour le remettre en ligne.";
  }
  return `Vos ${count} profils sont masqués du catalogue : vérifiez votre identité pour les remettre en ligne.`;
}

/**
 * Affiché sur le tableau de bord tant que le compte n'est pas vérifié.
 * Priorité : examen en cours, puis échéance de grâce à venir, puis profils
 * déjà masqués, puis invitation générale.
 */
export function VerificationBanner({
  pending,
  grace,
  hiddenCount,
}: {
  pending: boolean;
  grace: { deadline: Date; count: number } | null;
  hiddenCount: number;
}) {
  const Icon = pending ? Clock : ShieldAlert;

  const message = pending
    ? "Vérification en cours d'examen."
    : grace
      ? graceMessage(grace)
      : hiddenCount > 0
        ? hiddenMessage(hiddenCount)
        : "Vérifiez votre identité pour publier.";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{message}</p>
      <Link
        href="/partenaire/verification"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300/40 px-3 text-xs font-medium text-amber-50 transition hover:bg-amber-500/20"
      >
        {pending ? "Voir le suivi" : "Vérifier mon identité"}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
