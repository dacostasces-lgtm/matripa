"use client";

import { useState } from "react";
import { Gift, Sparkles, CheckCircle2, Wallet, X } from "lucide-react";
import { formatXAF } from "@/lib/format";
import type { VirtualGift } from "@/types/listing";

interface VirtualGiftsModalProps {
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const GIFTS: VirtualGift[] = [
  {
    id: "rose",
    name: "Rose d'Accueil",
    emoji: "🌹",
    amount_xaf: 1000,
    description: "Un geste courtois pour attirer l'attention",
  },
  {
    id: "cocktail",
    name: "Cocktail Privé",
    emoji: "🍸",
    amount_xaf: 2500,
    description: "Idéal pour briser la glace avec élégance",
  },
  {
    id: "champagne",
    name: "Bouteille de Champagne",
    emoji: "🍾",
    amount_xaf: 5000,
    description: "Le grand jeu pour marquer votre sérieux",
  },
  {
    id: "crown",
    name: "Couronne VIP",
    emoji: "👑",
    amount_xaf: 10000,
    description: "Place votre message en priorité absolue",
  },
  {
    id: "diamond",
    name: "Diamant d'Exception",
    emoji: "💎",
    amount_xaf: 25000,
    description: "Débloque immédiatement le contact direct",
  },
];

export function VirtualGiftsModal({ listingTitle, isOpen, onClose }: VirtualGiftsModalProps) {
  const [selectedGift, setSelectedGift] = useState<VirtualGift>(GIFTS[0]);
  const [walletBalance, setWalletBalance] = useState<number>(15000);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSend = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setWalletBalance((prev) => Math.max(0, prev - selectedGift.amount_xaf));
      setIsSubmitting(false);
      setSentSuccess(true);
    }, 700);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-gold/30 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/10 text-slate-300 hover:text-white"
        >
          <X className="size-4" />
        </button>

        {!sentSuccess ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-pink-500/20 to-gold/20 text-gold ring-1 ring-gold/30">
                <Gift className="size-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Envoyer un Cadeau à {listingTitle}
                </h3>
                <p className="text-xs text-slate-400">
                  Pourboire et reconnaissance crédités directement sur son profil
                </p>
              </div>
            </div>

            {/* Solde Wallet actuel */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="flex items-center gap-2 text-xs text-slate-300">
                <Wallet className="size-4 text-gold" />
                Solde de votre Portefeuille :
              </span>
              <span className="font-display font-semibold text-gold-soft">
                {formatXAF(walletBalance)}
              </span>
            </div>

            {/* Grille des cadeaux */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {GIFTS.map((gift) => {
                const isSelected = selectedGift.id === gift.id;
                return (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() => setSelectedGift(gift)}
                    className={`flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition ${
                      isSelected
                        ? "border-gold bg-gold/15 shadow-[0_0_15px_-3px_rgb(233_200_119/0.4)]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-3xl mb-1">{gift.emoji}</span>
                    <span className="text-xs font-medium text-white line-clamp-1">{gift.name}</span>
                    <span className="mt-1 text-[11px] font-bold text-gold-soft">
                      {formatXAF(gift.amount_xaf)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Description du cadeau sélectionné */}
            <div className="rounded-xl bg-slate-950/50 p-3 text-center text-xs text-slate-300 border border-white/5">
              <p>{selectedGift.description}</p>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSend}
                className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 shadow-lg hover:brightness-110 active:scale-98 transition disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {isSubmitting
                  ? "Envoi en cours..."
                  : `Envoyer ${selectedGift.name} (${formatXAF(selectedGift.amount_xaf)})`}
              </button>

              <button
                type="button"
                onClick={() => setWalletBalance((prev) => prev + 10000)}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-medium text-slate-400 hover:text-white"
              >
                Recharger le Wallet via MTN / Airtel Money (+10 000 FCFA)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
              <CheckCircle2 className="size-9" />
            </div>

            <div>
              <span className="text-4xl">{selectedGift.emoji}</span>
              <h4 className="mt-2 font-display text-xl font-bold text-white">
                Cadeau envoyé avec succès !
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                {selectedGift.name} a été remis à {listingTitle}. Une notification privée lui a été
                transmise.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSentSuccess(false);
                onClose();
              }}
              className="mt-4 w-full h-11 rounded-xl bg-white/10 text-sm font-semibold text-white hover:bg-white/20 transition"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
