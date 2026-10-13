# 🔒 Le module Réseaux sociaux (produit séparé)

> **En une phrase** : le **chatbot à intégrer dans le site web** est ouvert à tous
> les clients ; les **réseaux sociaux** (Instagram, Messenger, WhatsApp,
> Telegram, TikTok) forment un **module à part**, ouvert **client par client**
> par JawebFlow.

---

## 1. Ce que voit le client

| État du module | Ce qu'il voit dans son espace |
| --- | --- |
| **Fermé** (par défaut) | L'entrée « Réseaux sociaux » avec un **cadenas** ; en l'ouvrant : les 5 réseaux annoncés, ce que ça apporte, et le bouton **« Demander l'activation »** + « J'ai été activé, vérifier » |
| **Ouvert** | Les onglets normaux : Instagram · Messenger · WhatsApp · Telegram · TikTok · Automatisations, avec le branchement habituel |

Le client garde donc **toujours** l'accès à l'espace Web : informations,
site web, comportement, apparence, apprentissage, installation du chat, test.

## 2. Ouvrir le module (3 étapes, une seule fois)

### a) Exécuter le SQL

Supabase → **SQL Editor** → coller `supabase/migration_module_social.sql` → Run.

Le script :

- ajoute `public.users.social_enabled` (**faux par défaut** = fermé) ;
- remet à jour `protect_user_profile()` : **un client ne peut pas s'ouvrir le
  module tout seul** depuis son navigateur (protection anti-contournement) ;
- crée `public.social_requests` (les demandes des clients) ;
- **ouvre d'office** le module des clients qui avaient déjà un canal branché —
  personne ne perd son accès au moment de la migration.

> Le même SQL est disponible dans la console admin → onglet **Système**
> (il y est déjà à jour).

### b) Ouvrir le module d'un client

Console admin → **Clients** → sur la ligne du client, le bouton sous sa formule :

- `🔒 Réseaux sociaux verrouillés` → cliquer ouvre le module ;
- `🔓 Réseaux sociaux ouverts` → cliquer referme.

La décision est **indépendante du plan** : le plan fixe le volume IA, ce bouton
fixe l'accès aux messageries.

### c) Rien d'autre

Le client recharge son tableau de bord (ou clique « J'ai été activé, vérifier »)
et retrouve ses onglets. **Les conversations déjà en cours ne sont jamais
coupées** par le verrou : il ne bloque que le branchement côté espace client.

## 3. Les demandes d'activation

Quand un client clique « Demander l'activation » :

1. la demande part **par e-mail** à `contact@jawebflow.dz`
   (avec son nom, sa formule et son identifiant de compte) ;
2. elle est **tracée** dans `social_requests` (jamais perdue si l'e-mail n'est
   pas configuré) ;
3. elle apparaît dans la console admin, **sur la ligne du client** :
   « ⏳ Activation demandée le … ».

Garde-fou : **3 demandes par jour et par compte** maximum.

## 4. Où c'est appliqué dans le code

| Endroit | Rôle |
| --- | --- |
| `supabase/migration_module_social.sql` | la colonne, l'anti-contournement, la table des demandes |
| `functions/api/channels/integrations.ts` | **refus 403** (`socialLocked: true`) si le module est fermé : appeler l'API directement n'ouvre rien |
| `functions/_shared/supabase.ts` | `supabaseGetAccountFlags()` — lit `role` + `social_enabled` |
| `functions/api/channels/request-access.ts` | la demande : vérification du jeton, trace, e-mail |
| `src/components/SocialModuleLocked.tsx` | le cadenas côté marchand (annonce + demande + vérification) |
| `src/components/DashboardPlatform.tsx` | les deux espaces du menu + les cadenas |
| `src/pages/AdminPage.tsx` | le bouton d'ouverture par client + la demande en attente |
| `tests/social-lock.test.tsx` | 7 tests : cadenas visible, demande tracée, refus serveur, admin jamais bloqué |

**Tolérance voulue** : si la colonne n'existe pas encore en base (migration non
exécutée), rien n'est bloqué — un faux cadenas serait pire qu'un module ouvert.
Dès que la migration est passée, le défaut est **fermé**.

## 5. Questions fréquentes

**Le client peut-il contourner le cadenas ?**
Non. Le serveur refuse (403) et la fonction `protect_user_profile()` empêche
même d'écrire `social_enabled` depuis le navigateur du client.

**Et si je me trompe de client ?**
Un clic sur le même bouton referme le module. Aucune donnée n'est supprimée.
