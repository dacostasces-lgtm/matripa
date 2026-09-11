import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { ListingForm, type EditableListing } from "@/components/partner/ListingForm";
import { createClient } from "@/lib/supabase/server";

export default async function ModifierAnnoncePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire");

  // Le filtre `owner_id` est indispensable : `listings_public_read` autorise
  // la lecture de toute annonce publiée, donc RLS seule laisserait un
  // partenaire ouvrir le formulaire d'édition d'une annonce d'autrui. L'écriture
  // resterait refusée, mais la fiche complète aurait déjà fuité.
  const { data: listing } = await supabase
    .from("listings")
    .select(
      // La projection est explicite : toute colonne oubliée ici arriverait
      // vide dans le formulaire et serait *effacée* à l'enregistrement, le
      // `update` réécrivant l'ensemble des champs.
      "id, slug, title, highlight, description, category, option_type, mobility, city, district, price_xaf, price_unit, rates, cover_url, images, video_url, amenities, is_available_now, languages, availability, status",
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<EditableListing>();

  if (!listing) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/partenaire"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Tableau de bord
        </Link>

        <Link
          href={`/annonces/${listing.slug}`}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
        >
          <ExternalLink className="size-4" aria-hidden />
          Voir la fiche publique
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-white">Modifier le profil</h1>
      <p className="mb-8 mt-1.5 text-sm leading-relaxed text-slate-400">
        L&apos;adresse publique du profil reste inchangée, même si vous en modifiez le
        titre.
      </p>

      <ListingForm userId={user.id} listing={listing} />
    </div>
  );
}
