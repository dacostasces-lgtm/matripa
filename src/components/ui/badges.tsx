import { BadgeCheck, Crown, Video } from "lucide-react";

import { cx } from "@/lib/format";

type BadgeSize = "sm" | "md";

/**
 * `whitespace-nowrap` n'est pas cosmétique : sur une grille à deux colonnes en
 * 390 px, une carte fait ~175 px de large et « VIP Gold » se replierait sur
 * deux lignes, décalant tous les badges en dessous.
 */
const sizes: Record<BadgeSize, string> = {
  sm: "h-6 gap-1 whitespace-nowrap px-2 text-[10px]",
  md: "h-7 gap-1.5 whitespace-nowrap px-2.5 text-xs",
};

const icon: Record<BadgeSize, string> = {
  sm: "size-3",
  md: "size-3.5",
};

/**
 * Statut vedette. Le seul élément de l'interface autorisé à porter de l'or
 * plein : c'est ce qui lui garde sa valeur de signal.
 *
 * Le halo `shadow` et le balayage `.shine` (globals.css) produisent l'effet
 * métal sans image ni animation coûteuse en layout.
 */
export function VipBadge({ size = "sm", className }: { size?: BadgeSize; className?: string }) {
  return (
    <span
      className={cx(
        "shine relative inline-flex select-none items-center overflow-hidden rounded-full",
        // Texte sombre sur or : le blanc sur or ne passe pas le contraste AA.
        "font-semibold uppercase tracking-[0.1em] text-slate-950",
        "shadow-[0_2px_16px_-2px_rgb(233_200_119/0.55)] ring-1 ring-gold-soft/60",
        sizes[size],
        className,
      )}
      style={{ background: "var(--grad-gold)" }}
    >
      <Crown className={cx(icon[size], "shrink-0")} aria-hidden />
      VIP Gold
    </span>
  );
}

/** Compte contrôlé par l'équipe Matripa (identité + lieu vérifiés). */
export function VerifiedBadge({
  size = "sm",
  label = "Certifié",
  className,
}: {
  size?: BadgeSize;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex select-none items-center rounded-full",
        "border border-white/15 bg-slate-950/55 font-medium text-white backdrop-blur-md",
        sizes[size],
        className,
      )}
    >
      <BadgeCheck className={cx(icon[size], "shrink-0 text-emerald-400")} aria-hidden />
      {label}
    </span>
  );
}

/** Signale qu'un aperçu vidéo est joint à l'offre. */
export function VideoBadge({
  size = "sm",
  label = "Vidéo 4K",
  className,
}: {
  size?: BadgeSize;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex select-none items-center rounded-full",
        "border border-neon/30 bg-slate-950/55 font-medium text-neon-soft backdrop-blur-md",
        sizes[size],
        className,
      )}
    >
      <Video className={cx(icon[size], "shrink-0")} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Pastille de disponibilité. Le point est décoratif — le libellé porte seul
 * l'information, pour ne pas dépendre de la couleur.
 */
export function AvailableNowPill({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex select-none items-center gap-1.5 rounded-full",
        "border border-emerald-400/25 bg-emerald-500/10 text-emerald-300 backdrop-blur-md",
        compact ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-xs",
        "font-medium",
        className,
      )}
    >
      <span className="live-dot size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      {compact ? "Disponible" : "Disponible immédiatement"}
    </span>
  );
}

/** Puce neutre en verre dépoli, réutilisée pour les attributs de la fiche. */
export function GlassTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05]",
        "px-3 py-1.5 text-sm text-slate-300 backdrop-blur-md",
        className,
      )}
    >
      {children}
    </span>
  );
}
