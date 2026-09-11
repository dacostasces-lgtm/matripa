import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, CheckCircle2, Eye, EyeOff, Inbox, MapPin, Pencil, Phone, Plus } from "lucide-react";

import { setListingStatus } from "@/app/actions/listings";
import { setRequestStatus } from "@/app/actions/requests";
import { VerifiedBadge, VipBadge } from "@/components/ui/badges";
import { createClient } from "@/lib/supabase/server";
import { cx, formatXAF, priceUnitLabel } from "@/lib/format";
import { cityLabel, type PriceUnit } from "@/types/listing";
import type { RawSearchParams } from "@/lib/filters";

export const dynamic = "force-dynamic";

interface OwnListing {
  id: string;
  slug: string;
  title: string;
  city: string;
  price_xaf: number;
  price_unit: PriceUnit;
  cover_url: string;
  status: "draft" | "published" | "archived";
  is_vip: boolean;
  is_verified: boolean;
}

interface OwnRequest {
  id: string;
  full_name: string;
  phone: string;
  message: string;
  created_at: string;
  status: string;
  listing_id: string;
}

export default async function PartenairePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const notice = params.cree === "1" ? "Profil enregistré." : params.modifie === "1" ? "Modifications enregistrées." : null;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire");

  // Le filtre `owner_id` est indispensable : les policies RLS d'une même
  // commande se combinent en OU, et `listings_public_read` autorise déjà la
  // lecture de toute annonce publiée. Sans lui, le partenaire verrait
  // l'intégralité du catalogue comme s'il lui appartenait.
  //
  // `requests` n'a pas de policy de lecture publique : elle reste bornée au
  // propriétaire de l'annonce et à l'auteur de la demande.
  const [{ data: listings }, { data: requests }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, slug, title, city, price_xaf, price_unit, cover_url, status, is_vip, is_verified")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .returns<OwnListing[]>(),
    supabase
      .from("requests")
      .select("id, full_name, phone, message, created_at, status, listing_id")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<OwnRequest[]>(),
  ]);

  const mine = listings ?? [];
  const inbox = requests ?? [];
  const titleById = new Map(mine.map((l) => [l.id, l.title]));

  return (
    <div className="space-y-10">
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Mes profils</h1>
          <span className="text-sm text-slate-500">{mine.length}</span>
        </div>

        {mine.length === 0 ? (
          <EmptyBlock
            title="Aucun profil pour l'instant"
            body="Créez votre premier profil pour le rendre visible dans le catalogue."
            action={{ href: "/partenaire/annonces/nouvelle", label: "Créer un profil" }}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((listing) => (
              <li
                key={listing.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition hover:border-white/20"
              >
                <Link href={`/annonces/${listing.slug}`} className="group flex gap-3 p-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                    <Image
                      src={listing.cover_url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill status={listing.status} />
                      {listing.is_vip && <VipBadge />}
                      {listing.is_verified && <VerifiedBadge />}
                    </div>

                    <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                      {listing.title}
                    </p>

                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      {cityLabel(listing.city)}
                      <span aria-hidden className="text-slate-600">·</span>
                      {formatXAF(listing.price_xaf)} / {priceUnitLabel(listing.price_unit)}
                    </p>
                  </div>
                </Link>

                <div className="flex flex-wrap gap-1 border-t border-white/[0.07] px-3 py-2">
                  <Link
                    href={`/partenaire/annonces/${listing.id}/modifier`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Modifier
                  </Link>
                  {listing.status === "published" ? (
                    <StatusAction id={listing.id} to="draft" icon="down" label="Dépublier" />
                  ) : (
                    <StatusAction id={listing.id} to="published" icon="up" label="Publier" />
                  )}
                  {listing.status !== "archived" && (
                    <StatusAction id={listing.id} to="archived" icon="archive" label="Archiver" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">Demandes reçues</h2>
          <span className="text-sm text-slate-500">{inbox.length}</span>
        </div>

        {inbox.length === 0 ? (
          <EmptyBlock
            title="Aucune demande pour l'instant"
            body="Les demandes envoyées depuis vos profils apparaîtront ici, avec les coordonnées du client."
          />
        ) : (
          <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            {inbox.map((request) => (
              <li key={request.id} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-white">{request.full_name}</span>
                  <a
                    href={`tel:${request.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-sm text-gold-soft hover:text-gold"
                  >
                    <Phone className="size-3.5" aria-hidden />
                    {request.phone}
                  </a>
                  <span className="ml-auto text-xs text-slate-500">
                    {new Date(request.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-500">
                  {titleById.get(request.listing_id) ?? "Profil supprimé"}
                </p>

                {request.message && (
                  <p className="whitespace-pre-line pt-1 text-sm text-slate-300">
                    {request.message}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                  <RequestStatusPill status={request.status} />
                  {request.status === "pending" && (
                    <RequestAction id={request.id} to="contacted" label="Marquer contacté" />
                  )}
                  {request.status === "contacted" && (
                    <RequestAction id={request.id} to="confirmed" label="Confirmer" />
                  )}
                  {request.status !== "cancelled" && request.status !== "confirmed" && (
                    <RequestAction id={request.id} to="cancelled" label="Annuler" subtle />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Actions rendues en `<form>` plutôt qu'en composant client : elles
 * fonctionnent sans JavaScript et évitent d'embarquer du JS pour un simple
 * changement d'état.
 */
function StatusAction({
  id,
  to,
  label,
  icon,
}: {
  id: string;
  to: OwnListing["status"];
  label: string;
  icon: "up" | "down" | "archive";
}) {
  const Icon = icon === "up" ? Eye : icon === "down" ? EyeOff : Archive;

  return (
    <form action={setListingStatus}>
      <input type="hidden" name="listing_id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button
        type="submit"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </button>
    </form>
  );
}

function RequestAction({
  id,
  to,
  label,
  subtle = false,
}: {
  id: string;
  to: string;
  label: string;
  subtle?: boolean;
}) {
  return (
    <form action={setRequestStatus}>
      <input type="hidden" name="request_id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button
        type="submit"
        className={cx(
          "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition",
          subtle
            ? "text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
            : "border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]",
        )}
      >
        {label}
      </button>
    </form>
  );
}

function RequestStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "À traiter", className: "bg-amber-500/15 text-amber-300" },
    contacted: { label: "Contacté", className: "bg-sky-500/15 text-sky-300" },
    confirmed: { label: "Confirmé", className: "bg-emerald-500/15 text-emerald-300" },
    cancelled: { label: "Annulé", className: "bg-slate-500/15 text-slate-400" },
  };
  const { label, className } = map[status] ?? map.pending;

  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: OwnListing["status"] }) {
  const map = {
    published: { label: "En ligne", className: "bg-emerald-500/15 text-emerald-300" },
    draft: { label: "Brouillon", className: "bg-amber-500/15 text-amber-300" },
    archived: { label: "Archivée", className: "bg-slate-500/15 text-slate-400" },
  } as const;
  const { label, className } = map[status];

  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}

function EmptyBlock({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-14 text-center backdrop-blur-xl">
      <div className="grid size-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
        <Inbox className="size-5 text-slate-400" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-white">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-slate-400">{body}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-10 items-center gap-1.5 rounded-xl bg-action px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
        >
          <Plus className="size-4" aria-hidden />
          {action.label}
        </Link>
      )}
    </div>
  );
}
