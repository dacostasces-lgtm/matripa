"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { cx, formatXAF, priceUnitLabel } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";
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
 * Deux actions : la demande (toujours présente) et WhatsApp, quand le profil a
 * renseigné un numéro. Le Pass VIP, simulé, a été retiré en attendant un
 * paiement réel.
 */
export function StickyActionBar({
  listingSlug,
  listingTitle,
  priceXaf,
  priceUnit,
  whatsappPhone,
}: StickyActionBarProps) {
  const [visible, setVisible] = useState(false);

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

  // `null` sans numéro renseigné : le bouton disparaît plutôt que d'écrire à un inconnu.
  const whatsappUrl = whatsAppLink(
    whatsappPhone,
    `Bonjour, je vous contacte depuis Matripa au sujet de "${listingTitle}". Êtes-vous disponible ?`,
  );

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

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contacter sur WhatsApp"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 transition active:scale-95"
            >
              <MessageCircle className="size-4" />
            </a>
          )}

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
    </>
  );
}
