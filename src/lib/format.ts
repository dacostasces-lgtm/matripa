import { PRICE_UNIT_LABEL, type PriceUnit } from "@/types/listing";

/**
 * Le franc CFA n'a pas de sous-unité : on force 0 décimale.
 * Le formatter est mémoïsé au niveau module (instancier `Intl` est coûteux).
 */
const xafFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 0,
});

/** Rend « 85 000 FCFA » : le libellé local, plus lisible que le code ISO XAF. */
export const formatXAF = (amount: number): string => xafFormatter.format(amount);

/** Variante compacte pour les curseurs et badges : « 150 k FCFA ». */
export const formatXAFCompact = (amount: number): string =>
  `${compactFormatter.format(amount)} FCFA`;

export const priceUnitLabel = (unit: PriceUnit): string => PRICE_UNIT_LABEL[unit];

/** « 45 000 FCFA / nuit » */
export const formatPrice = (amount: number, unit: PriceUnit): string =>
  `${formatXAF(amount)} / ${priceUnitLabel(unit)}`;

export const formatRating = (rating: number): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    rating,
  );

/** Concatène des classes conditionnelles sans dépendance externe. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");
