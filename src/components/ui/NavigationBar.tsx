"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LayoutGrid, Store, UserRound, type LucideIcon } from "lucide-react";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

/**
 * Uniquement des routes qui existent. L'administration reste absente : elle
 * renvoie 404 aux non-administrateurs, la référencer annoncerait son existence.
 */
const LINKS: NavLink[] = [
  {
    href: "/",
    label: "Annonces",
    icon: LayoutGrid,
    isActive: (p) => p === "/" || p.startsWith("/annonces") || p.startsWith("/demande"),
  },
  {
    href: "/mes-demandes",
    label: "Mes demandes",
    icon: Inbox,
    isActive: (p) => p.startsWith("/mes-demandes"),
  },
  {
    href: "/compte",
    label: "Mon compte",
    icon: UserRound,
    isActive: (p) => p.startsWith("/compte"),
  },
];

/**
 * Barre globale, rendue par le layout racine.
 *
 * Volontairement non collante : sur l'accueil, c'est la barre de recherche et
 * de filtres qui occupe le haut de l'écran au défilement. Empiler les deux
 * mangerait plus d'un quart de la hauteur d'un téléphone.
 *
 * Elle ne lit pas la session : le faire depuis le layout rendrait toutes les
 * pages dynamiques et annulerait leur mise en cache. Les routes protégées
 * redirigent d'elles-mêmes vers /connexion.
 */
export function NavigationBar() {
  const pathname = usePathname();

  // L'espace partenaire a son propre en-tête (création de profil, déconnexion).
  if (pathname.startsWith("/partenaire")) return null;

  return (
    <header className="border-b border-gold bg-surface/95 pt-[env(safe-area-inset-top)]">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="rounded-md font-display text-xl font-semibold tracking-wide text-white transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          Matripa
        </Link>

        <ul className="flex items-center gap-1 sm:gap-2">
          {LINKS.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 sm:px-3 ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon className={`size-4 ${active ? "text-gold" : ""}`} aria-hidden />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </Link>
              </li>
            );
          })}

          <li className="ml-1">
            <Link
              href="/partenaire"
              className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 sm:px-3.5"
            >
              <Store className="size-4" aria-hidden />
              <span className="sr-only md:not-sr-only">Publier une annonce</span>
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
