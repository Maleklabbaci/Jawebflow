# 🔒 Le module Réseaux sociaux (produit séparé)

> **En une phrase** : le **chatbot à intégrer dans le site web** est ouvert à tous
> les clients ; les **réseaux sociaux** (Instagram, Messenger, WhatsApp,
> Telegram, TikTok) forment un **module à part**, ouvert **client par client**
> par JawebFlow. Tant qu'il est fermé, le client voit un cadenas et
> « Prochainement » — il n'entre pas.

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

Une page avec **un cadenas et « Prochainement »** — et rien d'autre :

- pas de tour du module, pas de réglages, pas de formulaire de branchement ;
- **aucune action possible** : pas de bouton « demander », pas de bouton
  « vérifier » ;
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

**Il n'y a plus de bouton côté client** (choix retenu : « cadenas seulement »).
L'équipe ouvre donc le module de sa propre initiative — c'est un module vendu à
part, à proposer au bon moment.

La route `POST /api/channels/request-access` **reste en place et testée**, si on
veut rouvrir un jour un bouton « Demander l'accès » : elle écrit la demande dans
`social_requests`, prévient `contact@jawebflow.dz` par e-mail, et se limite à
3 demandes par jour et par compte.

## 5. Où c'est appliqué dans le code

| Endroit | Rôle |
| --- | --- |
| `supabase/migration_module_social.sql` | la colonne, l'anti-contournement, la table des demandes |
| `functions/api/channels/integrations.ts` | **refus 403** (`socialLocked: true`) si le module est fermé : appeler l'API directement n'ouvre rien |
| `functions/_shared/supabase.ts` | `supabaseGetAccountFlags()` — lit `role` + `social_enabled` |
| `functions/api/channels/request-access.ts` | la demande (route disponible, non branchée à un bouton) |
| `src/context/AuthContext.tsx` | lit `social_enabled` dans le profil — **sans ça, le cadenas ne peut pas savoir** |
| `src/components/SocialModuleLocked.tsx` | la page fermée : cadenas + « Prochainement » |
| `src/components/CopilotChat.tsx` | les **deux grandes cartes** de l'Accueil |
| `src/components/DashboardPlatform.tsx` | les deux espaces du menu, les cadenas, le verrou strict |
| `src/pages/AdminPage.tsx` | le bouton d'ouverture par client |
| `functions/api/health.js` | `socialModule: true/false` + la ligne `toFix` quand le SQL manque |
| `tests/social-lock.test.tsx` | 12 tests : page fermée sans aucune action, deux cartes, refus serveur, admin jamais bloqué |

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
