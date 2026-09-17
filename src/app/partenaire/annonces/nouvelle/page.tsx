import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ListingForm } from "@/components/partner/ListingForm";
import { createClient } from "@/lib/supabase/server";

export default async function NouvelleAnnoncePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware couvre déjà ce cas ; ce garde-fou évite un rendu sans
  // `userId` si le middleware venait à ne pas s'appliquer à cette route.
  if (!user) redirect("/connexion?suivant=/partenaire/annonces/nouvelle");

  const { data: verified } = await supabase.rpc("is_account_verified", { p_user_id: user.id });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/partenaire"
        className="mb-6 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour au tableau de bord
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-white">Nouveau profil</h1>
      <p className="mb-8 mt-1.5 text-sm leading-relaxed text-slate-400">
        Les champs marqués d&apos;un astérisque sont obligatoires. Le badge « Certifié » est
        attribué automatiquement une fois votre identité vérifiée ; la mise en avant VIP relève
        de l&apos;équipe Matripa.
      </p>

      <ListingForm userId={user.id} canPublish={verified === true} />
    </div>
  );
}
