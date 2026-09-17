import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";

import { ReportForm } from "@/components/reports/ReportForm";
import { fetchListingBySlug } from "@/lib/listings";
import { createClient } from "@/lib/supabase/server";
import { cityLabel } from "@/types/listing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signaler un profil",
  robots: { index: false, follow: false },
};

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signalement réservé aux comptes connectés : retour au formulaire après connexion.
  if (!user) redirect(`/connexion?suivant=/signaler/${encodeURIComponent(slug)}`);

  // Lecture publique : un profil suspendu, masqué ou archivé n'est pas signalable.
  const listing = await fetchListingBySlug(slug);
  if (!listing) notFound();

  // Filtre `owner_id` explicite : `listings_public_read` rend l'annonce lisible
  // par tous, seule la correspondance du propriétaire compte ici.
  const { data: own } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listing.id)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string }>();

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href={`/annonces/${listing.slug}`}
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour au profil
        </Link>

        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-white">Signaler un profil</h1>

        <div className="mb-8 flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
            <Image src={listing.cover_url} alt={listing.title} fill sizes="80px" className="object-cover" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="line-clamp-2 font-semibold text-white">{listing.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {cityLabel(listing.city)}
            </p>
          </div>
        </div>

        {own ? (
          <p role="status" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
            Vous ne pouvez pas signaler votre propre profil.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
            <ReportForm listingId={listing.id} listingSlug={listing.slug} />
          </div>
        )}
      </div>
    </main>
  );
}
