import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Crown, Sparkles } from "lucide-react";

import { CategoryTabs } from "@/components/listings/CategoryTabs";
import { CityNav } from "@/components/listings/CityNav";
import { FilterDrawer } from "@/components/listings/FilterDrawer";
import { ListingGrid, ListingGridSkeleton } from "@/components/listings/ListingGrid";
import { SearchInput } from "@/components/listings/SearchInput";
import { VideoStories } from "@/components/listings/VideoStories";
import { fetchVideoStories } from "@/lib/listings";
import { filtersKey, parseFilters, type RawSearchParams } from "@/lib/filters";
import type { CitySlug } from "@/types/listing";

export const metadata: Metadata = {
  title: "Matripa — Rencontres & annonces d'exception au Congo",
  description:
    "Découvrez des profils vérifiés et des prestations de qualité à Brazzaville et Pointe-Noire.",
};

/**
 * Le fil est rendu puis mis en cache par combinaison de filtres, et régénéré
 * au plus toutes les 5 minutes. Les lectures passent par un client anonyme
 * sans cookies (`fetchListings`), ce qui rend la mise en cache possible : un
 * catalogue qui bouge à peine n'a pas à déclencher un aller-retour base à
 * chaque visite.
 *
 * Une publication reste visible immédiatement : les actions partenaire
 * appellent `revalidatePath("/", "layout")`. Ce délai n'est qu'un filet.
 */
export const revalidate = 300;

interface HomePageProps {
  // Next.js 15 : `searchParams` est une Promise dans les Server Components.
  searchParams: Promise<RawSearchParams>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const filters = parseFilters(await searchParams);

  return (
    <main className="relative min-h-dvh text-slate-100">
      <AmbientHalo />

      {/* La navigation (dont l'entrée vers l'espace partenaire) est rendue par le layout racine. */}
      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 sm:mb-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/[0.07] px-3 py-1.5 text-xs font-medium text-gold-soft backdrop-blur-md">
              <Sparkles className="size-3.5 text-gold" aria-hidden />
              Profils vérifiés · Sélection de qualité
            </span>

            <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Rencontres &amp; Annonces d&apos;exception <span className="text-gilded">au Congo</span>
            </h1>

            <p className="hidden text-pretty text-base leading-relaxed text-slate-400 sm:block">
              Découvrez des profils vérifiés et des prestations de qualité à Brazzaville et
              Pointe-Noire.
            </p>
          </div>

          <VipPassTeaser />
        </header>

        {/* Le rail d'aperçus est un agrément : il est streamé à part pour ne
            jamais retarder l'affichage du fil, qui est la raison de la visite. */}
        <Suspense fallback={null}>
          <VideoStoriesRail city={filters.city} />
        </Suspense>

        <div className="sticky top-0 z-30 mt-8 -mx-4 space-y-3 border-b border-white/[0.06] bg-surface/85 px-4 py-3 backdrop-blur-2xl sm:-mx-6 sm:px-6 sm:py-4 lg:-mx-8 lg:px-8">
          {/* Réserve à droite : le bouton Discrétion flotte au-dessus de cette barre une fois collée. */}
          <div className="flex items-center gap-2 pr-11 sm:gap-3 sm:pr-28 lg:pr-[6.5rem]">
            <div className="min-w-0 flex-1">
              <SearchInput filters={filters} />
            </div>
            <FilterDrawer filters={filters} />
          </div>

          <CityNav filters={filters} />
          <CategoryTabs filters={filters} />
        </div>

        <section className="mt-8">
          {/* La clé force un nouveau fallback à chaque changement de filtre :
              l'utilisateur voit immédiatement que la recherche est relancée. */}
          <Suspense key={filtersKey(filters)} fallback={<ListingGridSkeleton />}>
            <ListingGrid filters={filters} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

async function VideoStoriesRail({ city }: { city: CitySlug | null }) {
  const stories = await fetchVideoStories(city);
  if (stories.length === 0) return null;

  return <VideoStories stories={stories} />;
}

/**
 * Halo d'ambiance, purement décoratif.
 *
 * Empilé explicitement (`z-0` sous un contenu en `z-10`) plutôt qu'en z-index
 * négatif : `html` porte un fond dans globals.css, donc celui de `body` ne se
 * propage pas au canvas et se peint comme un fond de bloc — au-dessus de tout
 * enfant en z négatif, qui restait donc invisible.
 */
function AmbientHalo() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[640px]"
      style={{
        background: [
          // Or à gauche, rose néon à droite : les deux accents de la charte,
          // très dilués — un halo qui se remarque n'est plus une ambiance.
          "radial-gradient(56% 58% at 12% 0%, rgb(233 200 119 / 0.16) 0%, transparent 70%)",
          "radial-gradient(52% 56% at 88% 4%, rgb(255 61 129 / 0.22) 0%, transparent 70%)",
          "radial-gradient(70% 40% at 50% 0%, rgb(148 163 184 / 0.07) 0%, transparent 65%)",
        ].join(", "),
      }}
    />
  );
}

/**
 * Accroche vers l'abonnement : discrète, jamais au-dessus du catalogue.
 *
 * Faute de page d'abonnement, la destination est la création de compte — et le
 * libellé le dit. Un intitulé qui laisserait croire à un accès immédiat au pass
 * serait une promesse que la page suivante ne tiendrait pas.
 * À rebrancher sur `/pass-vip` le jour où elle existe.
 */
function VipPassTeaser() {
  return (
    <Link
      href="/connexion"
      className="group inline-flex shrink-0 items-center gap-3 rounded-2xl border border-gold/20 bg-white/[0.03] px-4 py-3 backdrop-blur-xl transition hover:border-gold/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/12 ring-1 ring-gold/25">
        <Crown className="size-5 text-gold" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">Devenir Membre VIP</span>
        <span className="block text-xs text-slate-400">
          Créez votre compte et accédez aux profils vérifiés
        </span>
      </span>
      <ArrowUpRight
        className="size-4 shrink-0 text-slate-500 transition group-hover:text-gold"
        aria-hidden
      />
    </Link>
  );
}
