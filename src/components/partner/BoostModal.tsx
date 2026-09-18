"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Crown, LoaderCircle, ShieldCheck, Sparkles, X, Zap } from "lucide-react";

import { cx, formatXAF } from "@/lib/format";
import type { BoostOption } from "@/types/listing";

interface BoostModalProps {
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
  /** Point d'extension pour brancher un vrai paiement après la simulation. */
  onBoostSuccess?: (plan: BoostOption) => void;
}

const BOOST_PLANS: BoostOption[] = [
  {
    id: "boost_24h",
    duration_hours: 24,
    price_xaf: 1_000,
    label: "Boost 24H",
    badge: "Remonte l'annonce en tête de liste",
  },
  {
    id: "boost_7d",
    duration_hours: 168,
    price_xaf: 5_000,
    label: "Pass VIP Gold - 7 Jours",
    badge: "Couronne, badge de confiance et stories vidéo",
  },
];

type MobileProvider = "MTN" | "Airtel";

/**
 * Simulation de paiement direct Mobile Money. Aucun solde Wallet n'est lu ou
 * débité : la confirmation finale est réservée au futur prestataire de paiement.
 */
export function BoostModal({ listingTitle, isOpen, onClose, onBoostSuccess }: BoostModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<BoostOption>(BOOST_PLANS[0]);
  const [provider, setProvider] = useState<MobileProvider>("MTN");
  const [phone, setPhone] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      onBoostSuccess?.(selectedPlan);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [isProcessing, onBoostSuccess, selectedPlan]);

  const close = () => {
    if (isProcessing) return;
    setIsSuccess(false);
    onClose();
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phone.trim().length < 8) return;
    setIsProcessing(true);
  };

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="boost-modal-title" className="fixed inset-0 z-50 flex items-end p-0 sm:items-center sm:justify-center sm:p-4">
      <button type="button" aria-label="Fermer" onClick={close} className="drawer-veil absolute inset-0 bg-slate-950/85 backdrop-blur-md" />

      <section className="profile-modal-panel relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-gold/25 bg-slate-950 text-slate-100 shadow-[0_32px_100px_rgb(0_0_0/0.8)] sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-gold/25 to-neon/25 text-gold-soft ring-1 ring-gold/35">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="boost-modal-title" className="font-display text-xl font-semibold text-white">Gagner en visibilité</h2>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{listingTitle}</p>
            </div>
          </div>
          <button type="button" onClick={close} disabled={isProcessing} aria-label="Fermer" className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-gold/50 hover:text-gold-soft disabled:opacity-40">
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {isSuccess ? (
          <div className="space-y-5 px-6 py-10 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40">
              <CheckCircle2 className="size-9" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-2xl font-semibold text-white">Demande envoyée</h3>
              <p className="mt-2 text-sm leading-relaxed text-emerald-200">Paiement en attente. Veuillez valider le code USSD sur votre téléphone.</p>
            </div>
            <button type="button" onClick={close} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] text-sm font-semibold text-white transition hover:bg-white/[0.12]">Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 p-5">
            <fieldset disabled={isProcessing} className="space-y-2.5">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Choisir un forfait</legend>
              {BOOST_PLANS.map((plan) => {
                const selected = selectedPlan.id === plan.id;
                const vip = plan.id === "boost_7d";
                return (
                  <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan)} className={cx("w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70", selected ? vip ? "border-gold/70 bg-gradient-to-r from-gold/15 to-neon/15 shadow-[0_0_24px_-10px_rgb(233_200_119/0.85)]" : "border-neon/70 bg-neon/10 shadow-[0_0_24px_-10px_rgb(255_61_129/0.8)]" : "border-white/10 bg-white/[0.025] hover:border-white/25")}>
                    <span className="flex items-start justify-between gap-4">
                      <span className="flex gap-3">
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", vip ? "bg-gold/15 text-gold" : "bg-neon/15 text-neon-soft")}>{vip ? <Crown className="size-4" aria-hidden /> : <Zap className="size-4" aria-hidden />}</span>
                        <span><span className="block text-sm font-semibold text-white">{plan.label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-400">{plan.badge}</span></span>
                      </span>
                      <span className="shrink-0 font-display text-lg font-semibold text-gold-soft">{formatXAF(plan.price_xaf)}</span>
                    </span>
                  </button>
                );
              })}
            </fieldset>

            <fieldset disabled={isProcessing} className="space-y-3 border-t border-white/[0.08] pt-5">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Paiement Mobile Money</legend>
              <div className="grid grid-cols-2 gap-2">
                <ProviderButton provider="MTN" active={provider === "MTN"} onClick={setProvider} />
                <ProviderButton provider="Airtel" active={provider === "Airtel"} onClick={setProvider} />
              </div>
              <label className="block text-sm font-medium text-slate-200" htmlFor="billing-phone">Numéro de facturation (MTN / Airtel)</label>
              <input id="billing-phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 123 45 67" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-slate-600 transition focus:border-neon/70 focus:outline-none focus:ring-2 focus:ring-neon/20" />
              <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="size-3.5 text-emerald-400" aria-hidden />Paiement sécurisé directement par {provider} Mobile Money.</p>
            </fieldset>

            <button type="submit" disabled={isProcessing || phone.trim().length < 8} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_8px_25px_-10px_rgb(16_185_129/0.95)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45">
              {isProcessing ? <><LoaderCircle className="size-5 animate-spin" aria-hidden />Connexion à {provider}…</> : <>Payer {formatXAF(selectedPlan.price_xaf)} via Mobile Money</>}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function ProviderButton({ provider, active, onClick }: { provider: MobileProvider; active: boolean; onClick: (provider: MobileProvider) => void }) {
  const mtn = provider === "MTN";
  return <button type="button" onClick={() => onClick(provider)} className={cx("h-11 rounded-xl border text-sm font-semibold transition", active ? mtn ? "border-yellow-300/70 bg-yellow-400/15 text-yellow-200" : "border-red-400/70 bg-red-500/15 text-red-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200")}>{mtn ? "MTN Mobile Money" : "Airtel Money"}</button>;
}
