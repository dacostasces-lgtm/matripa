"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Crown, Info, ShieldCheck, Wallet, X } from "lucide-react";

import { Portal } from "@/components/ui/Portal";
import { cx, formatXAF, priceUnitLabel } from "@/lib/format";
import type { PriceUnit } from "@/types/listing";

interface VipPassButtonProps {
  listingSlug: string;
  listingTitle: string;
  priceXaf: number;
  priceUnit: PriceUnit;
  /** Rend le bouton compact pour le bandeau d'action mobile. */
  compact?: boolean;
}

/**
 * Mise en relation via le Pass VIP — portefeuille simulé.
 *
 * Aucun mouvement d'argent n'a lieu ici : le solde est une valeur de
 * démonstration et la validation redirige vers le formulaire de demande, seul
 * parcours réellement branché. La mention « simulation » est affichée à
 * l'utilisateur plutôt que reléguée en commentaire : une interface qui laisse
 * croire à un débit réel est un problème, pas une maquette.
 */
const SIMULATED_BALANCE_XAF = 250_000;

export function VipPassButton({
  listingSlug,
  listingTitle,
  priceXaf,
  priceUnit,
  compact = false,
}: VipPassButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cx(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl",
          "bg-neon-action font-semibold text-white",
          "shadow-[0_10px_30px_-12px_rgb(255_61_129/0.9)] transition hover:brightness-110 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          compact ? "h-11 px-4 text-sm" : "h-12 text-sm",
        )}
      >
        <Crown className="size-4" aria-hidden />
        Contacter avec le Pass VIP
      </button>

      {open && (
        <VipPassSheet
          listingSlug={listingSlug}
          listingTitle={listingTitle}
          priceXaf={priceXaf}
          priceUnit={priceUnit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

interface VipPassSheetProps {
  listingSlug: string;
  listingTitle: string;
  priceXaf: number;
  priceUnit: PriceUnit;
  onClose: () => void;
}

/**
 * Feuille de paiement, exportée séparément : le bandeau d'action mobile a son
 * propre déclencheur (une pastille) mais doit ouvrir exactement la même vue.
 * Mieux vaut partager la feuille que dupliquer le portefeuille.
 *
 * Le portail est porté ici, et non par les appelants : les deux points
 * d'ouverture sont dans un ancêtre `backdrop-blur` (panneau de réservation,
 * bandeau mobile), qui capterait le `position: fixed`.
 */
export function VipPassSheet(props: VipPassSheetProps) {
  return (
    <Portal>
      <PassSheet {...props} />
    </Portal>
  );
}

function PassSheet({
  listingSlug,
  listingTitle,
  priceXaf,
  priceUnit,
  onClose,
}: VipPassSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const remaining = SIMULATED_BALANCE_XAF - priceXaf;
  const covered = remaining >= 0;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onClose}
        className="drawer-veil absolute inset-0 cursor-default bg-slate-950/80 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mise en relation avec le Pass VIP"
        className={cx(
          "relative z-10 w-full max-w-md space-y-5 border border-white/10 bg-surface-raised/95 p-5 backdrop-blur-2xl",
          "rounded-t-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-5",
          "shadow-[0_-24px_60px_-24px_rgb(0_0_0/1)]",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Pass VIP Matripa</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{listingTitle}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Carte de portefeuille */}
        <div className="relative overflow-hidden rounded-2xl border border-gold/25 p-5">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.14]"
            style={{ background: "var(--grad-gold)" }}
          />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gold">
                <Wallet className="size-3.5" aria-hidden />
                Solde du pass
              </span>
              <Crown className="size-5 text-gold" aria-hidden />
            </div>

            <p className="font-display text-4xl font-semibold leading-none text-gold-soft">
              {formatXAF(SIMULATED_BALANCE_XAF)}
            </p>

            <dl className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-slate-400">Tarif indicatif</dt>
                <dd className="font-medium tabular-nums text-white">
                  {formatXAF(priceXaf)}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    / {priceUnitLabel(priceUnit)}
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-slate-400">Solde après demande</dt>
                <dd
                  className={cx(
                    "font-medium tabular-nums",
                    covered ? "text-emerald-300" : "text-red-300",
                  )}
                >
                  {formatXAF(remaining)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-xs leading-relaxed text-slate-400">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
          <span>
            <strong className="font-medium text-slate-300">Simulation.</strong> Aucun montant
            n&apos;est débité à cette étape : la validation transmet votre demande au profil,
            qui confirme la disponibilité avant tout paiement.
          </span>
        </p>

        {covered ? (
          <Link
            href={`/demande/${listingSlug}?pass=vip`}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neon-action text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgb(255_61_129/0.9)] transition hover:brightness-110 active:scale-[0.99]"
          >
            <ShieldCheck className="size-4" aria-hidden />
            Valider avec le Pass VIP
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <div className="space-y-2">
            <p className="text-center text-xs text-red-300">
              Solde insuffisant pour ce tarif indicatif.
            </p>
            <Link
              href={`/demande/${listingSlug}`}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Contacter le profil
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
