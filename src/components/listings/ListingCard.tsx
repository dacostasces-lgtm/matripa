import Image from "next/image";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";

import { VerifiedBadge, VideoBadge, VipBadge } from "@/components/ui/badges";
import { cx, formatRating, formatXAF, priceUnitLabel } from "@/lib/format";
import { cityLabel, type ListingCardData } from "@/types/listing";

interface ListingCardProps {
  listing: ListingCardData;
  /**
   * À activer sur les premières cartes visibles (LCP) : Next.js préchargera
   * l'image au lieu de l'attendre en lazy-load.
   */
  priority?: boolean;
  /** Rang dans la grille : décale l'animation d'apparition. */
  index?: number;
  className?: string;
}

/**
 * Dégradé de lisibilité. Défini en CSS brut plutôt qu'en utilitaires Tailwind
 * pour maîtriser précisément les points d'arrêt : opacité forte sous le texte,
 * disparition avant le tiers supérieur pour ne pas ternir la photo.
 */
const SCRIM =
  "linear-gradient(to top, rgb(2 6 23 / 0.96) 0%, rgb(2 6 23 / 0.82) 26%, rgb(2 6 23 / 0.24) 55%, transparent 78%)";

/** Voile supérieur : détache les badges flottants d'une photo claire. */
const TOP_SCRIM = "linear-gradient(to bottom, rgb(2 6 23 / 0.55) 0%, transparent 100%)";

export function ListingCard({ listing, priority = false, index = 0, className }: ListingCardProps) {
  const {
    slug,
    title,
    highlight,
    city,
    district,
    price_xaf,
    price_unit,
    cover_url,
    rating,
    is_vip,
    is_verified,
    is_available_now,
    video_url,
  } = listing;

  return (
    <Link
      href={`/annonces/${slug}`}
      // `--i` alimente le décalage de `.rise-in` (globals.css).
      style={{ "--i": index } as React.CSSProperties}
      className={cx(
        "rise-in group relative block rounded-2xl outline-none",
        "focus-visible:ring-2 focus-visible:ring-neon/80 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className,
      )}
    >
      <article
        className={cx(
          "relative aspect-[3/4] overflow-hidden rounded-2xl",
          "border border-white/10 bg-slate-900/60 backdrop-blur-xl",
          "shadow-[0_10px_36px_-16px_rgb(0_0_0/0.95)]",
          "transition duration-500 ease-out",
          "group-hover:-translate-y-1",
          // L'or n'apparaît qu'au survol : la grille au repos reste sobre.
          is_vip ? "group-hover:border-gold/45" : "group-hover:border-white/25",
          "group-hover:shadow-[0_24px_56px_-20px_rgb(0_0_0/1)]",
          "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
        )}
      >
        <Image
          src={cover_url}
          alt={title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 320px"
          className={cx(
            "object-cover transition-transform duration-700 ease-out",
            "group-hover:scale-[1.06] motion-reduce:transform-none",
          )}
        />

        {/* Voiles de lisibilité */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{ background: TOP_SCRIM }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />

        {/* Badges flottants */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-1.5">
            {is_vip && <VipBadge />}
            {is_verified && <VerifiedBadge />}
          </div>
          {video_url && (
            <VideoBadge
              // Sur une carte de grille, l'icône seule suffit : le libellé
              // complet est repris en fiche détail.
              label="4K"
              className="shrink-0"
            />
          )}
        </div>

        {/*
          Bloc informationnel.

          Volontairement compact : sur mobile la carte fait ~175 px de large,
          donc ~233 px de haut. Chaque ligne ajoutée ici remonte le bloc jusqu'à
          percuter les badges flottants — c'est pourquoi la disponibilité est
          une puce en fin de ligne de ville, et non une pastille à part.
        */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
          <h3 className="line-clamp-2 text-balance text-[15px] font-semibold leading-snug text-white drop-shadow-sm">
            {title}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            {rating !== null && (
              <>
                <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden />
                <span className="font-medium text-white">{formatRating(rating)}</span>
                {highlight && (
                  <span aria-hidden className="text-slate-500">
                    •
                  </span>
                )}
              </>
            )}
            {highlight && <span className="truncate">{highlight}</span>}
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {cityLabel(city)}
              {district && <span className="text-slate-500"> · {district}</span>}
            </span>

            {/* Le libellé accompagne toujours le point : seul, il ne
                transmettrait l'information que par la couleur. */}
            {is_available_now && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-300">
                <span aria-hidden className="live-dot size-1.5 rounded-full bg-emerald-400" />
                Dispo.
              </span>
            )}
          </div>

          <div className="mt-1.5 border-t border-white/10 pt-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">À partir de</p>
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-lg font-semibold leading-none tracking-tight text-gold-soft">
                {formatXAF(price_xaf)}
              </span>
              <span className="text-[11px] text-slate-400">/ {priceUnitLabel(price_unit)}</span>
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}

/**
 * Squelette isomorphe à la carte, utilisé pendant le streaming Suspense.
 *
 * La classe `animate-pulse` est le signal attendu par la suite e2e pour savoir
 * que le fil n'est pas encore chargé : elle ne doit apparaître nulle part
 * ailleurs dans l'interface.
 */
export function ListingCardSkeleton() {
  return (
    <div className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex h-full flex-col justify-end gap-2 p-4">
        <div className="h-3.5 w-4/5 rounded-full bg-white/10" />
        <div className="h-3 w-2/5 rounded-full bg-white/[0.07]" />
        <div className="mt-2 h-3.5 w-1/2 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
