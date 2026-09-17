import type { Metadata } from "next";

import { Article, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Conditions générales d'utilisation" };

export default function CguPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation" updatedAt="17 septembre 2026">
      <Article title="1. Objet">
        <p>
          Les présentes conditions régissent l&apos;accès et l&apos;usage de la plateforme
          Matripa, qui met en relation des utilisateurs majeurs avec des profils publiant des
          annonces de rencontres, de massages et d&apos;accompagnement.
        </p>
      </Article>

      <Article title="2. Accès réservé aux majeurs">
        <p>
          L&apos;accès à Matripa et la publication d&apos;une annonce sont strictement réservés aux
          personnes âgées d&apos;au moins 18 ans. Chaque utilisateur s&apos;engage à agir librement,
          de manière consentie et dans le respect de la législation applicable.
        </p>
      </Article>

      <Article title="3. Rôle de la plateforme">
        <p>
          Matripa est un <strong className="text-white">intermédiaire technique</strong>. Elle
          n&apos;est pas partie au contrat conclu entre l&apos;utilisateur et le partenaire, ne
          fournit aucune des prestations référencées et n&apos;encaisse aucun paiement.
        </p>
        <p>
          Le partenaire est seul responsable de l&apos;exactitude de son offre, de sa
          disponibilité, de ses tarifs et de l&apos;exécution de la prestation.
        </p>
      </Article>

      <Article title="4. Compte">
        <p>
          La création d&apos;un compte requiert une adresse e-mail valide et un mot de passe
          d&apos;au moins huit caractères. Le titulaire est responsable de la confidentialité de
          ses identifiants et de toute activité effectuée depuis son compte.
        </p>
        <p>
          Un même compte permet de déposer des demandes en tant que client et de publier des
          profils en tant qu&apos;annonceur.
        </p>
      </Article>

      <Article title="5. Obligations des annonceurs">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Publier des profils exacts, licites et dont ils détiennent les droits sur les visuels.</li>
          <li>Ne publier que leur propre profil ou disposer d&apos;une autorisation explicite.</li>
          <li>Répondre aux demandes reçues dans un délai raisonnable.</li>
          <li>Ne pas publier de contenu impliquant un mineur, de contrainte, d&apos;exploitation ou de traite.</li>
        </ul>
      </Article>

      <Article title="6. Vérification d'identité, badges « Certifié » et « VIP »">
        <p>
          La publication d&apos;un profil exige une{" "}
          <strong className="text-white">vérification d&apos;identité par vidéo</strong>, examinée
          par l&apos;équipe Matripa. Le badge <strong className="text-white">Certifié</strong> en
          découle automatiquement : il n&apos;est pas modifiable par l&apos;annonceur, peut être
          retiré par l&apos;équipe et ne constitue pas une garantie de la qualité de la prestation.
        </p>
        <p>
          Un constat de minorité entraîne l&apos;archivage de tous les profils du compte et le
          blocage de celui-ci.
        </p>
        <p>
          La mise en avant <strong className="text-white">VIP</strong> relève d&apos;un choix
          éditorial ou commercial et influe uniquement sur l&apos;ordre d&apos;affichage.
        </p>
      </Article>

      <Article title="7. Avis">
        <p>
          Seul un utilisateur dont la prestation a été confirmée par le partenaire peut déposer un
          avis, et une seule fois par prestation. Les avis injurieux, diffamatoires, hors sujet ou
          manifestement faux peuvent être retirés par la modération.
        </p>
      </Article>

      <Article title="8. Contenus interdits">
        <p>
          Sont proscrits les contenus illicites, trompeurs, portant atteinte aux droits de tiers,
          ainsi que toute offre de services contraires à la loi. L&apos;éditeur peut dépublier une
          offre ou suspendre un compte en cas de manquement.
        </p>
      </Article>

      <Article title="9. Responsabilité">
        <p>
          Matripa met en œuvre les moyens raisonnables pour assurer la disponibilité du service,
          sans garantie d&apos;absence d&apos;interruption. Sa responsabilité ne saurait être
          engagée au titre des échanges ou prestations convenus directement entre les utilisateurs.
        </p>
      </Article>

      <Article title="10. Modification et droit applicable">
        <p>
          Les présentes conditions peuvent être modifiées ; la version applicable est celle en
          ligne au jour de l&apos;utilisation. Elles sont soumises au droit congolais. À défaut de
          résolution amiable, les tribunaux de [ville] sont compétents.
        </p>
      </Article>
    </LegalPage>
  );
}
