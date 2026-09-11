import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export des données personnelles, au format JSON téléchargeable.
 *
 * Toutes les lectures passent par le client *de session*, jamais par la clé
 * `service_role` : le périmètre exporté est ainsi exactement celui que RLS
 * autorise à l'utilisateur. Une erreur de filtre ne peut pas faire fuiter les
 * données d'autrui.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [requests, reviews, listings] = await Promise.all([
    supabase
      .from("requests")
      .select("id, listing_id, full_name, phone, email, message, desired_date, guests, status, created_at")
      .eq("author_id", user.id),
    supabase
      .from("reviews")
      .select("id, listing_id, rating, comment, created_at")
      .eq("author_id", user.id),
    supabase
      .from("listings")
      .select("id, slug, title, city, price_xaf, price_unit, status, created_at")
      .eq("owner_id", user.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    compte: {
      id: user.id,
      email: user.email,
      cree_le: user.created_at,
      derniere_connexion: user.last_sign_in_at,
    },
    demandes: requests.data ?? [],
    avis: reviews.data ?? [],
    offres_publiees: listings.data ?? [],
  };

  const date = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="matripa-donnees-${date}.json"`,
      // Données personnelles : ni cache navigateur, ni cache intermédiaire.
      "Cache-Control": "no-store",
    },
  });
}
