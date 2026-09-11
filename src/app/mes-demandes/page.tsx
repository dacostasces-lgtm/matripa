import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Inbox, MapPin, Star } from "lucide-react";

import { PaymentForm } from "@/components/payments/PaymentForm";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { createClient } from "@/lib/supabase/server";
import { cx, formatRating, formatXAF, priceUnitLabel } from "@/lib/format";
import { cityLabel, type PriceUnit } from "@/types/listing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mes demandes",
  robots: { index: false, follow: false },
};

interface MyRequest {
  id: string;
  status: string;
  message: string;
  desired_date: string | null;
  created_at: string;
  listing: {
    slug: string;
    title: string;
    city: string;
    cover_url: string;
    price_xaf: number;
    price_unit: PriceUnit;
  } | null;
}

interface MyPayment {
  request_id: string;
  status: string;
  amount_xaf: number;
}

interface MyReview {
  request_id: string;
  rating: number;
  comment: string;
}

export default async function MesDemandesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/mes-demandes");

  // `requests_author_read` borne déjà la lecture à l'auteur, mais le filtre
  // explicite reste la règle du projet : les policies se combinent en OU et
  // celle du partenaire s'appliquerait aussi à un partenaire-client.
  const [{ data: requests }, { data: reviews }, { data: payments }] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, status, message, desired_date, created_at, listing:listings(slug, title, city, cover_url, price_xaf, price_unit)",
      )
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .returns<MyRequest[]>(),
    supabase
      .from("reviews")
      .select("request_id, rating, comment")
      .eq("author_id", user.id)
      .returns<MyReview[]>(),
    supabase
      .from("payments")
      .select("request_id, status, amount_xaf")
      .eq("payer_id", user.id)
      .returns<MyPayment[]>(),
  ]);

  const mine = requests ?? [];
  const reviewByRequest = new Map((reviews ?? []).map((r) => [r.request_id, r]));
  const paymentByRequest = new Map((payments ?? []).map((p) => [p.request_id, p]));

  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Mes demandes</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Une fois la prestation confirmée par le partenaire, vous pouvez la noter.
          </p>
        </header>

        {mine.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-14 text-center backdrop-blur-xl">
            <div className="grid size-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
              <Inbox className="size-5 text-zinc-400" aria-hidden />
            </div>
            <div className="space-y-1">
              <h2 className="font-medium text-white">Aucune demande pour l&apos;instant</h2>
              <p className="mx-auto max-w-sm text-sm text-zinc-400">
                Les demandes que vous envoyez depuis une offre apparaîtront ici.
              </p>
            </div>
            <Link
              href="/"
              className="mt-1 inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-rose-500 to-violet-600 px-5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Explorer les profils
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {mine.map((request) => {
              const review = reviewByRequest.get(request.id);
              const payment = paymentByRequest.get(request.id);

              return (
                <li
                  key={request.id}
                  className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl"
                >
                  <div className="flex gap-4">
                    {request.listing && (
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                        <Image
                          src={request.listing.cover_url}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <StatusPill status={request.status} />

                      {request.listing ? (
                        <Link
                          href={`/annonces/${request.listing.slug}`}
                          className="block font-medium leading-snug text-white hover:underline"
                        >
                          {request.listing.title}
                        </Link>
                      ) : (
                        <p className="font-medium text-zinc-400">Profil retiré</p>
                      )}

                      {request.listing && (
                        <p className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
                          <MapPin className="size-3 shrink-0" aria-hidden />
                          {cityLabel(request.listing.city)}
                          <span aria-hidden className="text-zinc-600">·</span>
                          {formatXAF(request.listing.price_xaf)} /{" "}
                          {priceUnitLabel(request.listing.price_unit)}
                        </p>
                      )}

                      {request.desired_date && (
                        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <CalendarCheck className="size-3 shrink-0" aria-hidden />
                          Date souhaitée :{" "}
                          {new Date(request.desired_date).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Le paiement s'ouvre dès que le partenaire a pris contact :
                      régler avant tout échange n'aurait pas de sens, et
                      attendre la confirmation serait trop tard. */}
                  {request.listing &&
                    !payment &&
                    (request.status === "contacted" || request.status === "confirmed") && (
                      <PaymentForm requestId={request.id} amountXaf={request.listing.price_xaf} />
                    )}

                  {payment && <PaymentStatus status={payment.status} amountXaf={payment.amount_xaf} />}

                  {review ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-white">
                        <Star className="size-4 fill-amber-300 text-amber-300" aria-hidden />
                        {formatRating(review.rating)} — votre avis
                      </p>
                      {review.comment && (
                        <p className="whitespace-pre-line text-sm text-zinc-300">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ) : request.status === "confirmed" ? (
                    <ReviewForm requestId={request.id} />
                  ) : (
                    <p className="text-xs text-zinc-500">
                      La notation s&apos;ouvrira une fois la prestation confirmée par le
                      partenaire.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-amber-500/15 text-amber-300" },
    contacted: { label: "Contacté", className: "bg-sky-500/15 text-sky-300" },
    confirmed: { label: "Confirmée", className: "bg-emerald-500/15 text-emerald-300" },
    cancelled: { label: "Annulée", className: "bg-zinc-500/15 text-zinc-400" },
  };
  const { label, className } = map[status] ?? map.pending;

  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}

function PaymentStatus({ status, amountXaf }: { status: string; amountXaf: number }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Paiement initié", className: "border-slate-400/30 bg-slate-500/10 text-slate-200" },
    processing: {
      label: "Paiement en attente de votre validation sur le téléphone",
      className: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    },
    completed: {
      label: "Paiement reçu",
      className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    },
    failed: {
      label: "Paiement échoué — vous pouvez réessayer",
      className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    },
  };
  const { label, className } = map[status] ?? map.pending;

  return (
    <p className={cx("rounded-xl border px-4 py-3 text-sm", className)}>
      {label} — {formatXAF(amountXaf)}
    </p>
  );
}
