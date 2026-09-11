"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { serializeFilters } from "@/lib/filters";
import { cx } from "@/lib/format";
import { CATEGORIES, type ListingFilters } from "@/types/listing";

interface Tab {
  key: string;
  href: string;
  code: string | null;
  label: string;
  title: string;
  active: boolean;
}

/**
 * Onglets de catégorie à indicateur glissant.
 *
 * Les onglets restent de vrais `<Link>` : la navigation, l'indexation et le
 * retour arrière fonctionnent sans JavaScript. L'indicateur n'est qu'un
 * enrichissement — il est mesuré après hydratation et positionné en
 * `transform`, donc composité par le GPU plutôt que recalculé en layout.
 */
export function CategoryTabs({ filters }: { filters: ListingFilters }) {
  const hrefFor = (patch: Partial<ListingFilters>) => {
    const qs = serializeFilters({ ...filters, ...patch, page: 1 });
    return qs ? `/?${qs}` : "/";
  };

  const tabs: Tab[] = [
    {
      key: "all",
      href: hrefFor({ category: null }),
      code: null,
      label: "Tout",
      title: "Toutes les catégories",
      active: filters.category === null,
    },
    ...CATEGORIES.map((category) => ({
      key: category.slug,
      href: hrefFor({ category: category.slug }),
      code: category.code,
      label: category.short,
      title: category.label,
      active: filters.category === category.slug,
    })),
  ];

  const activeIndex = tabs.findIndex((tab) => tab.active);

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const item = itemRefs.current[activeIndex];
    if (!list || !item) return;
    // Mesure relative au conteneur : le rail défile horizontalement, on ne
    // peut donc pas se fier aux coordonnées viewport.
    setIndicator({ x: item.offsetLeft, width: item.offsetWidth });
  }, [activeIndex]);

  useEffect(() => {
    measure();

    const list = listRef.current;
    if (!list) return;

    // Les libellés se replient selon la largeur : il faut remesurer à chaque
    // changement de taille, pas seulement au redimensionnement de la fenêtre.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const item of itemRefs.current) {
      if (item) observer.observe(item);
    }
    return () => observer.disconnect();
  }, [measure]);

  // Ramène l'onglet actif dans le champ de vision sur mobile.
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeIndex]);

  return (
    <nav aria-label="Catégories de profils" className="-mx-4 sm:-mx-6">
      <div
        ref={listRef}
        className="scrollbar-none relative flex gap-1 overflow-x-auto px-4 pb-0.5 sm:px-6"
      >
        {/* Indicateur glissant, purement décoratif. */}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0.5 left-0 top-0 z-0 rounded-full border border-white/15 bg-white/[0.09] backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.x}px)`,
            }}
          />
        )}

        {tabs.map((tab, index) => (
          <Link
            key={tab.key}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            href={tab.href}
            title={tab.title}
            scroll={false}
            aria-current={tab.active ? "page" : undefined}
            className={cx(
              "relative z-10 inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4",
              "text-sm font-medium transition-colors duration-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
              tab.active ? "text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {tab.code && (
              <span
                className={cx(
                  "grid size-5 place-items-center rounded-md text-[10px] font-bold transition-colors",
                  tab.active
                    ? "bg-gold/20 text-gold-soft"
                    : "bg-white/[0.06] text-slate-500",
                )}
                aria-hidden
              >
                {tab.code}
              </span>
            )}
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
