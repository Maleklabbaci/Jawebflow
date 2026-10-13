# 🔒 Le module Réseaux sociaux (produit séparé)

> **En une phrase** : le **chatbot à intégrer dans le site web** est ouvert à tous
> les clients ; les **réseaux sociaux** (Instagram, Messenger, WhatsApp,
> Telegram, TikTok) forment un **module à part**, ouvert **client par client**
> par JawebFlow. Tant qu'il est fermé, le client voit **un cadenas bien
> visible** avec « Prochainement » — et il peut **demander l'activation en un
> clic** : la demande part par e-mail à l'équipe et JawebFlow ouvre le module
> client par client.

---

## 1. Deux interfaces, deux espaces

À l'entrée du tableau de bord (Accueil), **deux grandes cartes** :

| Carte | Contenu | Accès |
| --- | --- | --- |
| **Chatbot du site web** | Mes informations · Mon site web · Comportement · Apparence · Apprentissage · Mon site (installation) | toujours ouvert |
| **Réseaux sociaux** | Instagram · Messenger · WhatsApp · Telegram · TikTok · Automatisations | 🔒 **fermé par défaut** |

Le menu latéral reprend la même séparation : deux entrées, « Mon assistant web »
et « Réseaux sociaux » (un onglet par réseau). Cliquer sur la carte d'un espace
ouvre son premier onglet.

## 2. Ce que voit le client quand c'est fermé

Une page avec **un cadenas et « Prochainement »** qui montre ce que le module
apporte (les 5 messageries) — mais **aucun réglage** :

- pas de tour du module, pas de formulaire de branchement, aucun jeton ;
- **une seule action** : le bouton **« Demander l'activation »**, avec un champ
  facultatif (« Que voulez-vous brancher ? ») ;
- après l'envoi : « Demande envoyée le … » et, au retour sur la page, l'état est
  relu depuis `social_requests` — le client ne redemande pas tous les jours ;
- tous les onglets du module sont concernés : Instagram, les 4 canaux **et**
  les Automatisations.

Quand l'équipe ouvre le module, le client **recharge sa page** (F5) et tout
apparaît, avec le branchement habituel.

## 3. Ouvrir le module (3 étapes, une seule fois)

### a) Exécuter le SQL

Supabase → **SQL Editor** → coller `supabase/migration_module_social.sql` → Run.

Le script :

- ajoute `public.users.social_enabled` (**faux par défaut** = fermé) ;
- remet à jour `protect_user_profile()` : **un client ne peut pas s'ouvrir le
  module tout seul** depuis son navigateur (protection anti-contournement) ;
- crée `public.social_requests` (utilisée seulement si on rouvre un jour le
  bouton de demande) ;
- **ouvre d'office** le module des clients qui avaient déjà un canal branché —
  personne ne perd son accès au moment de la migration.

> ⚠️ **Ce SQL est obligatoire** : sans lui, la colonne n'existe pas et le module
> reste fermé pour **tout le monde** (y compris tes clients actuels). Le même
> SQL est disponible dans la console admin → onglet **Système**.
> **Ordre conseillé : le SQL d'abord, le déploiement ensuite.**
> `/api/health` te le dit noir sur blanc : `socialModule: false` + une ligne
> dans `toFix`.
>
> Toi (rôle admin/superadmin), tu n'es **jamais** bloqué : tu peux tout tester.

### b) Ouvrir le module d'un client

Console admin → **Clients** → sur la ligne du client, le bouton sous sa formule :

- `🔒 Réseaux sociaux verrouillés` → cliquer ouvre le module ;
- `🔓 Réseaux sociaux ouverts` → cliquer referme.

La décision est **indépendante du plan** : le plan fixe le volume IA, ce bouton
fixe l'accès aux messageries.

### c) Rien d'autre

Le client recharge son tableau de bord et retrouve ses onglets. **Les
conversations déjà en cours ne sont jamais coupées** par le verrou : il ne
bloque que l'espace de branchement.

## 4. Les demandes d'activation

Le client **demande lui-même** (bouton du cadenas). La route
`POST /api/channels/request-access` :

1. écrit la demande dans `social_requests` (statut `pending`) — elle ne se perd
   pas, même si l'e-mail n'est pas configuré ;
2. envoie un e-mail à `contact@jawebflow.dz` (surchargeable par `CONTACT_INBOX`)
   avec le nom, l'entreprise, l'e-mail, la **formule actuelle**, l'identifiant du
   compte, le message du client **et** le rappel du geste à faire (console →
   Clients → bouton 🔒, ou le `update` SQL) ;
3. limite les envois à **3 par jour et par compte**.

Ensuite, deux endroits dans la console admin :

- onglet **Clients** → bouton `🔒 Réseaux sociaux verrouillés` / `🔓 … ouverts`
  de sa ligne, plus le repère `⏳ Activation demandée le …` ;
- onglet **Sites connectés** → la fiche du client, avec ses sites, ses domaines
  et ses réseaux déjà branchés (voir §4 bis).

⚠️ Le changement de `social_enabled` est protégé en base : il exige un compte
**superadmin**. Un simple `admin` se fera refuser (le message le dit).

## 4 bis. « Sites connectés » (onglet admin)

Pour répondre à « quels sites mes clients ont connectés ? », la console appelle
`GET /api/admin/sites` (jeton + rôle vérifiés, lecture par la clé serveur) :
compteurs (sites branchés, réseaux branchés, clients verrouillés, demandes en
attente) puis **une fiche par client** — entreprise, e-mail, téléphone, formule,
état du module — et **une ligne par site** :

- l'adresse du site (cliquable) et le nom de l'assistant ;
- 🎙️ Appels vocaux · 🔑 Clé de widget ;
- les **domaines autorisés pour la bulle** (⚠️ « aucun domaine déclaré » = la
  bulle répondrait partout : à faire préciser) ;
- les **réseaux branchés** avec leur état : ✅ connecté / ⚠️ erreur (le dernier
  message d'erreur est dans l'infobulle), avec le nom du compte et le numéro
  WhatsApp.

Un champ de recherche filtre par client, société, domaine ou site.

## 5. Où c'est appliqué dans le code

| Endroit | Rôle |
| --- | --- |
| `supabase/migration_module_social.sql` | la colonne, l'anti-contournement, la table des demandes |
| `functions/api/channels/integrations.ts` | **refus 403** (`socialLocked: true`) si le module est fermé : appeler l'API directement n'ouvre rien |
| `functions/_shared/supabase.ts` | `supabaseGetAccountFlags()` — lit `role` + `social_enabled` |
| `functions/api/channels/request-access.ts` | la demande : trace + e-mail à l'équipe (bouton « Demander l'activation ») |
| `functions/api/admin/sites.ts` | **« Sites connectés »** : qui a branché quel site, avec quels réseaux (admin only) |
| `src/context/AuthContext.tsx` | lit `social_enabled` dans le profil — **sans ça, le cadenas ne peut pas savoir** |
| `src/components/SocialModuleLocked.tsx` | la page fermée : cadenas + « Prochainement » + « Demander l'activation » |
| `src/components/CopilotChat.tsx` | les **deux grandes cartes** de l'Accueil |
| `src/components/DashboardPlatform.tsx` | les deux espaces du menu, les cadenas, le verrou strict |
| `src/pages/AdminPage.tsx` | le bouton d'ouverture par client **et l'onglet « Sites connectés »** |
| `functions/api/health.js` | `socialModule: true/false` + la ligne `toFix` quand le SQL manque |
| `tests/social-lock.test.tsx` | 13 tests : page fermée (une seule action : demander), demande tracée, refus serveur, admin jamais bloqué |
| `tests/admin-sites-api.test.ts` | 4 tests : 401 sans jeton, 403 pour un marchand, réponse complète pour l'admin, dégradation sans la table |

**Règle du verrou (stricte)** : `social_enabled = true` → ouvert ; **tout le
reste est fermé** (colonne absente, profil non chargé, compte ordinaire non
activé). On ne devine jamais un « oui ».

## 6. Questions fréquentes

**Le client peut-il contourner le cadenas ?**
Non. Le serveur refuse (403) et la fonction `protect_user_profile()` empêche
même d'écrire `social_enabled` depuis le navigateur du client.

**Et si je me trompe de client ?**
Un clic sur le même bouton referme le module. Aucune donnée n'est supprimée.

**Le site public ?**
Il annonce le chatbot (disponible) et les réseaux comme un module activable sur
demande, sans prix inventé.
