"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock, Unlock, Eye, Sparkles, ShieldCheck, CheckCircle2, X } from "lucide-react";
import { formatXAF } from "@/lib/format";
import type { PrivateMediaItem } from "@/types/listing";

interface PrivateGalleryProps {
  listingTitle: string;
  items?: PrivateMediaItem[];
}

const DEFAULT_PRIVATE_ITEMS: PrivateMediaItem[] = [
  {
    id: "priv-1",
    listing_id: "1",
    type: "image",
    preview_blur_url: "https://picsum.photos/seed/priv1/600/800",
    full_url: "https://picsum.photos/seed/priv1/600/800",
    price_xaf: 1500,
    is_locked: true,
  },
  {
    id: "priv-2",
    listing_id: "1",
    type: "image",
    preview_blur_url: "https://picsum.photos/seed/priv2/600/800",
    full_url: "https://picsum.photos/seed/priv2/600/800",
    price_xaf: 1500,
    is_locked: true,
  },
  {
    id: "priv-3",
    listing_id: "1",
    type: "video",
    preview_blur_url: "https://picsum.photos/seed/priv3/600/800",
    full_url: "https://picsum.photos/seed/priv3/600/800",
    price_xaf: 2500,
    is_locked: true,
  },
];

export function PrivateGallery({ listingTitle, items = DEFAULT_PRIVATE_ITEMS }: PrivateGalleryProps) {
  const [mediaList, setMediaList] = useState<PrivateMediaItem[]>(items);
  const [selectedMedia, setSelectedMedia] = useState<PrivateMediaItem | null>(null);
  const [unlockedSuccess, setUnlockedSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUnlock = (item: PrivateMediaItem) => {
    setIsProcessing(true);
    setTimeout(() => {
      setMediaList((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_locked: false } : m))
      );
      setIsProcessing(false);
      setUnlockedSuccess(item.id);
      setSelectedMedia((prev) => (prev?.id === item.id ? { ...prev, is_locked: false } : prev));
    }, 800);
  };

  return (
    <div className="space-y-4 rounded-3xl border border-gold/20 bg-gradient-to-b from-gold/[0.04] to-surface/80 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30">
            <Lock className="size-4" />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold text-white">
              Galerie Privée &amp; Contenu Exclusif
            </h3>
            <p className="text-xs text-slate-400">
              Photos et courtes vidéos privées réservées aux membres
            </p>
          </div>
        </div>

        <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold-soft">
          {mediaList.filter((m) => !m.is_locked).length} / {mediaList.length} débloqués
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {mediaList.map((media, idx) => (
          <button
            key={media.id}
            type="button"
            onClick={() => setSelectedMedia(media)}
            className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-left transition hover:border-gold/40 focus:outline-none focus:ring-2 focus:ring-gold/70"
          >
            <Image
              src={media.preview_blur_url}
              alt="Média privé"
              fill
              sizes="(max-width: 640px) 33vw, 200px"
              className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
                media.is_locked ? "scale-110 filter blur-md" : ""
              }`}
            />

            {media.is_locked ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 p-2 text-center backdrop-blur-sm transition group-hover:bg-slate-950/70">
                <span className="grid size-9 place-items-center rounded-full bg-gold/20 text-gold ring-1 ring-gold/40 shadow-lg">
                  <Lock className="size-4" />
                </span>
                <span className="text-[10px] font-semibold text-white">Privé #{idx + 1}</span>
                <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-gold-soft">
                  {formatXAF(media.price_xaf)}
                </span>
              </div>
            ) : (
              <div className="absolute bottom-2 right-2 rounded-full bg-emerald-500/80 p-1 text-white shadow-md">
                <CheckCircle2 className="size-3.5" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Modal de déverrouillage / visualisation */}
      {selectedMedia && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setSelectedMedia(null)}
          />

          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setSelectedMedia(null)}
              aria-label="Fermer"
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/10 text-slate-300 hover:text-white"
            >
              <X className="size-4" />
            </button>

            {selectedMedia.is_locked ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/30">
                  <Lock className="size-8" />
                </div>

                <div>
                  <h4 className="font-display text-xl font-semibold text-white">
                    Déverrouiller ce média privé
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Accédez aux photos/vidéos exclusives publiées par {listingTitle}.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    Tarif d&apos;accès exclusif
                  </span>
                  <p className="font-display text-2xl font-bold text-gold-soft">
                    {formatXAF(selectedMedia.price_xaf)}
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleUnlock(selectedMedia)}
                    className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 shadow-lg hover:brightness-110 active:scale-98 transition disabled:opacity-50"
                  >
                    <Unlock className="size-4" />
                    {isProcessing ? "Déverrouillage en cours..." : "Déverrouiller avec le Wallet (Solde FCFA)"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUnlock(selectedMedia)}
                    className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
                  >
                    Payer via MTN MoMo / Airtel Money
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Transaction chiffrée et confidentielle. L&apos;accès reste actif indéfiniment.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={selectedMedia.full_url}
                    alt="Média déverrouillé"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> Média déverrouillé avec succès
                  </span>
                  <span className="text-slate-400">Exclusif Matripa</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
