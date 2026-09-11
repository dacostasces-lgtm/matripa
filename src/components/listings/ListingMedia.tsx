"use client";

import { useState } from "react";
import { Images, Video } from "lucide-react";

import { ListingGallery } from "@/components/listings/ListingGallery";
import { cx } from "@/lib/format";

type Tab = "photos" | "video";

interface ListingMediaProps {
  images: string[];
  videoUrl: string | null;
  videoPosterUrl: string | null;
  title: string;
}

/**
 * Média de la fiche : galerie photo et aperçu vidéo sous deux onglets.
 *
 * L'onglet Photos reste celui d'ouverture même lorsqu'une vidéo existe : c'est
 * la photo de couverture qui a fait cliquer depuis le fil, la retrouver
 * immédiatement évite la rupture de continuité. La vidéo n'est montée dans le
 * DOM qu'une fois son onglet activé — un `<video>` masqué déclencherait quand
 * même les requêtes de métadonnées.
 */
export function ListingMedia({ images, videoUrl, videoPosterUrl, title }: ListingMediaProps) {
  const [tab, setTab] = useState<Tab>("photos");

  if (!videoUrl) {
    return <ListingGallery images={images} title={title} />;
  }

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Médias de l'offre"
        className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl"
      >
        <MediaTab active={tab === "photos"} onClick={() => setTab("photos")} controls="media-photos">
          <Images className="size-4" aria-hidden />
          Photos
          <span className="text-[11px] text-slate-500">{images.length}</span>
        </MediaTab>

        <MediaTab active={tab === "video"} onClick={() => setTab("video")} controls="media-video">
          <Video className="size-4" aria-hidden />
          Aperçu vidéo
          <span className="rounded bg-neon/15 px-1 text-[10px] font-semibold text-neon-soft">4K</span>
        </MediaTab>
      </div>

      {tab === "photos" ? (
        <div id="media-photos" role="tabpanel">
          <ListingGallery images={images} title={title} />
        </div>
      ) : (
        <div
          id="media-video"
          role="tabpanel"
          className="overflow-hidden rounded-2xl border border-white/10 bg-black md:rounded-3xl"
        >
          <video
            src={videoUrl}
            poster={videoPosterUrl ?? images[0]}
            controls
            autoPlay
            muted
            playsInline
            // Vertical par nature (format shorts) : on borne la hauteur pour
            // que le lecteur ne pousse pas tout le contenu sous la ligne de
            // flottaison, et on laisse `contain` gérer les bandes latérales.
            className="mx-auto aspect-[4/5] max-h-[70vh] w-full bg-black object-contain sm:aspect-[16/10]"
          >
            Votre navigateur ne prend pas en charge la lecture vidéo.
          </video>
        </div>
      )}
    </div>
  );
}

function MediaTab({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
        active
          ? "bg-white/[0.10] text-white shadow-[0_2px_12px_-4px_rgb(0_0_0/0.8)]"
          : "text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}
