import Link from "next/link";
import { ArrowRight, Clock, ShieldAlert } from "lucide-react";

const dateFr = (date: Date) =>
  date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** Affiché sur le tableau de bord tant que le compte n'est pas vérifié. */
export function VerificationBanner({
  pending,
  grace,
}: {
  pending: boolean;
  grace: { deadline: Date; count: number } | null;
}) {
  const Icon = pending ? Clock : ShieldAlert;

  const message = pending
    ? "Vérification en cours d'examen."
    : grace
      ? `Vos ${grace.count} profil${grace.count > 1 ? "s" : ""} en ligne ser${grace.count > 1 ? "ont" : "a"} masqué${grace.count > 1 ? "s" : ""} le ${dateFr(grace.deadline)} sans vérification d'identité.`
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
