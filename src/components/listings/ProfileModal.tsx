"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, MapPin, MessageCircle, Send, ShieldCheck, Star, X } from "lucide-react";

import { useFavorites } from "@/components/listings/useFavorites";
import { Portal } from "@/components/ui/Portal";
import { categoryShort, cityLabel, mobilityLabel, type ListingExplorerData } from "@/types/listing";
import { cx, formatRating, formatXAF, priceUnitLabel } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";

interface ProfileModalProps {
  listing: ListingExplorerData;
  onClose: () => void;
}

/**
 * Vue détaillée premium rendue dans un portail : elle ne change pas la route
 * et restitue donc le fil exactement à sa position initiale après fermeture.
 */
export function ProfileModal({ listing, onClose }: ProfileModalProps) {
  const favorites = useFavorites();
  const isFavorite = favorites.isFavorite(listing.id);
  const images = useMemo(
    () => Array.from(new Set([listing.cover_url, ...listing.images])),
    [listing.cover_url, listing.images],
  );
  // Seule certification réelle : le contrôle d'identité fait par l'équipe (is_verified).
  const isCertified = listing.is_verified;

  // Le parent passe une fonction recréée à chaque rendu : la ref évite de
  // relancer l'effet (et de rejouer le verrou de défilement) à chaque fois.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    // Le focus d'entrée est porté par `autoFocus` sur « Fermer » : le Portal ne
    // monte ses enfants qu'au rendu suivant, le bouton n'existe pas encore ici.
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      // Rend le focus à la carte d'origine, sans faire défiler le fil.
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  const whatsappHref = whatsAppLink(
    listing.whatsapp_phone,
    `Bonjour, je vous contacte depuis Matripa au sujet de votre annonce "${listing.title}" à ${cityLabel(listing.city)}. Êtes-vous disponible prochainement ?`,
  );
  const services = [categoryShort(listing.category), mobilityLabel(listing.mobility), ...listing.amenities];

  return (
    <Portal>
      <div className="drawer-veil fixed inset-0 z-[70] flex items-end bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
        <button type="button" aria-label="Fermer la fiche" className="absolute inset-0 cursor-default" onClick={onClose} />

        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          className="profile-modal-panel relative flex max-h-[94dvh] w-full overflow-hidden rounded-t-[2rem] border border-white/10 bg-slate-950 shadow-[0_32px_100px_rgb(0_0_0/0.75)] sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-[2rem]"
        >
          <div className="min-h-0 w-full overflow-y-auto pb-24">
            <div className={cx("relative aspect-[4/3] overflow-hidden bg-slate-900", listing.is_vip && "ring-2 ring-inset ring-gold shadow-[inset_0_0_42px_rgb(233_200_119/0.45)]")}>
              <div className="flex h-full snap-x snap-mandatory overflow-x-auto scrollbar-none">
                {images.map((src, index) => (
                  <div key={src} className="relative h-full w-full shrink-0 snap-center">
                    <Image src={src} alt={`${listing.title} — photo ${index + 1}`} fill priority={index === 0} sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
                  </div>
                ))}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-950/75 to-transparent" />

              <button
                autoFocus
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-lg backdrop-blur-xl transition hover:border-gold/60 hover:text-gold-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 active:scale-95"
              >
                <X className="size-5" aria-hidden />
              </button>

              {listing.is_vip && (
                <span className="absolute bottom-4 left-4 rounded-full border border-gold/60 bg-slate-950/75 px-3 py-1.5 text-xs font-semibold tracking-wide text-gold-soft shadow-[0_0_20px_rgb(233_200_119/0.35)] backdrop-blur-xl">
                  VIP Gold
                </span>
              )}
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">{categoryShort(listing.category)}</p>
                <h2 id="profile-modal-title" className="mt-1 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{listing.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-gold" aria-hidden />{cityLabel(listing.city)}{listing.district ? ` · ${listing.district}` : ""}</span>
                  {listing.rating !== null && <span className="inline-flex items-center gap-1.5"><Star className="size-4 fill-gold text-gold" aria-hidden />{formatRating(listing.rating)}</span>}
                </div>
              </div>

              <div className={cx("rounded-2xl border p-4", isCertified ? "border-emerald-400/35 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]")}>
                <div className="flex items-start gap-3">
                  <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", isCertified ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-400")}><ShieldCheck className="size-5" aria-hidden /></span>
                  <div>
                    <p className={cx("text-sm font-semibold", isCertified ? "text-emerald-200" : "text-slate-300")}>{isCertified ? "Compte certifié" : "Compte non certifié"}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{isCertified ? "Identité contrôlée par l’équipe Matripa." : "L’identité de ce compte n’a pas encore été contrôlée."}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gold/20 bg-gradient-to-r from-gold/[0.10] to-neon/[0.08] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Tarif indicatif</p>
                <p className="mt-1 font-display text-2xl font-semibold text-gold-soft">{formatXAF(listing.price_xaf)} <span className="font-sans text-sm font-normal text-slate-400">/ {priceUnitLabel(listing.price_unit)}</span></p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white">Prestations</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {services.map((service) => <span key={service} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300">{service}</span>)}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white">À propos</h3>
                <p className="mt-2 text-sm leading-7 text-slate-300">{listing.description}</p>
              </div>
            </div>
          </div>

          <footer className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-white/10 bg-slate-950/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:p-4">
            <button type="button" onClick={() => favorites.toggle(listing.id)} aria-label={isFavorite ? "Retirer des favoris" : "Mettre en favori"} aria-pressed={isFavorite} className={cx("grid size-12 shrink-0 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70", isFavorite ? "border-neon/60 bg-neon/15 text-neon" : "border-white/15 bg-white/[0.04] text-slate-300 hover:text-gold-soft")}>
              <Heart className={cx("size-5", isFavorite && "fill-current")} aria-hidden />
            </button>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_8px_25px_-10px_rgb(16_185_129/0.9)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                <MessageCircle className="size-5 shrink-0" aria-hidden />
                Contacter sur WhatsApp
              </a>
            ) : (
              // Pas de WhatsApp renseigné : on passe par le formulaire de demande existant.
              <Link href={`/demande/${listing.slug}`} className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-slate-950 shadow-[0_8px_25px_-10px_rgb(233_200_119/0.6)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70">
                <Send className="size-5 shrink-0" aria-hidden />
                Envoyer une demande
              </Link>
            )}
          </footer>
        </section>
      </div>
    </Portal>
  );
}
