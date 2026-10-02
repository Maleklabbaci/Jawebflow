# Automatisations Instagram (comme ManyChat)

Ce guide explique **à quoi ça sert**, **comment l'utiliser** (pour tes clients) et **ce qu'il faut régler une seule fois** (pour toi).

---

## 1. À quoi ça sert ?

Dans le tableau de bord : menu **Automatisations**.

| Ce qui arrive sur Instagram | Ce que fait JawebFlow |
|---|---|
| Quelqu'un commente « prix » sous un post ou un reel | Réponse **publique** sous son commentaire + **message privé** avec les détails (et des boutons avec un lien) |
| Quelqu'un t'écrit « livraison » en message privé | Réponse **immédiate** avec ton message (sans IA) |
| Quelqu'un répond à une de tes stories | Message automatique (tous les messages, ou seulement avec un mot-clé) |
| Quelqu'un te mentionne dans sa story | Message de remerciement |
| Tout le reste | L'**assistant IA** répond comme avant, avec les informations de ton site |

Les règles passent **avant** l'IA : si une règle correspond, elle répond ; sinon, l'IA prend le relais.
Les règles continuent de marcher même si tu mets l'IA en pause (onglet Instagram).

### Les options (façon ManyChat)

- **Choisir la publication** (un post ou un reel précis) ou toutes les publications.
- **Mots-clés** : « n'importe quel commentaire », « contient un mot » ou « exactement ce mot ». Majuscules, accents et ponctuation sont ignorés ; ça marche en français, en arabe et en « arabizi » (`ch7al`).
- **Plusieurs réponses publiques** (le robot en choisit une au hasard : plus naturel).
- **Variables** : `{@pseudo}` (mentionne la personne), `{prenom}` (messages privés seulement), `{entreprise}`.
- **Boutons avec un lien** dans le message privé (3 maximum).
- **« Suis mon compte avant de recevoir le message »** : la personne reçoit d'abord un bouton « ✅ C'est fait » ; le message n'est envoyé qu'après avoir vérifié son abonnement.
- **Une seule fois par personne** (activé par défaut).
- **Aperçu « téléphone » + essai en direct** (rien n'est envoyé sur Instagram pendant l'essai).
- **Historique** : qui a déclenché quoi, ce qui a été envoyé, et la raison de chaque échec, en français.
- **Interrupteur ON/OFF**, **dupliquer**, **supprimer**, statistiques par automatisation.
- **Bilan de santé** en haut de page : compte connecté ? autorisation « commentaires » accordée ? Instagram envoie-t-il bien les commentaires ? Avec un bouton **Réparer**.

### Les règles d'Instagram (impossibles à contourner)

- **Un seul message privé par commentaire**, dans les **7 jours**.
- Si la personne ne suit pas le compte, le message arrive dans « Demandes de messages ».
- Les liens ne sont pas cliquables dans les commentaires (mets-les dans le message privé).
- Le prénom n'est connu qu'une fois que la personne a écrit en privé : sous un commentaire, utilise `{@pseudo}`.
- Le compte doit être **professionnel** (Business ou Créateur) et **public**.

---

## 2. À faire UNE SEULE FOIS (propriétaire de JawebFlow)

### Étape A — Mettre à jour la base de données (30 secondes)

1. Ouvre **Automatisations** dans le tableau de bord : un guide en 4 étapes s'affiche tant que ce n'est pas fait.
2. Clique **Copier la mise à jour**, puis **Ouvrir Supabase**, colle dans la zone blanche et clique **Run**.
3. Reviens et clique **C'est fait, vérifier**.

(Le même contenu est dans `supabase/migration_ig_automations.sql`. Sans danger si exécuté plusieurs fois.)

### Étape B — Application Meta (une fois pour toute la plateforme)

Dans [developers.facebook.com](https://developers.facebook.com) → ton application JawebFlow :

1. **Autorisations** : ajouter `instagram_business_manage_comments` (en plus de `instagram_business_basic` et `instagram_business_manage_messages`).
2. **Webhooks** (produit Instagram) : garder l'adresse `https://jawebflow.pages.dev/api/webhook/instagram` et **cocher les champs** :
   - `messages` (déjà fait),
   - **`comments`** (nouveau),
   - **`messaging_postbacks`** (nouveau — nécessaire pour le bouton « ✅ C'est fait »).
3. **Mode « Live »** de l'application.
4. **Pour les comptes qui ne sont pas à toi** (tes clients) : Meta demande une validation (« App Review », accès avancé) pour la permission `instagram_business_manage_comments`. Tant qu'elle n'est pas validée, ça marche uniquement pour les comptes ayant un rôle sur l'application (administrateur, testeur).

> Les libellés exacts du tableau de bord Meta changent de temps en temps ; l'idée reste la même : **ajouter la permission** et **cocher `comments` + `messaging_postbacks`** dans les webhooks.

### Étape C — Chaque client autorise les commentaires (une fois)

Onglet **Instagram** → carte « Commentaires » → **Autoriser les commentaires**. Instagram demande la permission de gérer les commentaires. La connexion normale (messages privés) n'est pas modifiée.

Ensuite, dans **Automatisations**, le bandeau du haut doit passer au vert (« Instagram est bien branché »). S'il y a un point à régler, il explique quoi faire et propose un bouton.

---

## 3. Si « j'ai commenté et rien ne se passe »

Le bilan de santé répond presque toujours :

| Message du bilan | Cause | Solution |
|---|---|---|
| « Il manque l'autorisation gérer les commentaires » | Le client n'a pas autorisé | Onglet Instagram → **Autoriser les commentaires** |
| « Instagram n'envoie pas encore les commentaires » | Abonnement manquant | Bouton **Réparer** ; si ça persiste, vérifier l'étape B (champ `comments` coché) |
| « Aucun commentaire reçu pour le moment » (même après un vrai test depuis un autre compte) | Meta n'envoie rien | Étape B : application en mode Live, champ `comments` coché, compte public |
| Historique : « Trop tard… 7 jours » | Commentaire trop ancien | Normal (règle Instagram) |
| Historique : « La connexion Instagram a expiré » | Jeton expiré | Onglet Instagram → **Reconnecter** |

Pour tester en vrai : **commente une publication depuis un AUTRE compte Instagram** (les commentaires de ton propre compte sont ignorés pour éviter les boucles).

---

## 4. Pour les développeurs

| Élément | Fichier |
|---|---|
| Logique pure (mots-clés, variables, validation, simulateur) — partagée serveur + interface | `functions/_shared/ig-automation-core.ts` |
| Appels API Instagram (réponse publique, réponse privée, profil, publications, abonnements, erreurs en français) | `functions/_shared/ig-api.ts` |
| Moteur (commentaires, mots-clés, stories, « suis mon compte », anti-doublon) | `functions/_shared/ig-automations.ts` |
| Webhook (commentaires `entry[].changes[]`, boutons `postback`, règles avant l'IA) | `functions/api/webhook/instagram.ts` |
| API : liste/édition, publications, bilan de santé | `functions/api/instagram/{automations,media,diagnostics}.ts` |
| Interface | `src/components/InstagramAutomations.tsx`, `src/components/automations/*` |
| Base de données | `supabase/migration_ig_automations.sql` |
| Tests (aucun accès réseau : Instagram et Supabase sont simulés) | `tests/` → `npm test` |

Points techniques à connaître :

- API « Instagram Login » (`graph.instagram.com`, version centralisée dans `IG_GRAPH_VERSION`).
- Réponse publique : `POST /{comment_id}/replies`. Réponse privée : `POST /{ig_id}/messages` avec `recipient.comment_id`.
- Événement commentaire : `entry[].changes[]` → `{ field: "comments", value: { id, from:{id,username}, text, media:{id} } }`. Les commentaires du compte lui-même et les réponses à un commentaire (`parent_id`) sont ignorés.
- Anti-doublon : chaque événement est « réservé » dans `ig_automation_events` (`unique(automation_id, source_id)`) **avant** tout envoi ; si la base est illisible, rien n'est envoyé.
- Les écritures passent par le serveur (clé service) ; les marchands ne peuvent que **lire** leurs propres lignes (RLS).
- Abonnement aux notifications : `messages,messaging_postbacks,comments`, avec repli automatique sur une liste plus courte si Meta refuse un champ (la réception des messages privés n'est jamais cassée).
