import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Languages,
  MapPin,
  MessageCircle,
  Star,
  Tag,
} from "lucide-react";

import { ListingCard } from "@/components/listings/ListingCard";
import { ListingMedia } from "@/components/listings/ListingMedia";
import { PrivateGallery } from "@/components/listings/PrivateGallery";
import { StickyActionBar } from "@/components/listings/StickyActionBar";
import { WhatsAppDirectButton } from "@/components/listings/WhatsAppDirectButton";
import {
  AvailableNowPill,
  BoostBadge,
  GlassTag,
  VerifiedBadge,
  VideoBadge,
  VipBadge,
} from "@/components/ui/badges";
import { createPublicClient } from "@/lib/supabase/public";
import {
  fetchListingBySlug,
  fetchListingReviews,
  fetchRelatedListings,
  type ListingReview,
} from "@/lib/listings";
import { formatRating, formatXAF, priceUnitLabel } from "@/lib/format";
import {
  categoryShort,
  cityLabel,
  mobilityLabel,
  optionLabel,
  type Listing,
} from "@/types/listing";

/** Fiche publique : mêmes lectures sans cookies que le fil, donc cachable. */
export const revalidate = 300;

/**
 * Sans cette fonction, Next ne peut prérendre aucun chemin et bascule la route
 * en rendu dynamique : chaque visite repart alors jusqu'à la région
 * d'exécution. Avec elle, les fiches sont prérendues puis servies depuis le
 * cache edge le plus proche — ce qui, pour des utilisateurs en Afrique
 * centrale, supprime un aller-retour vers l'Europe.
 *
 * `dynamicParams` reste à sa valeur par défaut : une annonce publiée après le
 * build est rendue à la demande, puis mise en cache à son tour.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const supabase = createPublicClient();

    const { data } = await supabase
      .from("listings")
      .select("slug")
      .eq("status", "published")
      .limit(500)
      .returns<{ slug: string }[]>();

    return data ?? [];
  } catch (error) {
    // Un build ne doit pas échouer parce que la base est momentanément
    // injoignable : on retombe sur le rendu à la demande.
    console.warn("[annonces] generateStaticParams indisponible", error);
    return [];
  }
}

// Next.js 15 : `params` est également une Promise.
interface DetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const listing = await fetchListingBySlug((await params).slug);
  if (!listing) return { title: "Profil introuvable — Matripa" };

  return {
    title: `${listing.title} · ${cityLabel(listing.city)} — Matripa`,
    description: listing.description.slice(0, 155),
    openGraph: { images: [listing.cover_url] },
  };
}

export default async function ListingDetailPage({ params }: DetailPageProps) {
  const { slug } = await params;
  const listing = await fetchListingBySlug(slug);

  if (!listing) notFound();

  const [related, reviews] = await Promise.all([
    fetchRelatedListings(listing),
    fetchListingReviews(listing.id),
  ]);

  return (
    <main className="min-h-dvh bg-slate-950 pb-32 text-slate-100 lg:pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        <Link
          href="/"
          className="mb-5 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux profils
        </Link>

        <ListingMedia
          images={[listing.cover_url, ...listing.images]}
          videoUrl={listing.video_url}
          videoPosterUrl={listing.video_poster_url}
          title={listing.title}
        />
        {/* Sentinelle observée par le bandeau d'action mobile. */}
        <div id="listing-gallery-anchor" aria-hidden className="h-px" />

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="min-w-0 space-y-10">
            <Header listing={listing} />

            <Section title="Description">
              <p className="whitespace-pre-line text-pretty leading-relaxed text-slate-300">
                {listing.description}
              </p>
            </Section>

            {/* Galerie privée : affichée seulement quand l'annonce a de vrais
                médias. Tant que le déblocage n'est pas relié à un paiement
                réel, aucune donnée de démonstration ne doit apparaître. */}
            {listing.private_media && listing.private_media.length > 0 && (
              <Section title="Galerie Privée & Médias Exclusifs">
                <PrivateGallery listingTitle={listing.title} items={listing.private_media} />
              </Section>
            )}

            <Section title="Profil">
              <div className="flex flex-wrap gap-2">
                <GlassTag>
                  <Tag className="size-3.5 text-gold" aria-hidden />
                  {categoryShort(listing.category)}
                </GlassTag>
                <GlassTag>{optionLabel(listing.option_type)}</GlassTag>
                <GlassTag>
                  <MapPin className="size-3.5 text-neon" aria-hidden />
                  {mobilityLabel(listing.mobility)}
                </GlassTag>
              </div>
            </Section>

            {listing.amenities.length > 0 && (
              <Section title="Services et préférences">
                {/* Grille plutôt que puces libres : au-delà de six éléments,
                    une rangée qui se replie devient illisible en balayage. */}
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {listing.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 backdrop-blur-md"
                    >
                      <span
                        aria-hidden
                        className="grid size-5 shrink-0 place-items-center rounded-full bg-gold/15 ring-1 ring-gold/25"
                      >
                        <Check className="size-3 text-gold" />
                      </span>
                      {amenity}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {listing.availability.length > 0 && (
              <Section title="Disponibilités">
                <div className="flex flex-wrap gap-2">
                  {listing.availability.map((slot) => (
                    <GlassTag key={slot}>
                      <CalendarCheck className="size-3.5 text-emerald-400" aria-hidden />
                      {slot}
                    </GlassTag>
                  ))}
                </div>
              </Section>
            )}

            {listing.languages.length > 0 && (
              <Section title="Langues">
                <div className="flex flex-wrap gap-2">
                  {listing.languages.map((language) => (
                    <GlassTag key={language}>
                      <Languages className="size-3.5 text-sky-400" aria-hidden />
                      {language}
                    </GlassTag>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Tarifs">
              <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                {listing.rates.map((rate) => (
                  <li
                    key={`${rate.label}-${rate.unit}`}
                    className="flex items-center justify-between gap-4 px-4 py-3.5"
                  >
                    <span className="text-sm text-slate-300">{rate.label}</span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatXAF(rate.amount_xaf)}
                      <span className="ml-1 font-normal text-slate-500">
                        / {priceUnitLabel(rate.unit)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={`Avis${listing.reviews_count > 0 ? ` (${listing.reviews_count})` : ""}`}>
              <ReviewList reviews={reviews} />
            </Section>
          </div>

          {/* Panneau de mise en relation : sticky sur desktop, remplacé par le
              bandeau fixe en dessous de `lg`. */}
          <aside className="hidden lg:sticky lg:top-6 lg:block">
            <BookingPanel listing={listing} />
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 text-xl font-semibold tracking-tight text-white">
              Profils similaires à {cityLabel(listing.city)}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {related.map((item) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </section>
        )}
      </div>

      <StickyActionBar
        listingSlug={listing.slug}
        listingTitle={listing.title}
        priceXaf={listing.price_xaf}
        priceUnit={listing.price_unit}
        whatsappPhone={listing.whatsapp_phone}
      />
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function Header({ listing }: { listing: Listing }) {
  const isBoosted = listing.boosted_until
    ? new Date(listing.boosted_until).getTime() > Date.now()
    : false;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isBoosted && <BoostBadge size="md" />}
        {listing.is_vip && <VipBadge size="md" />}
        {listing.is_verified && <VerifiedBadge size="md" label="Compte certifié" />}
        {listing.video_url && <VideoBadge size="md" />}
        {listing.is_available_now && <AvailableNowPill />}
      </div>

      <h1 className="text-balance font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
        {listing.title}
      </h1>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4" aria-hidden />
          {cityLabel(listing.city)}
          {listing.district && ` · ${listing.district}`}
        </span>

        {listing.rating !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Star className="size-4 fill-gold text-gold" aria-hidden />
            <span className="font-medium text-white">{formatRating(listing.rating)}</span>
            <span>({listing.reviews_count} avis)</span>
          </span>
        )}

        {listing.highlight && <span className="text-slate-300">{listing.highlight}</span>}
      </div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function BookingPanel({ listing }: { listing: Listing }) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">À partir de</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-semibold leading-none tracking-tight text-gold-soft">
            {formatXAF(listing.price_xaf)}
          </span>
          <span className="text-sm text-slate-400">/ {priceUnitLabel(listing.price_unit)}</span>
        </p>
      </div>

      {/* WhatsApp direct instantané */}
      <WhatsAppDirectButton
        phone={listing.whatsapp_phone}
        listingTitle={listing.title}
        city={listing.city}
      />

      <Link
        href={`/demande/${listing.slug}`}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110 active:scale-[0.99]"
      >
        <MessageCircle className="size-4" aria-hidden />
        Effectuer une demande formelle
      </Link>

      {/* Pass VIP retiré de l'affichage : son portefeuille était simulé.
          À réintroduire une fois relié à un paiement réel (pawaPay). */}

      <p className="text-center text-xs leading-relaxed text-slate-500">
        Discrétion totale garantie. Vos coordonnées ne sont transmises qu&apos;après confirmation
        mutuelle.
      </p>
    </div>
  );
}

function ReviewList({ reviews }: { reviews: ListingReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-400 backdrop-blur-xl">
        Aucun avis pour le moment. Seuls les clients dont la prestation a été confirmée peuvent
        en déposer un.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      {reviews.map((review) => (
        <li key={review.id} className="space-y-1.5 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-0.5" aria-label={`${review.rating} sur 5`}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Star
                  key={value}
                  className={
                    value <= review.rating
                      ? "size-3.5 fill-amber-300 text-amber-300"
                      : "size-3.5 text-zinc-700"
                  }
                  aria-hidden
                />
              ))}
            </span>
            <time
              dateTime={review.created_at}
              className="text-xs text-zinc-500"
            >
              {new Date(review.created_at).toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </time>
          </div>

          {review.comment && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
              {review.comment}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
