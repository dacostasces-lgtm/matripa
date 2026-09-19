# Messagerie intégrée — conception

*19 septembre 2026 · validée en conversation avec Tricia*

## Objectif

Remplacer le formulaire de demande de contact par une messagerie intégrée entre
client et partenaire, en temps réel, sans casser ce que la demande porte
aujourd'hui : avis, paiements, notifications, suivi, export RGPD.

## Décisions

| Question | Décision |
|---|---|
| Compte client | **Obligatoire** pour écrire. Pseudonyme demandé au premier message ; le vrai nom n'est jamais requis. |
| Sort de la demande | **La conversation remplace tout** : premier message libre, sans formulaire. Le partenaire confirme la prestation depuis la conversation. |
| WhatsApp | **Messagerie seule** : bouton WhatsApp retiré partout, champ retiré du formulaire partenaire, numéros existants effacés. |
| Temps réel | **Supabase Realtime** (déjà l'hébergeur), avec rattrapage à la reconnexion. Écartés : rafraîchissement périodique (latence, requêtes sur réseau lent), service externe (coût, messages hors plateforme). |

## Modèle de données

### La conversation *est* la demande

Une conversation est une ligne de `public.requests` : une par couple (profil,
client). Les avis (`reviews.request_id unique`), les paiements
(`payments.request_id`), la notification partenaire (trigger `0003`) et l'export
de compte continuent de fonctionner sans modification de leur contrat.

Migration de `requests` :

- `full_name` et `phone` deviennent **facultatifs** : une conversation ouverte
  par un compte n'en a pas besoin. Les contraintes de format restent pour les
  valeurs non nulles. Les demandes anonymes historiques conservent les leurs.
- Nouvelles colonnes : `last_message_at timestamptz`, `author_last_read_at
  timestamptz`, `owner_last_read_at timestamptz`.
- Index unique partiel `(listing_id, author_id) where author_id is not null` :
  une seule conversation par client et par profil. La migration vérifie
  l'absence de doublons en production avant de le créer.
- Statuts inchangés : `pending` à l'ouverture, `contacted` dès la première
  réponse du partenaire (automatique), `confirmed` par le partenaire,
  `cancelled` = conversation close.

### Nouvelles tables

`public.messages`
- `id uuid pk`, `request_id uuid not null → requests(id) on delete cascade`,
  `sender_id uuid not null → auth.users(id) on delete cascade`,
  `body text not null` (1 à 2 000 caractères après `trim`),
  `created_at timestamptz not null default now()`.
- Index `(request_id, created_at)`.
- La suppression d'un compte efface ses messages (droit à l'effacement). La
  conversation reste pour l'autre partie, comme aujourd'hui (`author_id` à
  `null`).

`public.profiles`
- `user_id uuid pk → auth.users(id) on delete cascade`,
  `display_name text not null` (2 à 30 caractères, non unique : il sert à reconnaître l'autre partie, pas à l'identifier),
  `created_at`, `updated_at`.
- Un utilisateur lit et écrit uniquement le sien. Le pseudonyme de l'autre
  partie n'est exposé qu'à travers les fonctions de la messagerie.

### Droits

Même discipline que les migrations précédentes : `revoke all` sur les
nouvelles tables pour `anon` et `authenticated`, puis droits minimaux.

- `messages` : **aucune écriture directe**. Lecture (RLS) réservée aux deux
  participants : l'auteur de la demande et le propriétaire du profil.
- Toute écriture passe par des fonctions `security definer` :

| Fonction | Rôle | Contrôles |
|---|---|---|
| `start_conversation(listing_id, body)` | Ouvre la conversation (ou rejoint l'existante si elle est ouverte) et envoie le premier message ; renvoie l'id | Connecté ; profil publié ; pas son propre profil ; pseudonyme défini ; 10 nouvelles conversations par heure au plus ; refuse si la conversation existante est close |
| `send_message(request_id, body)` | Envoie un message | Participant ; conversation non close ; profil encore publié ; client encore existant (`author_id` non nul) ; 30 messages par 5 minutes au plus ; passe à `contacted` à la première réponse du partenaire ; met à jour `last_message_at` |
| `mark_conversation_read(request_id)` | Met à jour la date de lecture de l'appelant | Participant |
| `close_conversation(request_id)` | Passe à `cancelled` | Participant (client ou partenaire) |
| `list_conversations()` | Liste de l'appelant : profil (titre, couverture, slug), pseudonyme de l'autre partie, dernier message, statut, non-lus, rôle | Uniquement ses conversations, comme client ou comme partenaire |

- La confirmation reste l'écriture existante `update (status)` du propriétaire
  (policy `requests_listing_owner_update`), appelée depuis la conversation.
- `submit_request` (demande anonyme) : `execute` retiré à `anon` et
  `authenticated`. La fonction est conservée pour l'historique.
- `whatsapp_phone` : valeurs effacées ; les `grant insert/update` accordés par `0014` sont retirés.

### Temps réel

`messages` est ajoutée à la publication `supabase_realtime`. Les abonnements
`postgres_changes` respectent la RLS : un client ne reçoit que les messages de
ses conversations. À la reconnexion ou au retour sur l'onglet, la page recharge
les messages postérieurs au dernier reçu : une coupure réseau ne perd rien.

### Notification partenaire

Le trigger `0003` se déclenche toujours à l'ouverture d'une conversation. La
route `/api/webhooks/new-request` gère l'absence de `full_name` et de `phone`,
et le courriel annonce « un nouveau message » **sans son contenu**. L'envoi
réel reste suspendu à `RESEND_API_KEY`. Pas de notification par message dans
cette version : la pastille de non-lus tient ce rôle.

## Interface

### Points d'entrée

Un bouton **« Écrire »** remplace « Envoyer une demande » (fiche rapide),
« Contacter » (bandeau mobile) et « Effectuer une demande formelle » (fiche
complète). Il mène à `/messages/nouveau/[slug]` :

- sans session → `/connexion?suivant=/messages/nouveau/[slug]` (le middleware
  protège `/messages`), puis retour ;
- sans pseudonyme → champ pseudonyme au-dessus du premier message ;
- conversation déjà ouverte avec ce profil → redirection vers elle ;
- sur son propre profil → message explicatif, pas de conversation.

### Pages

- **`/messages`** : conversations de l'utilisateur, les plus récentes d'abord,
  qu'il soit client ou partenaire (un compte peut être les deux). Chaque ligne :
  couverture et titre du profil, pseudonyme de l'autre partie, extrait du
  dernier message, heure, pastille de non-lus, statut si confirmée ou close.
- **`/messages/[id]`** : fil de discussion (bulles, heure, séparateurs de
  jour), zone de saisie en bas, défilement automatique vers le dernier
  message. Selon le rôle et le statut :
  - partenaire : **« Confirmer la prestation »** tant qu'elle ne l'est pas ;
  - client, prestation confirmée : paiement Mobile Money et avis (les
    composants `PaymentForm` et `ReviewForm` actuels, déplacés de
    `/mes-demandes`) ;
  - les deux : **« Clore la conversation »**. Close : saisie désactivée,
    historique lisible.
- **Dock** : onglet **Messages** avec pastille du nombre total de non-lus,
  mise à jour en temps réel. Ordre : Annonces, Messages, Favoris, Compte, puis
  Publier. Les largeurs sont revues pour tenir à 320 px.

### Redirections et retraits

- `/demande/[slug]` → `/messages/nouveau/[slug]`.
- `/mes-demandes` → `/messages`.
- Espace partenaire : la section « Demandes reçues » devient un lien vers
  `/messages` avec le nombre de non-lus. Les demandes anonymes historiques
  restent consultables dans `/messages`, en lecture seule, avec leurs
  coordonnées.
- WhatsApp : retrait de `WhatsAppDirectButton`, des boutons de la carte, de
  la fiche rapide, du bandeau mobile et des stories, et du champ du formulaire
  partenaire. `lib/whatsapp.ts` et ses tests sont supprimés s'ils ne servent
  plus.

### Discrétion

- Aucun contenu de message dans les notifications, le titre de l'onglet ou
  les métadonnées.
- Le bouton de panique et le double Échap restent actifs dans la messagerie.
- Les pages `/messages` sont exclues de l'indexation et ne sont pas mises en
  cache par le service worker.

## Cas d'erreur

| Situation | Comportement |
|---|---|
| Message vide ou trop long | Refus côté client et côté base ; message affiché sous la saisie |
| Limite de débit atteinte | « Vous écrivez trop vite. Réessayez dans quelques minutes. » |
| Conversation close | Saisie désactivée ; la fonction refuse aussi côté base. Close par l'une ou l'autre partie, elle le reste : « Écrire » sur ce profil y ramène, en lecture seule. Rouvrir laisserait un client passer outre une clôture voulue par le partenaire. |
| Profil dépublié ou supprimé | Conversation lisible ; saisie désactivée si le profil n'est plus publié |
| Réseau coupé | Message conservé dans la saisie avec « Non envoyé — réessayer » ; rattrapage à la reconnexion |
| Compte de l'autre partie supprimé | Affiché comme « Compte supprimé » ; saisie désactivée |

## Tests

- **Base (pgTAP)** : un tiers ne lit ni les messages ni la conversation
  d'autrui ; personne n'insère de message directement ; `send_message` refuse
  un non-participant et une conversation close ; `start_conversation` refuse
  son propre profil, un profil non publié et un compte sans pseudonyme ;
  unicité (profil, client) ; limites de débit ; passage automatique à
  `contacted` ; `anon` ne peut plus appeler `submit_request` ;
  `list_conversations` ne renvoie que les conversations de l'appelant.
- **Unitaires** : validation du message et du pseudonyme, calcul des non-lus,
  regroupement des messages par jour.
- **Bout en bout**, deux navigateurs : un client s'inscrit, écrit à un profil,
  le partenaire voit la pastille, lit, répond, et le client reçoit la réponse
  **sans recharger** ; confirmation par le partenaire, puis le client accède
  au paiement et à l'avis ; clôture. Les tests « demande » actuels sont
  réécrits sur ce parcours.

## Hors périmètre de cette version

- Notifications par courriel à chaque message (attend `RESEND_API_KEY`).
- Signalement et blocage (viennent avec la PR n°1).
- Photos et fichiers dans les messages.
- Plusieurs prestations notées dans une même conversation : une conversation
  porte une prestation, donc un avis et un paiement réussi.
- Notifications push de la PWA.

## Déploiement

La migration part en production **avant** le code, comme pour `0014` : le
code appelle des fonctions qui n'existent pas encore. Entre les deux, l'ancien
formulaire de demande ne fonctionne plus (`submit_request` n'est plus
exécutable) ; le reste du site est intact, `requests` ne perdant aucune
colonne. Le code est donc envoyé juste après la migration, pour réduire cette
fenêtre à quelques minutes.
