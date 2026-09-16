"use client";

import { useState } from "react";
import { Zap, Sparkles, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { formatXAF } from "@/lib/format";
import type { BoostOption } from "@/types/listing";

interface BoostModalProps {
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onBoostSuccess?: (plan: BoostOption) => void;
}

const BOOST_PLANS: BoostOption[] = [
  {
    id: "boost_24h",
    duration_hours: 24,
    price_xaf: 3000,
    label: "Boost 24h Express",
    badge: "1 Jour de visibilité max",
  },
  {
    id: "boost_7d",
    duration_hours: 168,
    price_xaf: 15000,
    label: "Boost 7 Jours Star",
    badge: "1 Semaine en tête de grille (-30%)",
  },
];

export function BoostModal({ listingTitle, isOpen, onClose, onBoostSuccess }: BoostModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<BoostOption>(BOOST_PLANS[0]);
  const [provider, setProvider] = useState<"MTN" | "AIRTEL">("MTN");
  const [phone, setPhone] = useState("06");
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setSuccess(true);
      if (onBoostSuccess) onBoostSuccess(selectedPlan);
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-neon/40 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/10 text-slate-300 hover:text-white"
        >
          <X className="size-4" />
        </button>

        {!success ? (
          <form onSubmit={handlePay} className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-neon/20 text-neon ring-1 ring-neon/40 shadow-lg">
                <Zap className="size-6" />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Booster votre annonce
                </h3>
                <p className="text-xs text-slate-400">
                  Propulsez &quot;{listingTitle}&quot; en 1ère position
                </p>
              </div>
            </div>

            {/* Sélection de l'offre */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Choisir la formule de mise en avant
              </label>
              <div className="grid gap-2.5">
                {BOOST_PLANS.map((plan) => {
                  const isSelected = selectedPlan.id === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        isSelected
                          ? "border-neon bg-neon/10 shadow-[0_0_20px_-4px_rgb(255_61_129/0.3)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-white text-sm">{plan.label}</p>
                          <span className="mt-0.5 inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] text-neon-soft">
                            {plan.badge}
                          </span>
                        </div>
                        <p className="font-display text-lg font-bold text-gold-soft">
                          {formatXAF(plan.price_xaf)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Opérateur de paiement */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Paiement Mobile Money
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider("MTN")}
                  className={`rounded-xl border py-2.5 px-3 text-xs font-semibold transition ${
                    provider === "MTN"
                      ? "border-yellow-400/60 bg-yellow-500/20 text-yellow-300"
                      : "border-white/10 bg-white/[0.02] text-slate-400"
                  }`}
                >
                  MTN MoMo (Congo)
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("AIRTEL")}
                  className={`rounded-xl border py-2.5 px-3 text-xs font-semibold transition ${
                    provider === "AIRTEL"
                      ? "border-red-500/60 bg-red-500/20 text-red-300"
                      : "border-white/10 bg-white/[0.02] text-slate-400"
                  }`}
                >
                  Airtel Money (Congo)
                </button>
              </div>

              <div>
                <label className="mt-2 block text-[11px] text-slate-400">
                  Numéro de téléphone mobile money (Congo +242) :
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 123 45 67"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-neon focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-neon-action text-sm font-semibold text-white shadow-[0_8px_25px_-8px_rgb(255_61_129/0.6)] hover:brightness-110 active:scale-98 transition disabled:opacity-50"
            >
              <Zap className="size-4" />
              {isProcessing
                ? "Validation du paiement en cours..."
                : `Confirmer le Boost (${formatXAF(selectedPlan.price_xaf)})`}
            </button>
          </form>
        ) : (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
              <CheckCircle2 className="size-9" />
            </div>

            <div>
              <h4 className="font-display text-xl font-bold text-white">
                Annonce boostée avec succès !
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                Votre annonce apparaîtra désormais en haut du fil de recherche avec le badge
                d&apos;impact lumineux pour les prochaines {selectedPlan.duration_hours} heures.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccess(false);
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
