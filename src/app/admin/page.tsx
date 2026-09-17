import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, MapPin, ShieldCheck, Trash2 } from "lucide-react";

import { removeReview, setCertification } from "@/app/actions/admin";
import { AdminVerificationSection } from "@/components/verification/AdminVerificationSection";
import { createClient } from "@/lib/supabase/server";
import { cx, formatXAF, priceUnitLabel } from "@/lib/format";
import type { RawSearchParams } from "@/lib/filters";
import { cityLabel, type PriceUnit } from "@/types/listing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

interface AdminReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  listing_id: string;
}

interface AdminListing {
  id: string;
  slug: string;
  title: string;
  city: string;
  price_xaf: number;
  price_unit: PriceUnit;
  cover_url: string;
  status: string;
  is_vip: boolean;
  is_verified: boolean;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const verifiedPage = Math.max(1, Number.parseInt(typeof params.verifies === "string" ? params.verifies : "1", 10) || 1);
  const supabase = await createClient();

  // `is_admin()` fait autorité côté base : la même vérification protège
  // `set_listing_certification`. Un accès direct à l'URL sans le rôle renvoie
  // 404 plutôt que 403 — inutile de signaler que la page existe.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const { data } = await supabase
    .from("listings")
    .select("id, slug, title, city, price_xaf, price_unit, cover_url, status, is_vip, is_verified")
    .order("is_verified", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<AdminListing[]>();

  // Les avis sont publiquement lisibles : aucune fonction dédiée n'est
  // nécessaire pour les afficher ici, seul leur retrait est privilégié.
  const { data: reviewData } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, listing_id")
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<AdminReview[]>();

  const listings = data ?? [];
  const reviews = reviewData ?? [];
  const titleById = new Map(listings.map((l) => [l.id, l.title]));

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8 space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-300">
            <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden />
            Administration Matripa
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Administration</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            {listings.length} profil{listings.length > 1 ? "s" : ""} au catalogue. Le badge
            « Certifié » découle de la vérification d&apos;identité du compte.
          </p>
        </header>

        <AdminVerificationSection page={verifiedPage} />

        <h2 className="mb-5 text-xl font-semibold tracking-tight text-white">Mise en avant VIP</h2>

        <ul className="space-y-3">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
                <Image src={listing.cover_url} alt="" fill sizes="64px" className="object-cover" />
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/annonces/${listing.slug}`}
                  className="line-clamp-1 text-sm font-medium text-white hover:underline"
                >
                  {listing.title}
                </Link>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  {cityLabel(listing.city)}
                  <span aria-hidden className="text-slate-600">·</span>
                  {formatXAF(listing.price_xaf)} / {priceUnitLabel(listing.price_unit)}
                  {listing.status !== "published" && (
                    <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">
                      {listing.status}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                {listing.is_verified && (
                  <span className="inline-flex h-9 items-center rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-medium text-emerald-300">
                    Certifié
                  </span>
                )}
                <Toggle listingId={listing.id} active={listing.is_vip} label="VIP" />
              </div>
            </li>
          ))}
        </ul>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-white">Modération des avis</h2>
          <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
            Le retrait est définitif et journalisé. La note de l&apos;annonce est recalculée
            automatiquement.
          </p>

          {reviews.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400 backdrop-blur-xl">
              Aucun avis publié pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
              {reviews.map((review) => (
                <li key={review.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-white">
                      {review.rating}/5 — {titleById.get(review.listing_id) ?? "Offre inconnue"}
                    </span>
                    <time dateTime={review.created_at} className="text-xs text-slate-500">
                      {new Date(review.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </div>

                  {review.comment && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                      {review.comment}
                    </p>
                  )}

                  <form action={removeReview} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="review_id" value={review.id} />
                    <label htmlFor={`reason-${review.id}`} className="sr-only">
                      Motif du retrait
                    </label>
                    <input
                      id={`reason-${review.id}`}
                      name="reason"
                      type="text"
                      maxLength={200}
                      placeholder="Motif (facultatif)"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Retirer
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Toggle({
  listingId,
  active,
  label,
}: {
  listingId: string;
  active: boolean;
  label: string;
}) {
  return (
    <form action={setCertification}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="field" value="is_vip" />
      {/* On envoie l'état *souhaité*, pas une bascule : deux clics rapides ne
          peuvent pas s'annuler mutuellement. */}
      <input type="hidden" name="value" value={active ? "false" : "true"} />
      <button
        type="submit"
        aria-pressed={active}
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition",
          active
            ? "border-transparent bg-action text-slate-950"
            : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.09] hover:text-white",
        )}
      >
        <Crown className="size-3.5" aria-hidden />
        {label}
      </button>
    </form>
  );
}
