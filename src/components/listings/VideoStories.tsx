"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Gift,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Portal } from "@/components/ui/Portal";
import { VirtualGiftsModal } from "@/components/listings/VirtualGiftsModal";
import { cx } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";
import { categoryShort, cityLabel, type VideoStory } from "@/types/listing";

/**
 * Rail d'aperçus vidéo au format vertical (« shorts »).
 *
 * Le rail lui-même ne charge aucune vidéo : uniquement des vignettes. Les
 * fichiers ne sont montés dans le DOM qu'à l'ouverture du lecteur — sur une
 * connexion congolaise en 3G, précharger douze MP4 rendrait la page inutilisable.
 *
 * Les éléments du rail sont des `<button>` et non des liens : ils ouvrent le
 * lecteur, et le lien vers l'offre est proposé à l'intérieur.
 */
export function VideoStories({ stories }: { stories: VideoStory[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  /** Aperçus déjà ouverts : l'anneau doré s'éteint, comme sur des Stories. */
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());

  const open = (index: number) => {
    setOpenIndex(index);
    setSeen((previous) => new Set(previous).add(stories[index].id));
  };

  const goTo = useCallback(
    (index: number) => {
      const next = (index + stories.length) % stories.length;
      setOpenIndex(next);
      setSeen((previous) => new Set(previous).add(stories[next].id));
    },
    [stories],
  );

  if (stories.length === 0) return null;

  return (
    <section aria-label="Matripa Shorts — Stories Vidéo" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Matripa Shorts
            </h2>
            <span className="rounded-full border border-neon/30 bg-neon/10 px-2.5 py-0.5 text-[10px] font-bold text-neon-soft">
              15s Vidéo
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Stories vidéo de 15 secondes · Découvrez les membres en mouvement
          </p>
        </div>

        <Link
          href="/partenaire"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 hover:border-gold/40 hover:bg-gold/10 hover:text-gold transition"
        >
          <span>+ Publier un Short</span>
        </Link>
      </div>

      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {stories.map((story, index) => (
          <li key={story.id} className="shrink-0 snap-start">
            <StoryThumb story={story} seen={seen.has(story.id)} onOpen={() => open(index)} />
          </li>
        ))}
      </ul>

      {openIndex !== null && (
        <Portal>
          <StoryPlayer
            stories={stories}
            index={openIndex}
            onClose={() => setOpenIndex(null)}
            onNavigate={goTo}
          />
        </Portal>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Vignette                                  */
/* -------------------------------------------------------------------------- */

function StoryThumb({
  story,
  seen,
  onOpen,
}: {
  story: VideoStory;
  seen: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        // Volontairement modeste : le rail est une invitation, pas le
        // catalogue. Au-delà de ~130 px de large, il repousse la grille
        // d'offres — la vraie raison de la visite — sous la ligne de flottaison.
        "group block w-[104px] rounded-[18px] p-[1.5px] text-left transition sm:w-[128px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/80 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        // L'anneau animé distingue les aperçus non encore consultés.
        seen ? "bg-white/10" : "story-ring",
      )}
      aria-label={`Voir l'aperçu vidéo — ${story.title}`}
    >
      <span className="relative block aspect-[9/16] overflow-hidden rounded-[17px] bg-slate-900">
        <Image
          src={story.video_poster_url ?? story.cover_url}
          alt=""
          fill
          sizes="128px"
          className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
        />

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgb(2 6 23 / 0.92) 0%, rgb(2 6 23 / 0.35) 40%, transparent 70%)",
          }}
        />

        {story.is_vip && (
          <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-slate-950/70 ring-1 ring-gold/50 backdrop-blur-md">
            <Crown className="size-3 text-gold" aria-hidden />
          </span>
        )}

        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-slate-950/60 ring-1 ring-white/20 backdrop-blur-md transition group-hover:bg-neon/80 group-hover:ring-neon/40">
          <Play className="size-3 fill-white text-white" aria-hidden />
        </span>

        <span className="absolute inset-x-2 bottom-2 block">
          <span className="line-clamp-2 block text-[11px] font-medium leading-tight text-white">
            {story.title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-slate-400">
            {cityLabel(story.city)}
          </span>
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Lecteur                                   */
/* -------------------------------------------------------------------------- */

function StoryPlayer({
  stories,
  index,
  onClose,
  onNavigate,
}: {
  stories: VideoStory[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const story = stories[index];
  const whatsappHref = whatsAppLink(
    story.whatsapp_phone,
    `Bonjour, je regarde votre Short sur Matripa concernant "${story.title}". Êtes-vous disponible ?`,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [hasLiked, setHasLiked] = useState<Record<string, boolean>>({});
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verrouille le défilement de l'arrière-plan tant que le lecteur est ouvert.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === "ArrowDown") onNavigate(index + 1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") onNavigate(index - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, onClose, onNavigate]);

  // Remet la barre de progression à zéro à chaque changement d'aperçu.
  useEffect(() => setProgress(0), [index]);

  const currentLikes = (likes[story.id] ?? 24) + (hasLiked[story.id] ? 1 : 0);

  const toggleLike = () => {
    setHasLiked((prev) => ({ ...prev, [story.id]: !prev[story.id] }));
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.origin + `/annonces/${story.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Short vidéo 15s — ${story.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onClose}
        className="drawer-veil absolute inset-0 cursor-default bg-slate-950/85 backdrop-blur-md"
      />

      <div className="relative z-10 flex h-full w-full max-w-[min(430px,100vw)] flex-col justify-center px-3 py-4">
        {/* Progression : une barre par aperçu, façon Stories. */}
        <div className="mb-3 flex gap-1" aria-hidden>
          {stories.map((item, i) => (
            <span key={item.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-gold transition-[width] duration-200 ease-linear"
                style={{ width: i < index ? "100%" : i === index ? `${progress}%` : "0%" }}
              />
            </span>
          ))}
        </div>

        <div className="relative aspect-[9/16] max-h-[76vh] w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
          <video
            ref={videoRef}
            // La clé force le remontage : sans elle, changer `src` sur un
            // élément déjà en lecture laisse parfois la frame précédente.
            key={story.id}
            src={story.video_url}
            poster={story.video_poster_url ?? story.cover_url}
            autoPlay
            muted={muted}
            playsInline
            onTimeUpdate={(event) => {
              const el = event.currentTarget;
              if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
            }}
            onEnded={() => onNavigate(index + 1)}
            className="size-full object-cover"
          />

          {/* Badge 15s Shorts en haut */}
          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-neon backdrop-blur-md ring-1 ring-white/10">
            <span className="size-1.5 rounded-full bg-neon animate-pulse" />
            Shorts 15s
          </div>

          {/* Barre d'action verticale latérale (Style TikTok / Instagram Reels) */}
          <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-3">
            {/* Bouton Like */}
            <button
              type="button"
              onClick={toggleLike}
              className="flex flex-col items-center gap-0.5 text-white transition active:scale-90"
              aria-label="Aimer ce short"
            >
              <div
                className={`grid size-10 place-items-center rounded-full backdrop-blur-md ring-1 transition ${
                  hasLiked[story.id]
                    ? "bg-pink-600/80 text-white ring-pink-400"
                    : "bg-slate-950/60 text-slate-200 ring-white/20 hover:bg-slate-900/80"
                }`}
              >
                <Heart className={`size-5 ${hasLiked[story.id] ? "fill-white" : ""}`} />
              </div>
              <span className="text-[10px] font-semibold drop-shadow">{currentLikes}</span>
            </button>

            {/* Bouton Cadeau Virtuel */}
            <button
              type="button"
              onClick={() => setGiftModalOpen(true)}
              className="flex flex-col items-center gap-0.5 text-gold transition active:scale-90"
              aria-label="Envoyer un cadeau"
            >
              <div className="grid size-10 place-items-center rounded-full bg-slate-950/60 text-gold ring-1 ring-gold/40 backdrop-blur-md hover:bg-gold/20">
                <Gift className="size-5" />
              </div>
              <span className="text-[10px] font-semibold drop-shadow">Cadeau</span>
            </button>

            {/* Bouton WhatsApp — absent si le profil n'a pas renseigné de numéro. */}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-0.5 text-emerald-400 transition active:scale-90"
                aria-label="Contacter sur WhatsApp"
              >
                <div className="grid size-10 place-items-center rounded-full bg-slate-950/60 text-emerald-400 ring-1 ring-emerald-500/40 backdrop-blur-md hover:bg-emerald-500/20">
                  <MessageCircle className="size-5" />
                </div>
                <span className="text-[10px] font-semibold drop-shadow">WhatsApp</span>
              </a>
            )}

            {/* Bouton Partage */}
            <button
              type="button"
              onClick={handleShare}
              className="flex flex-col items-center gap-0.5 text-white transition active:scale-90"
              aria-label="Partager"
            >
              <div className="grid size-10 place-items-center rounded-full bg-slate-950/60 text-slate-300 ring-1 ring-white/20 backdrop-blur-md hover:bg-slate-900/80">
                <Share2 className="size-5" />
              </div>
              <span className="text-[10px] font-semibold drop-shadow">
                {copied ? "Copié !" : "Partage"}
              </span>
            </button>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
            style={{
              background: "linear-gradient(to top, rgb(2 6 23 / 0.95) 0%, transparent 100%)",
            }}
          />

          <div className="absolute inset-x-4 bottom-4 pr-14 space-y-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold">
                {categoryShort(story.category)}
              </p>
              <p className="mt-0.5 font-display text-2xl font-semibold leading-tight text-white line-clamp-1">
                {story.title}
              </p>
              <p className="text-xs text-slate-400">{cityLabel(story.city)}</p>
            </div>

            <Link
              href={`/annonces/${story.slug}`}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-12px_rgb(255_61_129/0.9)] transition hover:brightness-110 active:scale-[0.99]"
            >
              Voir le profil complet
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <PlayerControl label="Aperçu précédent (Flèche haut)" onClick={() => onNavigate(index - 1)}>
            <ChevronLeft className="size-5" aria-hidden />
          </PlayerControl>

          <PlayerControl
            label={muted ? "Activer le son" : "Couper le son"}
            onClick={() => setMuted((v) => !v)}
          >
            {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
          </PlayerControl>

          <PlayerControl label="Aperçu suivant (Flèche bas)" onClick={() => onNavigate(index + 1)}>
            <ChevronRight className="size-5" aria-hidden />
          </PlayerControl>
        </div>
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Fermer les aperçus"
        // Décalé à gauche du bouton de panique, qui reste au premier plan dans le coin.
        className="absolute right-16 top-4 z-20 sm:right-36 grid size-10 place-items-center rounded-full border border-white/15 bg-slate-950/60 text-white backdrop-blur-md transition hover:bg-slate-950/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/80"
      >
        <X className="size-5" aria-hidden />
      </button>

      {/* Modale de cadeaux virtuels */}
      <VirtualGiftsModal
        listingTitle={story.title}
        isOpen={giftModalOpen}
        onClose={() => setGiftModalOpen(false)}
      />
    </div>
  );
}

function PlayerControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 backdrop-blur-md transition hover:bg-white/[0.14] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/80"
    >
      {children}
    </button>
  );
}
