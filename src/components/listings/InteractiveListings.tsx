"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Globe2, MapPin, RotateCcw, SearchX } from "lucide-react";

import { FilterDrawer } from "@/components/listings/FilterDrawer";
import { ListingCard } from "@/components/listings/ListingCard";
import { ProfileModal } from "@/components/listings/ProfileModal";
import { SearchInput } from "@/components/listings/SearchInput";
import { matchesFilters } from "@/lib/explore";
import { serializeFilters } from "@/lib/filters";
import { cx } from "@/lib/format";
import {
  CATEGORIES,
  CITIES,
  EMPTY_FILTERS,
  type ListingExplorerData,
  type ListingFilters,
} from "@/types/listing";

/** Cartes affichées par lot : le DOM et les images restent légers sur mobile. */
const BATCH_SIZE = 24;

interface InteractiveListingsProps {
  listings: ListingExplorerData[];
  /** Annonces publiées en base ; peut dépasser `listings.length` (plafond de chargement). */
  total: number;
  initialFilters: ListingFilters;
}

/**
 * Reporte les filtres dans l'URL sans navigation : pas d'aller-retour serveur,
 * mais un lien partagé ou une page rechargée retrouvent la même sélection
 * (l'accueil relit les paramètres au rendu, cf. parseFilters).
 * `replaceState` plutôt que `pushState` : chaque retouche d'un filtre ne doit
 * pas ajouter une entrée au bouton « retour ».
 */
function syncFiltersToUrl(filters: ListingFilters) {
  const query = serializeFilters({ ...filters, page: 1 });
  window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname);
}

/**
 * Explorateur de l'accueil. Ville, catégorie, recherche texte et filtres
 * avancés filtrent localement le catalogue déjà chargé : aucun rechargement,
 * aucune requête, aucun défilement perdu. La fiche s'ouvre en modale.
 */
export function InteractiveListings({ listings, total, initialFilters }: InteractiveListingsProps) {
  const [filters, setFilters] = useState<ListingFilters>({ ...initialFilters, page: 1 });
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedListing, setSelectedListing] = useState<ListingExplorerData | null>(null);

  const update = (patch: Partial<ListingFilters>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    setVisibleCount(BATCH_SIZE);
    syncFiltersToUrl(next);
  };

  const filteredListings = useMemo(
    () => listings.filter((listing) => matchesFilters(listing, filters)),
    [filters, listings],
  );
  const shown = filteredListings.slice(0, visibleCount);
  const remaining = filteredListings.length - shown.length;
  const truncated = total > listings.length;

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 space-y-3 border-b border-white/[0.06] bg-surface/85 px-4 py-3 backdrop-blur-2xl sm:-mx-6 sm:px-6 sm:py-4 lg:-mx-8 lg:px-8">
        {/* Réserve à droite : le bouton de panique flotte au-dessus de cette barre une fois collée. */}
        <div className="flex items-center gap-2 pr-11 sm:gap-3 sm:pr-28 lg:pr-[6.5rem]">
          <div className="min-w-0 flex-1">
            <SearchInput filters={filters} onQueryChange={(query) => update({ query })} />
          </div>
          <FilterDrawer filters={filters} onChange={(next) => update(next)} />
        </div>

        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          <FilterButton active={filters.city === null} onClick={() => update({ city: null })}>
            <Globe2 className="size-4" aria-hidden />
            Tout le Congo
          </FilterButton>
          {CITIES.map((city) => (
            <FilterButton key={city.slug} active={filters.city === city.slug} onClick={() => update({ city: city.slug })}>
              <MapPin className="size-4" aria-hidden />
              {city.label}
            </FilterButton>
          ))}
        </div>

        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          <FilterButton active={filters.category === null} onClick={() => update({ category: null })}>
            Tout
          </FilterButton>
          {CATEGORIES.map((category) => (
            <FilterButton
              key={category.slug}
              active={filters.category === category.slug}
              onClick={() => update({ category: category.slug })}
            >
              {category.short}
            </FilterButton>
          ))}
        </div>
      </div>

      <section className="mt-8" aria-live="polite">
        {filteredListings.length > 0 ? (
          <>
            <p className="mb-5 text-sm text-slate-500">
              <span className="font-display text-lg font-semibold text-gold-soft">{filteredListings.length}</span>{" "}
              {filteredListings.length > 1 ? "profils disponibles" : "profil disponible"}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {shown.map((listing, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  index={index % BATCH_SIZE}
                  priority={index < 4}
                  onOpen={() => setSelectedListing(listing)}
                />
              ))}
            </div>

            {remaining > 0 && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + BATCH_SIZE)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-slate-200 transition hover:border-gold/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
                >
                  <ChevronDown className="size-4" aria-hidden />
                  Afficher plus de profils ({remaining})
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-20 text-center backdrop-blur-xl">
            <SearchX className="size-7 text-gold" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-white">Aucun profil ne correspond</h2>
              <p className="mt-1 text-sm text-slate-400">Élargissez votre recherche : autre ville, autre catégorie ou budget plus large.</p>
            </div>
            <button
              type="button"
              onClick={() => update(EMPTY_FILTERS)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.12]"
            >
              <RotateCcw className="size-4" aria-hidden />
              Réinitialiser les filtres
            </button>
          </div>
        )}

        {truncated && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Les {listings.length} profils les plus récents sont proposés ici, sur {total} publiés.
          </p>
        )}
      </section>

      {selectedListing && <ProfileModal listing={selectedListing} onClose={() => setSelectedListing(null)} />}
    </>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
        active
          ? "border-gold/50 bg-gradient-to-r from-gold/20 to-neon/20 text-gold-soft shadow-[0_0_20px_-6px_rgb(255_61_129/0.8)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
