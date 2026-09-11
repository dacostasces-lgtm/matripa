"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cx } from "@/lib/format";

/**
 * Carousel natif : le défilement repose sur `scroll-snap` (fluide, tactile,
 * accessible au clavier) plutôt que sur une librairie. Les flèches se
 * contentent de piloter `scrollTo`, et l'index actif est déduit de la position
 * de scroll — aucun état dupliqué entre le DOM et React.
 */
export function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = useCallback((target: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(target, images.length - 1));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }, [images.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setIndex(Math.round(track.scrollLeft / track.clientWidth));
      });
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  const hasMultiple = images.length > 1;

  return (
    <section
      aria-roledescription="carrousel"
      aria-label={`Galerie — ${title}`}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 md:rounded-3xl"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") scrollTo(index + 1);
        if (event.key === "ArrowLeft") scrollTo(index - 1);
      }}
    >
      <div
        ref={trackRef}
        /*
          `max-h` borne la galerie : sans elle, un 16/10 sur écran large
          repousse tout le contenu sous la ligne de flottaison.

          `w-full` n'est pas redondant. Avec `aspect-ratio` et une largeur
          `auto`, borner la hauteur fait *recalculer la largeur* depuis le
          ratio : à 70vh de haut, la piste ne mesurait plus que 665 × 16/10
          = 1064 px et laissait 40 px de vide à droite du cadre. Fixer la
          largeur rend la hauteur dérivée, et c'est elle que `max-h` borne.
        */
        className="scrollbar-none flex aspect-[4/5] w-full max-h-[70vh] snap-x snap-mandatory overflow-x-auto overscroll-x-contain sm:aspect-[16/10]"
        tabIndex={0}
      >
        {images.map((src, i) => (
          <div
            key={src}
            className="relative w-full shrink-0 snap-center"
            aria-label={`Image ${i + 1} sur ${images.length}`}
            role="group"
          >
            <Image
              src={src}
              alt={`${title} — vue ${i + 1}`}
              fill
              priority={i === 0}
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {hasMultiple && (
        <>
          <GalleryArrow side="left" disabled={index === 0} onClick={() => scrollTo(index - 1)} />
          <GalleryArrow
            side="right"
            disabled={index === images.length - 1}
            onClick={() => scrollTo(index + 1)}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <span
                key={src}
                className={cx(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/40",
                )}
              />
            ))}
          </div>

          <span className="absolute right-4 top-4 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur-md">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </section>
  );
}

function GalleryArrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Image précédente" : "Image suivante"}
      className={cx(
        "absolute top-1/2 hidden -translate-y-1/2 place-items-center sm:grid",
        "size-10 rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md",
        "transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
