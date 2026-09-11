import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { LISTINGS_TAG } from "@/lib/listings";

export const dynamic = "force-dynamic";

/** Comparaison à temps constant : évite de divulguer le secret octet par octet. */
function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Purge du cache du catalogue.
 *
 * Les actions partenaire et administrateur invalident déjà l'étiquette
 * `listings` elles-mêmes. Cet endpoint couvre les modifications faites *hors*
 * de l'application — SQL direct, dashboard Supabase, import en masse — après
 * lesquelles le fil resterait périmé jusqu'à l'expiration du délai.
 *
 * Réutilise `REQUEST_WEBHOOK_SECRET` : même canal de confiance, un seul secret
 * à faire tourner.
 */
export async function POST(request: Request) {
  const expected = process.env.REQUEST_WEBHOOK_SECRET;

  if (!expected) {
    console.error("[revalidate] REQUEST_WEBHOOK_SECRET non configuré");
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  if (!secretMatches(request.headers.get("x-matripa-signature"), expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateTag(LISTINGS_TAG);

  return Response.json({ ok: true, tag: LISTINGS_TAG, at: new Date().toISOString() });
}
