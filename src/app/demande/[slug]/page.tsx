import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Crown, MapPin } from "lucide-react";

import { RequestForm } from "@/components/requests/RequestForm";
import { VerifiedBadge, VipBadge } from "@/components/ui/badges";
import { fetchListingBySlug } from "@/lib/listings";
import { createClient } from "@/lib/supabase/server";
import { formatXAF, priceUnitLabel } from "@/lib/format";
import { cityLabel } from "@/types/listing";

interface RequestPageProps {
  params: Promise<{ slug: string }>;
  /**
   * `?pass=vip` est posé par le bouton « Contacter avec le Pass VIP ». Il ne
   * change rien au traitement de la demande — il sert à ne pas rompre le fil :
   * un utilisateur qui vient de voir un solde et un montant doit retrouver ce
   * contexte, sinon le bouton promet une expérience que cette page ne tient pas.
   */
  searchParams: Promise<{ pass?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Effectuer une demande",
  // Page transactionnelle : aucun intérêt à l'indexer.
  robots: { index: false, follow: false },
};

export default async function RequestPage({ params, searchParams }: RequestPageProps) {
  const { slug } = await params;
  const { pass } = await searchParams;
  const listing = await fetchListingBySlug(slug);

  if (!listing) notFound();

  const viaVipPass = (Array.isArray(pass) ? pass[0] : pass) === "vip";

  // `submit_request` rattache la demande à la session quand il y en a une :
  // c'est ce rattachement qui ouvrira ensuite le droit à un avis.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href={`/annonces/${listing.slug}`}
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour au profil
        </Link>

        {/* Rappel du profil : l'utilisateur doit savoir qui il contacte. */}
        <div className="mb-8 flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl sm:size-24">
            <Image
              src={listing.cover_url}
              alt={listing.title}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {listing.is_vip && <VipBadge />}
              {listing.is_verified && <VerifiedBadge />}
            </div>

            <h1 className="line-clamp-2 text-balance font-semibold leading-snug text-white">
              {listing.title}
            </h1>

            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {cityLabel(listing.city)}
              <span aria-hidden className="text-slate-600">·</span>
              <span className="font-medium text-slate-200">
                {formatXAF(listing.price_xaf)} / {priceUnitLabel(listing.price_unit)}
              </span>
            </p>
          </div>
        </div>

        {/*
          Le libellé reprend mot pour mot celui de la feuille Pass VIP : c'est
          la continuité du message qui rassure, pas une nouvelle promesse. Rien
          n'est affirmé ici que le back-office ne tienne déjà.
        */}
        {viaVipPass && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-neon/25 bg-neon/[0.07] p-4 backdrop-blur-xl">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-neon/15 ring-1 ring-neon/30"
            >
              <Crown className="size-4 text-neon-soft" />
            </span>
            <p className="text-sm leading-relaxed text-slate-300">
              <span className="font-medium text-white">Demande via le Pass VIP.</span> Aucun
              montant n&apos;a été débité : votre demande est transmise au partenaire, qui
              confirme la disponibilité avant tout paiement.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
          <h2 className="mb-1.5 text-xl font-semibold tracking-tight text-white">
            Effectuer une demande
          </h2>
          <p className="mb-7 text-sm leading-relaxed text-slate-400">
            Renseignez vos coordonnées : Matripa transmet votre demande au profil concerné, qui
            confirme sa disponibilité avant tout échange.
          </p>

          <RequestForm
            listingId={listing.id}
            listingSlug={listing.slug}
            listingTitle={listing.title}
            isAuthenticated={user !== null}
          />
        </div>
      </div>
    </main>
  );
}
