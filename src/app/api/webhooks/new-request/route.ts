import { timingSafeEqual } from "node:crypto";

import { sendRequestNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { cityLabel } from "@/types/listing";

// Webhook : jamais de cache, jamais de prérendu.
export const dynamic = "force-dynamic";

/** Comparaison à temps constant : évite de divulguer le secret octet par octet. */
function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  // `timingSafeEqual` exige des longueurs égales ; on compare d'abord la
  // taille, qui n'est pas une information sensible.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Appelé par le trigger Postgres à chaque insertion dans `public.requests`.
 *
 * Le corps ne contient que l'identifiant de la demande : les coordonnées sont
 * relues ici avec la clé `service_role`. Un POST forgé ne peut donc pas
 * injecter de fausses données, seulement provoquer un renvoi de notification
 * pour une demande qui existe réellement.
 */
export async function POST(request: Request) {
  const expected = process.env.REQUEST_WEBHOOK_SECRET;

  if (!expected) {
    console.error("[webhook] REQUEST_WEBHOOK_SECRET non configuré");
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  if (!secretMatches(request.headers.get("x-matripa-signature"), expected)) {
    // Réponse volontairement laconique : aucun indice sur la cause du rejet.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let requestId: unknown;
  try {
    ({ request_id: requestId } = await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof requestId !== "string" || requestId.length === 0) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: demande, error } = await supabase
    .from("requests")
    .select("full_name, phone, email, message, desired_date, guests, listing_id")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !demande) {
    console.error("[webhook] demande introuvable", requestId, error);
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("title, slug, city, owner_id")
    .eq("id", demande.listing_id)
    .maybeSingle();

  if (!listing) {
    return Response.json({ error: "listing_not_found" }, { status: 404 });
  }

  // Adresse du partenaire : lue via l'API Admin, `auth.users` n'étant pas
  // exposée au client PostgREST.
  let recipient = process.env.NOTIFY_FALLBACK_EMAIL ?? null;

  if (listing.owner_id) {
    const { data: owner } = await supabase.auth.admin.getUserById(listing.owner_id);
    if (owner?.user?.email) recipient = owner.user.email;
  }

  if (!recipient) {
    console.warn("[webhook] aucun destinataire pour la demande", requestId);
    return Response.json({ ok: true, notified: false });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const notified = await sendRequestNotification(recipient, {
    listingTitle: listing.title,
    listingUrl: `${siteUrl}/annonces/${listing.slug}`,
    city: cityLabel(listing.city),
    fullName: demande.full_name,
    phone: demande.phone,
    email: demande.email,
    message: demande.message,
    desiredDate: demande.desired_date,
    guests: demande.guests,
  });

  return Response.json({ ok: true, notified });
}
