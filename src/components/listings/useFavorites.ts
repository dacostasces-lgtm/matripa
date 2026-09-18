"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { FAVORITES_KEY, parseFavoriteIds, toggleFavoriteId } from "@/lib/favorites";

/** Prévient les autres composants de la même page (l'événement `storage` ne vise que les autres onglets). */
const CHANGE_EVENT = "matripa:favoris-change";

function read(): string | null {
  try {
    return window.localStorage.getItem(FAVORITES_KEY);
  } catch {
    // Navigation privée stricte ou stockage désactivé : pas de favoris, pas d'erreur.
    return null;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(ids: string[]) {
  try {
    if (ids.length === 0) window.localStorage.removeItem(FAVORITES_KEY);
    else window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Favoris partagés entre toutes les cartes, la fiche rapide et la page
 * /favoris. Côté serveur (et pendant l'hydratation), la liste est vide : les
 * cœurs s'allument juste après, sans divergence d'hydratation.
 */
export function useFavorites() {
  // La chaîne brute est un instantané stable : React ne re-rend que si elle change.
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ids = useMemo(() => parseFavoriteIds(raw), [raw]);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => write(toggleFavoriteId(parseFavoriteIds(read()), id)), []);
  const clear = useCallback(() => write([]), []);

  return { ids, isFavorite, toggle, clear };
}
