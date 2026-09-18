"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";

import { ListingCard, ListingCardSkeleton } from "@/components/listings/ListingCard";
import { useFavorites } from "@/components/listings/useFavorites";
import { createClient } from "@/lib/supabase/client";
import { LISTING_CARD_COLUMNS, type ListingCardData } from "@/types/listing";

const noopSubscribe = () => () => {};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; listings: ListingCardData[] }
  | { status: "error" };

/**
 * Favoris de cet appareil. Seuls les identifiants sont stockés localement ;
 * les fiches sont relues à jour (prix, disponibilité), et RLS n'expose que les
 * annonces publiées : un profil retiré disparaît donc de lui-même.
 */
export function FavoritesList() {
  const { ids, clear } = useFavorites();
  // Faux au rendu serveur et pendant l'hydratation : le stockage de l'appareil
  // n'est pas encore lu, afficher « aucun favori » serait un faux message.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const stateRef = useRef(state);
  stateRef.current = state;
  // Relecture uniquement quand l'ensemble change, pas à chaque rendu.
  const key = ids.join(",");

  useEffect(() => {
    if (!hydrated) return;
    if (ids.length === 0) {
      setState({ status: "ready", listings: [] });
      return;
    }
    // Un favori retiré depuis cette page : les fiches restantes sont déjà là.
    const current = stateRef.current;
    if (current.status === "ready" && ids.every((id) => current.listings.some((listing) => listing.id === id))) {
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    createClient()
      .from("listings")
      .select(LISTING_CARD_COLUMNS)
      .in("id", ids)
      .eq("status", "published")
      .returns<ListingCardData[]>()
      .then(({ data, error }) => {
        if (cancelled) return;
        setState(error ? { status: "error" } : { status: "ready", listings: data ?? [] });
      });

    return () => {
      cancelled = true;
    };
    // `key` résume `ids` : relancer sur l'identité du tableau referait la requête à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hydrated]);

  // Ordre des favoris (le plus récent d'abord), pas celui de la base.
  const ordered = useMemo(() => {
    if (state.status !== "ready") return [];
    const byId = new Map(state.listings.map((listing) => [listing.id, listing]));
    return ids.map((id) => byId.get(id)).filter((listing): listing is ListingCardData => Boolean(listing));
  }, [ids, state]);

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Chargement des favoris">
        {Array.from({ length: Math.min(ids.length || 2, 4) }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
        Impossible de charger vos favoris pour le moment. Vérifiez votre connexion puis rechargez la page.
      </p>
    );
  }

  if (ordered.length === 0) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
        <Heart className="mx-auto size-9 text-neon" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-white">Aucun favori pour l’instant</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Touchez le cœur d’un profil pour le retrouver ici.
        </p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-xl bg-action px-4 text-sm font-semibold text-slate-950">
          Découvrir les annonces
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {ordered.map((listing, index) => (
          <ListingCard key={listing.id} listing={listing} index={index} priority={index < 4} />
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="max-w-md text-xs leading-relaxed text-slate-500">
          Vos favoris sont enregistrés uniquement sur cet appareil. Ils ne sont liés à aucun compte.
        </p>
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-300 transition hover:border-neon/40 hover:text-white"
        >
          <Trash2 className="size-4" aria-hidden />
          Effacer tous mes favoris
        </button>
      </div>
    </>
  );
}
