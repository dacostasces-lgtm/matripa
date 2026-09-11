import Link from "next/link";
import { Globe2, MapPin } from "lucide-react";

import { serializeFilters } from "@/lib/filters";
import { cx } from "@/lib/format";
import { CITIES, type ListingFilters } from "@/types/listing";

/**
 * Sélecteur de ville. Rendu en Server Component avec de vrais `<Link>` :
 * indexable, fonctionnel sans JS, et préchargé par le router.
 *
 * Brazzaville et Pointe-Noire ouvrent la liste — elles concentrent l'essentiel
 * du catalogue, et un utilisateur qui arrive sur l'accueil cherche presque
 * toujours l'une des deux.
 */
export function CityNav({ filters }: { filters: ListingFilters }) {
  // Changer de portée réinitialise la pagination.
  const hrefFor = (patch: Partial<ListingFilters>) => {
    const qs = serializeFilters({ ...filters, ...patch, page: 1 });
    return qs ? `/?${qs}` : "/";
  };

  return (
    <nav
      aria-label="Villes"
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6"
    >
      <CityPill href={hrefFor({ city: null })} active={filters.city === null}>
        <Globe2 className="size-4" aria-hidden />
        Tout le Congo
      </CityPill>

      {CITIES.map((city) => (
        <CityPill
          key={city.slug}
          href={hrefFor({ city: city.slug })}
          active={filters.city === city.slug}
        >
          <MapPin className="size-4" aria-hidden />
          {city.label}
        </CityPill>
      ))}
    </nav>
  );
}

function CityPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      scroll={false}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border",
        "px-4 text-sm font-medium transition duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
        active
          ? // La ville active est le seul repère « plein » de la barre : elle
            // porte l'or, tout le reste reste en verre.
            "border-gold/40 bg-gold/12 text-gold-soft shadow-[0_4px_22px_-10px_rgb(233_200_119/0.8)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 backdrop-blur-md hover:border-white/20 hover:bg-white/[0.09] hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}
