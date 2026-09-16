"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LayoutGrid, Plus, UserRound, type LucideIcon } from "lucide-react";

import { cx } from "@/lib/format";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

/**
 * Uniquement des routes qui existent. L'administration reste absente : elle
 * renvoie 404 aux non-administrateurs, la référencer annoncerait son existence.
 * Libellés courts : ils doivent tenir sous l'icône sur un écran de 320 px.
 */
const TABS: Tab[] = [
  {
    href: "/",
    label: "Annonces",
    icon: LayoutGrid,
    isActive: (p) => p === "/" || p.startsWith("/annonces") || p.startsWith("/demande"),
  },
  {
    href: "/mes-demandes",
    label: "Demandes",
    icon: Inbox,
    isActive: (p) => p.startsWith("/mes-demandes"),
  },
  {
    href: "/compte",
    label: "Compte",
    icon: UserRound,
    isActive: (p) =>
      p.startsWith("/compte") || p.startsWith("/connexion") || p.startsWith("/mot-de-passe"),
  },
];

/**
 * Dock de navigation flottant, en bas de l'écran sur toutes les tailles.
 *
 * Trois onglets discrets, puis l'action principale — publier — traitée en or,
 * seule surface métal du dock (l'or porte l'action principale, cf. globals.css).
 *
 * Masqué sur mobile dans les fiches d'annonce : le bandeau d'action
 * (prix, WhatsApp, Contacter) y occupe déjà le bas de l'écran.
 *
 * Il ne lit pas la session : le faire depuis le layout rendrait toutes les
 * pages dynamiques. Les routes protégées redirigent d'elles-mêmes vers /connexion.
 */
export function NavigationBar() {
  const pathname = usePathname();
  const onListing = pathname.startsWith("/annonces/");
  const publishing = pathname.startsWith("/partenaire");

  return (
    <nav
      aria-label="Navigation principale"
      className={cx(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 justify-center px-3",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        onListing ? "hidden lg:flex" : "flex",
      )}
    >
      <div className="pointer-events-auto flex items-center rounded-full border border-gold/20 bg-surface-raised/90 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-2xl">
        <ul className="flex items-center">
          {TABS.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    // `pb-2` remonte icône et libellé pour laisser respirer le point actif.
                    "relative flex h-14 w-[clamp(3.75rem,19vw,4.75rem)] flex-col items-center justify-center gap-1 rounded-full pb-2",
                    "text-[11px] font-medium leading-none transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
                    active ? "text-gold-soft" : "text-slate-400 hover:text-white",
                  )}
                >
                  <Icon
                    className={cx("size-5", active && "text-gold")}
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden
                  />
                  {label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute bottom-1 size-1 rounded-full bg-gold shadow-[0_0_8px_2px_rgb(233_200_119/0.55)]"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <span aria-hidden className="mx-1.5 h-8 w-px bg-white/10" />

        <Link
          href="/partenaire"
          aria-current={publishing ? "page" : undefined}
          aria-label="Publier une annonce"
          title="Publier une annonce"
          className={cx(
            "grid size-14 place-items-center rounded-full bg-action text-slate-950",
            "shadow-[0_8px_28px_-6px_rgb(233_200_119/0.6)] transition active:scale-95 hover:brightness-110",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            "sm:flex sm:w-auto sm:gap-2 sm:px-5 sm:text-sm sm:font-semibold",
            publishing && "ring-2 ring-gold-soft/60 ring-offset-2 ring-offset-surface-raised",
          )}
        >
          <Plus className="size-6 sm:size-5" strokeWidth={2.25} aria-hidden />
          <span className="hidden sm:inline">Publier</span>
        </Link>
      </div>
    </nav>
  );
}
