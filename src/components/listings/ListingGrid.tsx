import Link from "next/link";
import { SearchX } from "lucide-react";

import { ListingCard, ListingCardSkeleton } from "@/components/listings/ListingCard";
import { fetchListings } from "@/lib/listings";
import { serializeFilters } from "@/lib/filters";
import { PAGE_SIZE, type ListingFilters } from "@/types/listing";

const GRID =
  "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";

/** Nombre de cartes préchargées en priorité : la première rangée sur desktop. */
const PRIORITY_COUNT = 4;

export async function ListingGrid({ filters }: { filters: ListingFilters }) {
  const { listings, total, hasMore } = await fetchListings(filters);

  if (listings.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-500">
        <span className="font-display text-lg font-semibold text-gold-soft">{total}</span>{" "}
        {total > 1 ? "profils disponibles" : "profil disponible"}
      </p>

      <div className={GRID}>
        {listings.map((listing, index) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            index={index}
            priority={index < PRIORITY_COUNT}
          />
        ))}
      </div>

      <Pagination filters={filters} total={total} hasMore={hasMore} />
    </div>
  );
}

export function ListingGridSkeleton() {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: PAGE_SIZE / 2 }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-20 text-center backdrop-blur-xl">
      <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-gold/15 to-neon/20 ring-1 ring-white/10">
        <SearchX className="size-6 text-gold" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-white">Aucun profil ne correspond</h2>
        <p className="mx-auto max-w-sm text-sm text-slate-400">
          Élargissez votre budget ou explorez une autre ville pour découvrir davantage de
          profils.
        </p>
      </div>
      <Link
        href="/"
        className="mt-1 inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
      >
        Réinitialiser la recherche
      </Link>
    </div>
  );
}

function Pagination({
  filters,
  total,
  hasMore,
}: {
  filters: ListingFilters;
  total: number;
  hasMore: boolean;
}) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (lastPage === 1) return null;

  const hrefForPage = (page: number) => {
    const qs = serializeFilters({ ...filters, page });
    return qs ? `/?${qs}` : "/";
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-2">
      <PageLink href={hrefForPage(filters.page - 1)} disabled={filters.page <= 1}>
        Précédent
      </PageLink>
      <span className="text-sm tabular-nums text-slate-500">
        {filters.page} / {lastPage}
      </span>
      <PageLink href={hrefForPage(filters.page + 1)} disabled={!hasMore}>
        Suivant
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className="inline-flex h-10 cursor-not-allowed items-center rounded-xl border border-white/5 px-4 text-sm text-slate-600"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] hover:text-white"
    >
      {children}
    </Link>
  );
}
