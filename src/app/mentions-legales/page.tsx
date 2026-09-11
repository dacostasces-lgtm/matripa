import type { Metadata } from "next";

import { Article, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Mentions légales" };

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="11 septembre 2026">
      <Article title="Éditeur du site">
        <p>
          Le service Matripa est édité par [raison sociale], [forme juridique] au capital de
          [montant] FCFA, immatriculée au RCCM sous le numéro [numéro RCCM], dont le siège social
          est situé [adresse complète], Brazzaville, République du Congo.
        </p>
        <p>
          Directeur de la publication : [nom et prénom]. Contact : [adresse e-mail] —
          [numéro de téléphone].
        </p>
      </Article>

      <Article title="Hébergement">
        <p>
          L&apos;application est hébergée par [hébergeur], [adresse de l&apos;hébergeur]. Les
          données applicatives sont stockées par Supabase, dans la région [région] de
          l&apos;infrastructure utilisée.
        </p>
      </Article>

      <Article title="Nature du service">
        <p>
          Matripa est une plateforme de mise en relation réservée aux adultes. Elle référence des
          profils publiés par des annonceurs indépendants et leur transmet les demandes des utilisateurs.
        </p>
        <p>
          Matripa n&apos;est ni le fournisseur ni le co-contractant des prestations proposées.
          Tout échange est conclu directement entre l&apos;utilisateur et l&apos;annonceur, qui en
          assume seul l&apos;exécution, la conformité et la responsabilité.
        </p>
      </Article>

      <Article title="Propriété intellectuelle">
        <p>
          La marque, le nom de domaine, la charte graphique et les développements du site sont la
          propriété de l&apos;éditeur. Les visuels et descriptifs des profils restent la propriété
          des annonceurs qui les publient, lesquels garantissent en détenir les droits.
        </p>
      </Article>

      <Article title="Signalement">
        <p>
          Tout contenu illicite, trompeur ou portant atteinte aux droits d&apos;un tiers peut être
          signalé à [adresse e-mail de signalement]. L&apos;éditeur procède au retrait des contenus
          manifestement illicites qui lui sont signalés.
        </p>
      </Article>
    </LegalPage>
  );
}
