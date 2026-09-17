import Link from "next/link";
import type { Metadata } from "next";

import { Article, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="17 septembre 2026">
      <Article title="Responsable du traitement">
        <p>
          [raison sociale], dont le siège est situé [adresse complète], Brazzaville. Pour toute
          question relative à vos données : [adresse e-mail].
        </p>
      </Article>

      <Article title="Données collectées">
        <p>Le service ne collecte que les données nécessaires à son fonctionnement :</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="text-white">Demande de mise en relation</strong> — nom, téléphone,
            e-mail (facultatif), message, date souhaitée et nombre de personnes.
          </li>
          <li>
            <strong className="text-white">Compte</strong> — adresse e-mail et mot de passe chiffré.
          </li>
          <li>
            <strong className="text-white">Profils publiés</strong> (annonceurs) — descriptif,
            tarifs, visuels, ville.
          </li>
          <li>
            <strong className="text-white">Avis</strong> — note et commentaire, rattachés à une
            prestation confirmée.
          </li>
          <li>
            <strong className="text-white">Vérification d&apos;identité</strong> (annonceurs) —
            vidéo de vérification (visage, pièce d&apos;identité présentée, code prononcé), type
            de pièce, décision de l&apos;équipe et, le cas échéant, son motif.
          </li>
        </ul>
        <p>
          Aucune donnée de paiement n&apos;est collectée : le service n&apos;encaisse aucun
          règlement. Aucun traceur publicitaire n&apos;est déposé.
        </p>
      </Article>

      <Article title="Finalités et destinataires">
        <p>
          Les coordonnées d&apos;une demande sont transmises <strong className="text-white">au
          seul annonceur concerné</strong>, afin qu&apos;il vous recontacte. Elles ne sont ni
          revendues, ni cédées, ni utilisées à des fins de prospection par des tiers.
        </p>
        <p>
          Les avis sont publics : la note et le commentaire sont visibles sur la fiche de
          du profil. Votre identité n&apos;y est pas affichée.
        </p>
        <p>
          La vidéo de vérification sert à <strong className="text-white">vérifier l&apos;âge
          (majorité) et l&apos;identité des annonceurs</strong> avant la publication d&apos;un
          profil, afin de prévenir les faux profils et la publication par des personnes mineures.
          Elle n&apos;est jamais publiée : seule l&apos;équipe de modération Matripa y a accès,
          en lecture par un lien temporaire.
        </p>
      </Article>

      <Article title="Durée de conservation">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Demandes : 24 mois à compter du dépôt.</li>
          <li>Compte : jusqu&apos;à sa suppression par son titulaire.</li>
          <li>Avis : jusqu&apos;à suppression par leur auteur ou par la modération.</li>
          <li>
            Vidéo de vérification : supprimée dès la décision de l&apos;équipe. Les dépôts
            abandonnés sont également supprimés.
          </li>
          <li>
            Historique des décisions de vérification (type de pièce, décision, motif) : tant que
            le compte existe.
          </li>
        </ul>
        <p>
          Ni le numéro de la pièce d&apos;identité ni la date de naissance ne sont enregistrés.
        </p>
      </Article>

      <Article title="Sous-traitants">
        <p>
          Supabase (base de données, authentification et hébergement des fichiers via Supabase
          Storage : visuels et vidéos de vérification) et [hébergeur de
          l&apos;application]. L&apos;envoi des notifications par courriel est assuré par
          [prestataire e-mail].
        </p>
      </Article>

      <Article title="Vos droits">
        <p>
          Conformément à la législation congolaise relative à la protection des données à
          caractère personnel, vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, d&apos;opposition et de portabilité.
        </p>
        <p>
          Deux de ces droits s&apos;exercent directement depuis votre espace{" "}
          <Link href="/compte" className="text-neon underline underline-offset-2">
            Mon compte
          </Link>{" "}
          : l&apos;export de vos données et la suppression de votre compte. Pour les autres,
          écrivez à [adresse e-mail].
        </p>
      </Article>

      <Article title="Sécurité">
        <p>
          Les accès aux données sont cloisonnés au niveau de la base : un annonceur ne voit que
          ses propres profils et les demandes qui le concernent ; les coordonnées des clients ne
          sont accessibles à aucun visiteur. Les échanges sont chiffrés en transit.
        </p>
      </Article>
    </LegalPage>
  );
}
