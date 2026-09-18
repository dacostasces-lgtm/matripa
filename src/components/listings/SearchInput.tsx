"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { serializeFilters } from "@/lib/filters";
import { cx } from "@/lib/format";
import type { ListingFilters } from "@/types/listing";

const DEBOUNCE_MS = 350;
/** Filtrage local : pas de requête à économiser, juste la frappe à laisser respirer. */
const INSTANT_DEBOUNCE_MS = 120;

interface SearchInputProps {
  filters: ListingFilters;
  /**
   * Mode instantané (explorateur de l'accueil) : la saisie est remontée au
   * parent au lieu de déclencher une navigation serveur.
   */
  onQueryChange?: (query: string | null) => void;
}

export function SearchInput({ filters, onQueryChange }: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(filters.query ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Resynchronise sur changement externe (retour arrière, reset des filtres),
  // sans écraser la frappe en cours : « villa » ≠ « villa  » ne doit pas
  // supprimer l'espace que l'utilisateur vient de taper.
  useEffect(() => {
    setValue((current) => (current.trim() === (filters.query ?? "") ? current : filters.query ?? ""));
  }, [filters.query]);

  const submit = (query: string) => {
    const next = query.trim();
    if (next === (filters.query ?? "")) return;

    if (onQueryChange) {
      onQueryChange(next || null);
      return;
    }

    startTransition(() => {
      const qs = serializeFilters({ ...filters, query: next || null, page: 1 });
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // Debounce : on ne pousse une entrée d'historique qu'à la pause de frappe.
  useEffect(() => {
    const timer = setTimeout(() => submit(value), onQueryChange ? INSTANT_DEBOUNCE_MS : DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clear = () => {
    setValue("");
    inputRef.current?.focus();
  };

  return (
    <search className="relative">
      <label htmlFor="listing-search" className="sr-only">
        Rechercher un profil
      </label>

      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        aria-hidden
      />

      <input
        ref={inputRef}
        id="listing-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit(value);
          }
          if (event.key === "Escape") clear();
        }}
        placeholder="Prénom, ville, prestation…"
        maxLength={80}
        className={cx(
          "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-11 pr-11",
          "text-sm text-white placeholder:text-slate-600 backdrop-blur-xl transition",
          "focus:border-neon/40 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-neon/25",
          // Masque la croix native de Safari/Chrome, remplacée par la nôtre.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {isPending ? (
          <Loader2 className="size-4 animate-spin text-slate-500" aria-label="Recherche" />
        ) : (
          value && (
            <button
              type="button"
              onClick={clear}
              aria-label="Effacer la recherche"
              className="grid size-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          )
        )}
      </div>
    </search>
  );
}
