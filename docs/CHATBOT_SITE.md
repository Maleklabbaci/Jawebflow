# 🤖 Le chatbot de jawebflow.dz (les pages publiques)

> **En une phrase** : la bulle de discussion que voient vos visiteurs **avant**
> d'entrer dans l'interface (accueil, tarifs, services, contact…) est un vrai
> chatbot — et tout se règle depuis la console admin, onglet **« Chatbot du site »**.

---

## 1. Ce que voit le visiteur

- Une **bulle** en bas de page (position, forme, taille, couleur : réglables).
- Une **accroche** : bulle qui pulse, phrase qui apparaît après X secondes,
  ouverture automatique du chat, message proactif du bot, bouton d'appel.
- Un **chat** : message d'accueil, questions rapides cliquables, réponses de
  l'IA, et un bouton « Créer mon assistant gratuitement » sous chaque réponse.
- Si l'assistant ne sait pas : il le dit et donne **l'e-mail / le WhatsApp de
  l'équipe** (réglés dans la console).

## 2. Ce que règle la console admin

Onglet **Chatbot du site** (groupe « MON SITE JAWEBFLOW ») :

| Bloc | Ce qu'on y règle |
| --- | --- |
| Interrupteur | `Chat ouvert` / `Chat fermé` — fermé ⇒ **aucune bulle** sur le site |
| Ce qu'il dit | message d'accueil, nom affiché, ligne d'état, questions rapides (6 max), texte du champ |
| Ce qu'il sait | base de connaissance (8 000 caractères), ton, langue, modèle, réponse de secours, réponses IA on/off |
| Parler à un humain | e-mail, WhatsApp, libellé du bouton |
| Apparence & comportement | le **même personnalisateur que les clients** : logo/icône, couleurs, thème, forme, position, taille, badge en ligne, accroche, ouverture automatique, message proactif, CSS libre |

**Aucun redéploiement** : on enregistre, les visiteurs voient le changement.

## 3. Comment ça marche (technique)

| Endroit | Rôle |
| --- | --- |
| `functions/_shared/site-chat.ts` | la forme des réglages, les valeurs par défaut, le nettoyage (`normalizeSiteChat`), la vue **publique** et le prompt système |
| `functions/api/site-chat.ts` | **GET** = réglages publics (liste blanche), **POST** = une réponse (IA ou secours). 20 messages / 10 min / visiteur |
| `functions/api/admin/site-chat.ts` | **GET/POST** des réglages complets — jeton admin + rôle vérifié, sinon 401/403 |
| `src/components/FloatingLiveWidget.tsx` | la bulle du site : elle lit les réglages et les applique (aucun redéploiement) |
| `supabase/migration_site_chatbot.sql` | la table `platform_settings` (une ligne : `site_chat`) |

**Ce qui ne sort jamais du serveur** : la base de connaissance, le prompt, les
réglages internes. Le navigateur ne reçoit que ce que voit le visiteur.

**Panne de l'IA** (clé absente, quota Google, réseau) ⇒ la **phrase de secours**
réglée dans la console est renvoyée : le visiteur a toujours une réponse utile.

## 4. Mise en route (une fois)

1. Supabase → SQL Editor → `supabase/migration_site_chatbot.sql` → **Run**.
   Sans cette table, tout fonctionne déjà avec les réglages par défaut, mais
   rien ne s'enregistre (la console le dit en clair).
2. Vérifier que `GEMINI_API_KEY` est bien dans les variables Cloudflare Pages
   (c'est la même clé que les clients).
3. Console admin → **Chatbot du site** → régler → **Enregistrer** → ouvrir le
   site dans un autre onglet : la bulle est déjà à jour.

## 5. Le coût

Un message du chatbot du site coûte **≈ 0,0014 $** (même modèle que les
clients : `gemini-3.1-flash-lite`, réponses plafonnées à 420 tokens, aucune
réflexion facturée). 1 000 messages ≈ **1,4 $**. Le garde-fou de 20 messages /
10 minutes / visiteur empêche un robot de vider le quota Google.
