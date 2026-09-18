"use client";

import { type KeyboardEvent, type MouseEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, MapPin, MessageCircle, Star } from "lucide-react";

import { useFavorites } from "@/components/listings/useFavorites";
import { BoostBadge, VerifiedBadge, VideoBadge, VipBadge } from "@/components/ui/badges";
import { cx, formatRating, formatXAF, priceUnitLabel } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";
import { cityLabel, type ListingCardData } from "@/types/listing";

interface ListingCardProps {
  listing: ListingCardData;
  priority?: boolean;
  index?: number;
  className?: string;
  /** Sans callback, la carte conserve sa navigation vers la fiche dédiée. */
  onOpen?: (listing: ListingCardData) => void;
}

const SCRIM = "linear-gradient(to top, rgb(2 6 23 / 0.96) 0%, rgb(2 6 23 / 0.82) 26%, rgb(2 6 23 / 0.24) 55%, transparent 78%)";
const TOP_SCRIM = "linear-gradient(to bottom, rgb(2 6 23 / 0.55) 0%, transparent 100%)";

/** The entire card opens the detail page; overlay actions stop that click explicitly. */
export function ListingCard({
  listing,
  priority = false,
  index = 0,
  className,
  onOpen,
}: ListingCardProps) {
  const router = useRouter();
  const favorites = useFavorites();
  const isFavorite = favorites.isFavorite(listing.id);
  const { slug, title, highlight, city, district, price_xaf, price_unit, cover_url, rating, is_vip, is_verified, is_available_now, video_url, whatsapp_phone, boosted_until } = listing;
  const isBoosted = boosted_until ? new Date(boosted_until).getTime() > Date.now() : false;
  // `null` sans numéro renseigné : le bouton disparaît plutôt que d'écrire à un inconnu.
  const whatsappHref = whatsAppLink(
    whatsapp_phone,
    `Bonjour, je vous contacte depuis Matripa au sujet de votre annonce "${title}" à ${cityLabel(city)}. Êtes-vous disponible prochainement ?`,
  );
  const openDetail = () => {
    if (onOpen) {
      onOpen(listing);
      return;
    }
    router.push(`/annonces/${slug}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Seulement si la carte elle-même a le focus : Entrée sur le cœur ou sur
    // WhatsApp doit actionner ce bouton, pas ouvrir la fiche.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };
  const stopCardClick = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Voir le profil de ${title}`}
      onClick={openDetail}
      onKeyDown={onKeyDown}
      style={{ "--i": index } as React.CSSProperties}
      className={cx("rise-in group relative flex cursor-pointer flex-col rounded-2xl outline-none", "focus-visible:ring-2 focus-visible:ring-neon/80 focus-visible:ring-offset-2 focus-visible:ring-offset-surface", className)}
    >
      {/*
        Badges et texte se *suivent* dans le cadre au lieu de se superposer :
        sur un téléphone étroit, le texte du bas remontait sous les badges.
        Le cadre garde son 3/4 quand tout tient et s'allonge sinon — ce qui
        suppose qu'il ne rogne pas lui-même (`overflow-hidden` annulerait sa
        hauteur minimale automatique) : la photo est rognée par sa propre couche.
        `grow` aligne la hauteur des cartes d'une même rangée.
      */}
      <div className={cx("relative flex aspect-[3/4] grow flex-col justify-between rounded-2xl bg-slate-900/60 backdrop-blur-xl transition duration-500 ease-out", isBoosted ? "border-2 border-neon/70 shadow-[0_0_30px_-6px_rgb(255_61_129/0.6)] group-hover:border-neon" : "border border-white/10 shadow-[0_10px_36px_-16px_rgb(0_0_0/0.95)]", "group-hover:-translate-y-1", is_vip ? "group-hover:border-gold/45" : "group-hover:border-white/25", "group-hover:shadow-[0_24px_56px_-20px_rgb(0_0_0/1)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0")}>
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <Image src={cover_url} alt={title} fill priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 320px" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transform-none" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28" style={{ background: TOP_SCRIM }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
        </div>

        <div data-card-badges className="relative flex items-start justify-between gap-2 px-3 pt-3">
          <div className="flex flex-col items-start gap-1.5">
            {isBoosted && <BoostBadge />}
            {is_vip && <VipBadge />}
            {is_verified && <VerifiedBadge />}
          </div>
          <div className="flex items-start gap-1.5">
            {video_url && <VideoBadge label="4K" className="shrink-0" />}
            <button type="button" onClick={(event) => { stopCardClick(event); favorites.toggle(listing.id); }} aria-label={isFavorite ? `Retirer ${title} des favoris` : `Ajouter ${title} aux favoris`} aria-pressed={isFavorite} className={cx("grid size-9 place-items-center rounded-full border backdrop-blur-md transition active:scale-95", isFavorite ? "border-neon/70 bg-neon/20 text-neon shadow-[0_0_14px_rgb(255_61_129/0.55)]" : "border-white/15 bg-slate-950/50 text-white hover:border-gold/50 hover:text-gold-soft")}>
              <Heart className={cx("size-4", isFavorite && "fill-current")} aria-hidden />
            </button>
          </div>
        </div>

        <div data-card-body className={cx("relative flex flex-col gap-1.5 p-4", whatsappHref && "pr-14")}>
          <h3 className="line-clamp-2 text-balance text-[15px] font-semibold leading-snug text-white drop-shadow-sm">{title}</h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            {rating !== null && <><Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden /><span className="font-medium text-white">{formatRating(rating)}</span>{highlight && <span aria-hidden className="text-slate-500">•</span>}</>}
            {highlight && <span className="truncate">{highlight}</span>}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{cityLabel(city)}{district && <span className="text-slate-500"> · {district}</span>}</span>
            {is_available_now && <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-300"><span aria-hidden className="live-dot size-1.5 rounded-full bg-emerald-400" />Dispo.</span>}
          </div>
          <div className="mt-1.5 border-t border-white/10 pt-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">À partir de</p>
            {/* L'unité passe à la ligne d'un bloc (« / nuit ») plutôt que d'être coupée après la barre. */}
            <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="font-display text-lg font-semibold leading-none tracking-tight text-gold-soft">{formatXAF(price_xaf)}</span><span className="whitespace-nowrap text-[11px] text-slate-400">/ {priceUnitLabel(price_unit)}</span></p>
          </div>
        </div>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={stopCardClick} aria-label={`Contacter ${title} sur WhatsApp`} className="absolute bottom-3 right-3 z-10 grid size-10 place-items-center rounded-full border border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-lg backdrop-blur-md transition hover:bg-emerald-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95">
            <MessageCircle className="size-5" aria-hidden /><span className="sr-only">Contacter sur WhatsApp</span>
          </a>
        )}
      </div>
    </article>
  );
}

export function ListingCardSkeleton() {
  return <div className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"><div className="flex h-full flex-col justify-end gap-2 p-4"><div className="h-3.5 w-4/5 rounded-full bg-white/10" /><div className="h-3 w-2/5 rounded-full bg-white/[0.07]" /><div className="mt-2 h-3.5 w-1/2 rounded-full bg-white/10" /></div></div>;
}
