"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, MessageCircle } from "lucide-react";

import { VipPassSheet } from "@/components/listings/VipPassButton";
import { cx, formatXAF, priceUnitLabel } from "@/lib/format";
import type { PriceUnit } from "@/types/listing";

interface StickyActionBarProps {
  listingSlug: string;
  listingTitle: string;
  priceXaf: number;
  priceUnit: PriceUnit;
}

/**
 * Bandeau d'action persistant (mobile). Il apparaît une fois la galerie
 * dépassée pour ne pas masquer le visuel d'ouverture, et respecte la safe-area
 * iOS via `pb-[env(safe-area-inset-bottom)]`.
 *
 * Les deux actions sont hiérarchisées par la surface : la demande classique —
 * seul parcours réellement branché — garde un bouton libellé, le Pass VIP se
 * réduit à une pastille. Deux boutons de même poids sur 375 px ne laisseraient
 * plus de place au tarif, qui est l'information que l'on vient vérifier.
 */
export function StickyActionBar({
  listingSlug,
  listingTitle,
  priceXaf,
  priceUnit,
}: StickyActionBarProps) {
  const [visible, setVisible] = useState(false);
  const [passOpen, setPassOpen] = useState(false);

  useEffect(() => {
    const anchor = document.getElementById("listing-gallery-anchor");
    if (!anchor) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-120px 0px 0px 0px" },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className={cx(
          "fixed inset-x-0 bottom-0 z-40 lg:hidden",
          "border-t border-white/10 bg-surface/90 backdrop-blur-2xl",
          "pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold leading-tight text-gold-soft">
              {formatXAF(priceXaf)}
            </p>
            <p className="text-[11px] text-slate-400">par {priceUnitLabel(priceUnit)}</p>
          </div>

          <button
            type="button"
            onClick={() => setPassOpen(true)}
            aria-haspopup="dialog"
            aria-label="Contacter avec le Pass VIP"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-neon/35 bg-neon/12 text-neon-soft transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
          >
            <Crown className="size-5" aria-hidden />
          </button>

          <Link
            href={`/demande/${listingSlug}`}
            className={cx(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5",
              "bg-action text-sm font-semibold text-slate-950",
              "shadow-[0_6px_24px_-8px_rgb(233_200_119/0.55)] transition active:scale-[0.98]",
            )}
          >
            <MessageCircle className="size-4" aria-hidden />
            Contacter
          </Link>
        </div>
      </div>

      {/* Rendue hors du bandeau : celui-ci est translaté hors écran quand il
          est masqué, ce qui emporterait la feuille avec lui. */}
      {passOpen && (
        <VipPassSheet
          listingSlug={listingSlug}
          listingTitle={listingTitle}
          priceXaf={priceXaf}
          priceUnit={priceUnit}
          onClose={() => setPassOpen(false)}
        />
      )}
    </>
  );
}
