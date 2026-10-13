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
- 📞 **L'appel** : l'agent vocal ne transporte plus la base dans son prompt — il la
  **cherche à la question** (`chercher_information` → `/api/voice/knowledge`, 900
  caractères maximum) et dit honnêtement quand il ne trouve rien.
- 📞 **L'appel** : le visiteur appuie sur le téléphone (dans l'en-tête du chat,
  ou directement sur la bulle en mode « le bot qui appelle ») et il **parle** à
  l'assistant — même base de connaissance, même voix réglée dans la console.
  Chrono, transcription en direct, micro à couper, et 6 appels max / 10 min / IP.
- Si l'assistant ne sait pas : il le dit et donne **l'e-mail / le WhatsApp de
  l'équipe** (réglés dans la console).

## 2. Ce que règle la console admin

Onglet **Chatbot du site** (groupe « MON SITE JAWEBFLOW ») :

| Bloc | Ce qu'on y règle |
| --- | --- |
| Interrupteur | `Chat ouvert` / `Chat fermé` — fermé ⇒ **aucune bulle** sur le site |
| Ce qu'il dit | message d'accueil, nom affiché, ligne d'état, questions rapides (6 max), texte du champ |
| Ce qu'il sait | base de connaissance (8 000 caractères), ton, langue, modèle, **qui mène la conversation**, réponse de secours, réponses IA on/off |
| Parler à un humain | e-mail, WhatsApp, libellé du bouton |
| Apparence & comportement | le **même personnalisateur que les clients** : logo/icône, couleurs, thème, forme, position, taille, badge en ligne, accroche, ouverture automatique, message proactif, CSS libre |
| Voix (onglet *5. Voix*) | appels on/off, **une des 6 voix**, phrase d'ouverture de l'appel, durée maximale — et le **mode du widget** : écrit + appels, écrit seulement, ou **« le bot qui appelle »** (aucun chat, la bulle est un bouton d'appel) |

**Aucun redéploiement** : on enregistre, les visiteurs voient le changement.

## 3. Comment ça marche (technique)

| Endroit | Rôle |
| --- | --- |
| `functions/_shared/site-chat.ts` | la forme des réglages, les valeurs par défaut, le nettoyage (`normalizeSiteChat`), la vue **publique** et le prompt système |
| `functions/api/site-chat.ts` | **GET** = réglages publics (liste blanche), **POST** = une réponse (IA ou secours). 20 messages / 10 min / visiteur |
| `functions/api/site-voice.ts` | **POST** = ouvre un **appel** : vérifie que la voix est allumée, fabrique le jeton éphémère Gemini Live (usage unique) et renvoie les réglages d'appel. 6 appels / 10 min / IP, 15 min max |
| `public/cdn/voice.js` | le moteur d'appel (WebRTC + Gemini Live) — le même que pour les widgets clients |
| `functions/api/admin/site-chat.ts` | **GET/POST** des réglages complets — jeton admin + rôle vérifié, sinon 401/403 |
| `src/components/FloatingLiveWidget.tsx` | la bulle du site : elle lit les réglages et les applique (aucun redéploiement) |
| `supabase/migration_site_chatbot.sql` | la table `platform_settings` (une ligne : `site_chat`) |

**Ce qui ne sort jamais du serveur** : la base de connaissance, le prompt, les
réglages internes. Le navigateur ne reçoit que ce que voit le visiteur.

**Panne de l'IA** (clé absente, quota Google, réseau) ⇒ la **phrase de secours**
réglée dans la console est renvoyée : le visiteur a toujours une réponse utile.

## 3 bis. 🎯 « Qui mène la conversation ? » — un choix, deux comportements

Dans la console (onglet *Chatbot du site* → **Le cerveau de l'assistant**), une question simple :

| Choix | Ce que fait l'assistant |
|---|---|
| **🤝 Il propose et guide** *(défaut)* | Il répond **puis** propose une option utile et la prochaine étape (essayer gratuitement, voir les tarifs, appeler). Une seule question par réponse, et seulement si elle fait avancer les choses. |
| **🎯 Il répond seulement** | C'est **le visiteur qui mène** : réponse précise à la question posée, puis il s'arrête. Aucune proposition non demandée, aucun argumentaire, aucune relance, aucun « voulez-vous… ? ». Il ne pose une question que si une information indispensable manque pour répondre. |

C'est écrit noir sur blanc dans le prompt (« ce mode annule toutes les consignes qui te demandent
de proposer, de recommander, de relancer ou de conclure ») : le modèle ne peut pas « dériver » vers
la vente quand le visiteur ne l'a pas demandé. **Aucun redéploiement** : on enregistre, c'est actif.

Les **assistants des clients** ont exactement le même réglage, dans leur console : *Comportement* →
**🎯 Qui mène la conversation ?** (il s'applique au chat du site **et** à Instagram).

## 4. Mise en route (une fois)

1. Supabase → SQL Editor → `supabase/migration_site_chatbot.sql` → **Run**.
   Sans cette table, tout fonctionne déjà avec les réglages par défaut (chat
   **et** appel), mais rien ne s'enregistre.

   ⚠️ **« J'ai pourtant exécuté le SQL »** : dans 9 cas sur 10, il a été exécuté
   dans un **autre projet** Supabase que celui de la production. La console
   admin affiche alors l'adresse du projet réellement utilisé, l'erreur exacte
   de Supabase, un bouton **« Ouvrir le SQL Editor de ce projet »** et un bouton
   **« Copier le SQL »** : plus besoin de chercher.
2. Vérifier que `GEMINI_API_KEY` est bien dans les variables Cloudflare Pages
   (c'est la même clé que les clients).
3. Console admin → **Chatbot du site** → régler → **Enregistrer** → ouvrir le
   site dans un autre onglet : la bulle est déjà à jour.

## 5. Les réglages qui ne s'enregistrent pas (diagnostic)

L'onglet affiche un encadré ambre quand la table est injoignable :

- **l'adresse du projet Supabase** que le serveur utilise vraiment ;
- **l'erreur brute** renvoyée par Supabase (code + message) ;
- **« Ouvrir le SQL Editor de ce projet »** (lien direct vers le bon projet) ;
- **« Copier le SQL »** (le `create table` complet, sans chercher le fichier) ;
- **« J'ai exécuté le SQL → Recharger »** pour revérifier en un clic.

## 6. Le coût

Un message du chatbot du site coûte **≈ 0,0014 $** (même modèle que les
clients : `gemini-3.1-flash-lite`, réponses plafonnées à 420 tokens, aucune
réflexion facturée). 1 000 messages ≈ **1,4 $**. Le garde-fou de 20 messages /
10 minutes / visiteur empêche un robot de vider le quota Google.

---

## 🎯 L'assistant du site ne fait pas que répondre : il collecte

Le même réglage que pour les clients : onglet **Voix** du personnalisateur →
« Sa mission pendant l'appel ». Sur le site vitrine, le CTA par défaut est
**« Créer son assistant gratuitement »** : au téléphone, l'assistant répond aux
questions, amène le visiteur à créer son assistant, et **note son nom, son
numéro et son besoin** via l'outil `enregistrer_demande`.

Les demandes arrivent dans **cette console** : onglet « Chatbot du site » →
**📞 Demandes notées pendant les appels**. Chaque ligne montre le nom, le
numéro, la ville, le besoin, le rendez-vous éventuel et la date — avec un bouton
**« Marquer traité »** (et le compteur de demandes non traitées sur l'onglet).
Elles sont stockées dans `platform_settings` (`id = site_leads`, 200 dernières,
même numéro = même demande).

Le visiteur reçoit la réponse de l'agent (« c'est noté, on vous rappelle ») sans
jamais voir qu'une fiche a été écrite.
