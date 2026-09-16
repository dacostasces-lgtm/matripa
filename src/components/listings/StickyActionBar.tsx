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
  whatsappPhone?: string | null;
}

/**
 * Bandeau d'action persistant (mobile). Il apparaît une fois la galerie
 * dépassée pour ne pas masquer le visuel d'ouverture, et respecte la safe-area
 * iOS via `pb-[env(safe-area-inset-bottom)]`.
 *
 * Les actions sont hiérarchisées : la demande classique, le Pass VIP et l'accès
 * WhatsApp direct pour un échange instantané au Congo.
 */
export function StickyActionBar({
  listingSlug,
  listingTitle,
  priceXaf,
  priceUnit,
  whatsappPhone,
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

  const cleanPhone = (whatsappPhone || "+242069123456").replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `Bonjour, je vous contacte depuis Matripa au sujet de "${listingTitle}". Êtes-vous disponible ?`
  )}`;

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
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold leading-tight text-gold-soft">
              {formatXAF(priceXaf)}
            </p>
            <p className="text-[10px] text-slate-400">par {priceUnitLabel(priceUnit)}</p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contacter sur WhatsApp"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 transition active:scale-95"
          >
            <MessageCircle className="size-4" />
          </a>

          <button
            type="button"
            onClick={() => setPassOpen(true)}
            aria-haspopup="dialog"
            aria-label="Contacter avec le Pass VIP"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-neon/35 bg-neon/12 text-neon-soft transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
          >
            <Crown className="size-4" aria-hidden />
          </button>

          <Link
            href={`/demande/${listingSlug}`}
            className={cx(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4",
              "bg-action text-xs font-semibold text-slate-950",
              "shadow-[0_6px_24px_-8px_rgb(233_200_119/0.55)] transition active:scale-[0.98]",
            )}
          >
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
