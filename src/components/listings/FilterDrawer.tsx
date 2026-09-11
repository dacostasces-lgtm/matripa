"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, RotateCcw, SlidersHorizontal, Wallet, X } from "lucide-react";

import { Portal } from "@/components/ui/Portal";
import { activeFilterCount, serializeFilters } from "@/lib/filters";
import { cx, formatXAFCompact } from "@/lib/format";
import {
  MOBILITIES,
  OPTION_TYPES,
  PRICE_BOUNDS,
  type ListingFilters,
  type Mobility,
  type OptionType,
} from "@/types/listing";

/**
 * Filtres avancés en tiroir latéral.
 *
 * Le brouillon est local au tiroir et n'est poussé dans l'URL qu'à la
 * validation : sur une connexion lente, appliquer chaque coche relancerait une
 * requête serveur à chaque geste. L'URL reste la source de vérité — partageable
 * et restaurable au retour arrière.
 */
export function FilterDrawer({ filters }: { filters: ListingFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  // Resynchronise sur navigation externe (retour arrière, clic sur une ville).
  useEffect(() => setDraft(filters), [filters]);

  const push = useCallback(
    (next: ListingFilters) => {
      startTransition(() => {
        const qs = serializeFilters({ ...next, page: 1 });
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const apply = () => {
    push(draft);
    setOpen(false);
  };

  const reset = () => {
    const cleared: ListingFilters = {
      ...draft,
      option_type: null,
      mobility: null,
      price_max: null,
      query: null,
    };
    setDraft(cleared);
    push(cleared);
  };

  const count = activeFilterCount(filters);
  const draftCount = activeFilterCount(draft);

  /** Bascule : re-cliquer sur un critère actif le retire. */
  const toggle = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) =>
    setDraft((current) => ({ ...current, [key]: current[key] === value ? null : value }));

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cx(
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4",
            "text-sm font-medium transition duration-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
            count > 0
              ? "border-neon/40 bg-neon/12 text-neon-soft"
              : "border-white/10 bg-white/[0.04] text-slate-200 backdrop-blur-md hover:bg-white/[0.09] hover:text-white",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtres
          {count > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-action text-[11px] font-bold text-slate-950">
              {count}
            </span>
          )}
        </button>

        {isPending && (
          <Loader2 className="size-4 animate-spin text-slate-500" aria-label="Chargement" />
        )}

        {count > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Réinitialiser</span>
          </button>
        )}
      </div>

      {open && (
        <Portal>
          <DrawerPanel
            draft={draft}
            draftCount={draftCount}
            onClose={() => setOpen(false)}
            onToggle={toggle}
            onPriceChange={(price_max) => setDraft((current) => ({ ...current, price_max }))}
            onReset={reset}
            onApply={apply}
          />
        </Portal>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

interface DrawerPanelProps {
  draft: ListingFilters;
  draftCount: number;
  onClose: () => void;
  onToggle: <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) => void;
  onPriceChange: (value: number | null) => void;
  onReset: () => void;
  onApply: () => void;
}

function DrawerPanel({
  draft,
  draftCount,
  onClose,
  onToggle,
  onPriceChange,
  onReset,
  onApply,
}: DrawerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Piège à focus : sans lui, la tabulation repart dans le fil masqué
      // derrière le voile, ce qui rend le tiroir inutilisable au clavier.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onClose}
        className="drawer-veil absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filtres avancés"
        className={cx(
          "drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col",
          "border-l border-white/10 bg-surface-raised/95 backdrop-blur-2xl",
          "shadow-[-24px_0_60px_-24px_rgb(0_0_0/1)]",
        )}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Affiner la recherche</h2>
            <p className="text-xs text-slate-500">
              {draftCount === 0
                ? "Aucun critère actif"
                : `${draftCount} critère${draftCount > 1 ? "s" : ""} sélectionné${draftCount > 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer les filtres"
            className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6">
          <Group label="Type de prestation" hint="Formule contractuelle proposée par le partenaire">
            {OPTION_TYPES.map((option) => (
              <Chip
                key={option.slug}
                active={draft.option_type === option.slug}
                onClick={() => onToggle("option_type", option.slug as OptionType)}
              >
                {option.label}
              </Chip>
            ))}
          </Group>

          <Group label="Mobilité" hint="Lieu d'exécution de la prestation">
            {MOBILITIES.map((mobility) => (
              <Chip
                key={mobility.slug}
                active={draft.mobility === mobility.slug}
                onClick={() => onToggle("mobility", mobility.slug as Mobility)}
              >
                {mobility.label}
              </Chip>
            ))}
          </Group>

          <BudgetSlider value={draft.price_max} onChange={onPriceChange} />
        </div>

        <footer className="flex items-center gap-3 border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <RotateCcw className="size-4" aria-hidden />
            Effacer
          </button>
          <button
            type="button"
            onClick={onApply}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-action text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-12px_rgb(255_61_129/0.9)] transition hover:brightness-110 active:scale-[0.99]"
          >
            Afficher les offres
          </button>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </legend>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "h-10 rounded-xl border px-4 text-sm font-medium transition duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70",
        active
          ? "border-neon/50 bg-neon/15 text-neon-soft shadow-[0_4px_20px_-8px_rgb(255_61_129/0.9)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.09] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Tarif maximum en XAF. Le brouillon étant local au tiroir, le curseur peut
 * être piloté en continu sans déclencher la moindre navigation.
 */
function BudgetSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const current = value ?? PRICE_BOUNDS.max;
  const isMax = current >= PRICE_BOUNDS.max;
  const percent = (current / PRICE_BOUNDS.max) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor="price-max"
          className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500"
        >
          Tarif maximum
        </label>
        <span className="inline-flex items-center gap-1.5 font-display text-lg font-semibold text-gold-soft">
          <Wallet className="size-4 text-gold" aria-hidden />
          {isMax ? "Illimité" : formatXAFCompact(current)}
        </span>
      </div>

      <input
        id="price-max"
        type="range"
        min={PRICE_BOUNDS.min}
        max={PRICE_BOUNDS.max}
        step={PRICE_BOUNDS.step}
        value={current}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Le maximum vaut « pas de plafond » : on l'enregistre comme absence
          // de filtre plutôt que comme une borne, pour garder l'URL propre.
          onChange(next >= PRICE_BOUNDS.max ? null : next);
        }}
        aria-valuetext={isMax ? "Tarif illimité" : formatXAFCompact(current)}
        className="range-premium w-full"
        style={{ "--range-percent": `${percent}%` } as React.CSSProperties}
      />

      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{formatXAFCompact(PRICE_BOUNDS.min)}</span>
        <span>{formatXAFCompact(PRICE_BOUNDS.max)}+</span>
      </div>
    </div>
  );
}
