# Ajouter des canaux (réseaux sociaux) — ce qui est possible et ce que ça coûte

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Les tarifs Meta ont changé le **1er octobre 2026** (voir §3) : les chiffres ci-dessous
> sont ceux du barème en vigueur aujourd'hui, pas ceux des guides plus anciens.

---

## 0. La réponse en une page

Aujourd'hui JawebFlow a **deux canaux** : le **widget web** et **Instagram** (DM + commentaires).
Voici tout ce qu'on peut ajouter, classé par rapport intérêt / coût :

| Canal | Faisable ? | Coût Meta par message | Effort de dev (estimation) | Verdict |
|---|---|---|---|---|
| **Facebook Messenger** (+ commentaires de Page) | Oui — même app Meta qu'Instagram | **0 $** (Send API gratuite, Meta ne facture rien) | 5–8 j | ✅ **À faire en premier** : gain fort, coût marginal nul |
| **Telegram** | Oui — Bot API | **0 $** (aucun frais, aucune validation d'app) | 2–4 j | ✅ Rapide et gratuit, mais petite audience en Algérie |
| **WhatsApp Cloud API** | Oui — parcours « Tech Provider » Meta | Algérie : **0,62 DA** par réponse, **1 000 gratuites/numéro/mois** ; marketing **3,50 DA** | 15–25 j **+ 2 à 6 semaines d'attente Meta** | ⚠️ Le plus demandé **et** le plus lourd — à cadrer commercialement avant de coder |
| **TikTok** (Business Messaging API) | Beta, **région-restreint**, approbation requise | 0 $ (côté messages) | 5–10 j + approbation | 🔎 À surveiller, pas à promettre |
| **X (Twitter)** | Techniquement, mais… | Facturation à l'usage ; DM réservés aux offres entreprise | — | ❌ Plus de palier gratuit depuis févr. 2026 → non viable |
| **LinkedIn** | Messagerie API fermée aux partenaires | — | — | ❌ Peu pertinent pour la cible |
| **Snapchat** | Pas d'API de messagerie business | — | — | ❌ |
| **Google Business Profile** | Messagerie **supprimée par Google le 31 juillet 2024** | — | — | ❌ N'existe plus |

**En clair :** le prochain vrai canal, c'est **Messenger** (gratuit, cohérent avec l'existant),
puis **WhatsApp** (le plus demandé par les commerçants algériens, mais le seul qui coûte de
l'argent **par message** et qui exige un statut Meta particulier).

> ⚠️ La page Tarifs promet **déjà** au plan Pro « Accès anticipé WhatsApp & réseaux sociaux
> (prochainement) » et au plan Enterprise « Tous les canaux dès leur disponibilité ».
> Ces deux promesses ne sont aujourd'hui adossées à aucun code : c'est le premier argument
> pour livrer Messenger + Telegram vite, et pour cadrer WhatsApp proprement.

---

## 1. Ce que le dépôt sait déjà faire (et ce qui se réutilise)

Le moteur Instagram est déjà une machine « canal » complète, et elle est découpée de façon
réutilisable :

| Brique existante | Fichier | Réutilisable pour… |
|---|---|---|
| Logique pure des automatisations (mots-clés, variables, validation, simulateur) | `functions/_shared/ig-automation-core.ts` (752 l.) | Messenger / WhatsApp sans presque rien changer |
| Moteur (anti-doublon, règles avant l'IA, « suis mon compte ») | `functions/_shared/ig-automations.ts` (594 l.) | idem |
| Appels API + erreurs traduites en français | `functions/_shared/ig-api.ts` (364 l.) | modèle à copier pour Messenger / WhatsApp |
| Webhook | `functions/api/webhook/instagram.ts` (1 506 l.) | **le point à factoriser** avant d'ajouter un 3ᵉ canal |
| Base de données | `supabase/migration_ig_automations.sql` | table générique `channel_automations` |
| Cerveau du bot (prompt, relances, commandes, leads, coach) | `functions/_shared/prompt.ts`, `sales-intent.ts`, `relances.ts`… | **déjà indépendant du canal** |

**Deux dettes à traiter AVANT d'ajouter un canal** (elles sont déjà signalées dans `AUDIT.md` §1
et `DEV.md` §4) :

1. **Deux moteurs** (`server.ts` + `functions/`) : chaque nouvelle règle devrait être écrite
   deux fois. Un canal de plus double le problème.
2. **Webhooks Meta en doublon** (`/api/webhook/instagram` et `/api/instagram/webhook`) ;
   Meta ne peut pointer que vers **une** URL par champ. Ajouter Messenger/WhatsApp impose de
   trancher, sinon on aura 4 endpoints concurrents.

**Recommandation technique :** créer `functions/_shared/channels/` avec une petite interface
`{ verifySignature, parseInbound, sendMessage, fetchProfile }` et y faire rentrer Instagram,
puis Messenger/WhatsApp. Le reste du code (`prompt.ts`, `supabase.ts`, quotas, leads, relances)
ne bouge pas.

---

## 2. Fiche par canal

### 2.1 Facebook Messenger + commentaires de Page — le meilleur rapport valeur/effort

- **Coût Meta : 0 $.** La **Send API n'a aucun frais par message** : Meta ne facture rien pour
  le service client standard sur Messenger. Le coût vit dans la plateforme (donc : chez vous),
  pas chez Meta.
- **Ce qu'on gagne :** exactement les mêmes promesses qu'Instagram, mais sur l'autre réseau que
  vos clients utilisent en Algérie — DM automatiques, **réponse publique + MP sous un commentaire
  de Page** (mêmes règles de mots-clés que celles déjà codées dans `ig-automation-core.ts`),
  détection de leads (nom, téléphone, ville) dans le même tableau de bord.
- **Prérequis Meta :** permission `pages_messaging` (+ `pages_manage_engagement` pour les
  commentaires) en **accès avancé** → **App Review** + **vérification d'entreprise**. C'est
  **gratuit**, mais cela prend des jours à quelques semaines, et il faut une URL de politique de
  confidentialité (le dépôt a déjà `src/pages/PrivacyPage.tsx`).
- **Point de vigilance :** Meta a annoncé une facturation à venir pour **Marketing Messages on
  Messenger** (relances publicitaires). Aujourd'hui c'est gratuit pendant le déploiement ;
  prévoir que ça devienne payant un jour, comme pour WhatsApp. Le service client, lui, reste gratuit.
- **Effort estimé : 5–8 jours**, surtout parce que le moteur (`prompt`, relances, leads) existe déjà.

### 2.2 Telegram — quasi gratuit et très rapide

- **Coût Telegram : 0 $**, sans limite de volume, sans carte bancaire, sans validation d'app :
  on parle à `@BotFather`, on obtient un jeton, et c'est fini. Seule exception : les
  « paid broadcasts » (0,1 étoile par message au-delà du débit gratuit) — inutiles ici.
- **Ce qu'on gagne :** un canal de test parfait pour valider le moteur multi-canaux **sans
  dépendre de Meta**, et un canal utile pour les commerçants B2B/tech.
- **Effort estimé : 2–4 jours** (un webhook + un adaptateur ; pas d'OAuth, pas de revue).

### 2.3 WhatsApp Cloud API — le plus demandé, le seul qui coûte au message

C'est le canal que **tous** vos clients vont réclamer : en Algérie, WhatsApp est l'endroit où
les gens écrivent aux commerces. Aujourd'hui JawebFlow ne sait faire qu'un **bouton « Direct
WhatsApp »** (`wa.me`) dans le widget — c'est-à-dire rediriger vers l'humain, pas faire répondre l'IA.

**Ce que ça implique côté Meta (fichier `AUDIT.md` §6.2 à garder en tête) :**

1. Devenir **Tech Provider** (ou Solution Partner) : vérification d'entreprise, App Review des
   permissions `whatsapp_business_messaging` + `whatsapp_business_management` en accès avancé,
   onboarding en **Embedded Signup**. C'est **gratuit** mais c'est un vrai dossier, et
   **Embedded Signup v2/v3 est déprécié au 15 octobre 2026** → implémenter directement **v4**.
2. Chaque client doit avoir : un **numéro dédié** (qui ne peut pas être utilisé en même temps
   dans l'app WhatsApp normale, sauf mode « Coexistence »), un **WABA**, un **nom d'affichage**
   validé, et des **templates approuvés** pour tout message hors fenêtre de 24 h.
3. **Consentement / opt-in** obligatoire pour les messages initiés par l'entreprise.

**Ce que ça implique côté code :** webhook WhatsApp, gestion de la **fenêtre de service 24 h**,
gestion des **templates**, **comptage et refacturation des messages**, plus un onglet de
connexion façon `InstagramIntegration.tsx`. **Effort estimé : 15–25 jours**, plus l'attente Meta.

### 2.4 TikTok — intéressant, mais à ne pas promettre

- La **Business Messaging API** existe (DM obligatoire, « comment-to-message », webhooks), mais
  elle est en **Open Beta régional** (APAC, LATAM, METAP, Amérique du Nord) et **indisponible
  pour l'EEE, la Suisse et le Royaume-Uni**. Comptes **Business** uniquement, **candidature et
  approbation** obligatoires, revue de sécurité des données.
- **Gratuit côté messages.** L'intérêt est réel (audience jeune), mais l'éligibilité d'un compte
  Algérie n'est pas garantie : à tester avec un compte pilote avant toute promesse commerciale.
- **Effort estimé : 5–10 jours** + délai d'approbation.

### 2.5 Les impasses à documenter pour ne plus les re-proposer

| Plateforme | Pourquoi c'est mort |
|---|---|
| **X (Twitter)** | Le palier gratuit a disparu (févr. 2026) ; facturation à l'usage (0,015 $/post, **0,20 $** si le post contient un lien) et les DM ne sont pas ouverts aux offres self-serve. Aucun sens pour du service client automatisé. |
| **LinkedIn** | La messagerie n'est ouverte qu'aux partenaires ; le reste (Lead Gen Forms) ne correspond pas à un bot conversationnel. |
| **Snapchat** | Pas d'API de messagerie business. |
| **Google Business Profile** | La messagerie a été **supprimée le 31 juillet 2024** (et l'API Business Messages avec). |
| **SMS** (hors réseaux sociaux) | Possible via un agrégateur, **payant au SMS**, utile seulement comme canal de **relance** ; à traiter plus tard comme une option, pas comme un canal de conversation. |

---

## 3. Les tarifs Meta en détail (barème du 1er octobre 2026)

### 3.1 Ce qui a changé le 1er octobre 2026 — et qui change tout

Depuis le 1er novembre 2024, **répondre dans la fenêtre de 24 h était gratuit et illimité**.
**Ce n'est plus vrai depuis le 1er octobre 2026** :

- chaque **message de service** (une réponse libre, y compris celle d'un **bot IA tiers** comme
  le vôtre) est facturé **au tarif « utility » du pays** ;
- **1 000 messages de service gratuits par numéro d'entreprise et par mois** (remis à zéro
  chaque mois, non cumulables) ;
- les **templates utility envoyés dans la fenêtre de 24 h** sont désormais facturés aussi ;
- la **fenêtre de 72 h des « Click-to-WhatsApp »** (pub) reste **gratuite**.

Autrement dit : **un bot IA non borné sur WhatsApp est maintenant une dépense variable.**
C'est le point le plus important de ce document.

### 3.2 Tarifs Algérie (par message livré, en USD)

| Catégorie | Tarif | ≈ en DA (à 135 DA/$) | Quand ça s'applique |
|---|---|---|---|
| **Marketing** | 0,0259 $ | ≈ **3,50 DA** | promotions, relances, campagnes — **sans aucune franchise** |
| **Utility** | 0,0046 $ | ≈ **0,62 DA** | confirmations de commande, rappels de RDV |
| **Service** (les réponses du bot) | 0,0046 $ | ≈ **0,62 DA** | au-delà de **1 000 gratuites/numéro/mois** ; c'était gratuit avant le 01/10/2026 |
| **Authentication** | 0,0046 $ | ≈ **0,62 DA** | codes OTP (peu utile ici) |
| Messages **entrants** (le client écrit) | **0 $** | 0 DA | toujours gratuit |
| Fenêtre **72 h** après un clic sur une pub WhatsApp | **0 $** | 0 DA | tout message, templates compris |

> ⚠️ **Correction :** la doc officielle Meta classe l'**Algérie dans la région « Rest of Africa »**
> (indicatif +213 dans la table des codes pays), et **non** en tarif propre : ce sont donc les
> taux « Rest of Africa » qui s'appliquent. Une fourchette de 0,0040–0,0046 $ circule selon les
> barèmes partenaires. **À revérifier dans le Billing Hub Meta avant de publier un prix.**
> Le calcul complet est dans **`docs/COUTS_WHATSAPP.md`** (`node scripts/couts-whatsapp.mjs`).

### 3.3 Ce que ça donne concrètement

Hypothèses : **6 réponses du bot par conversation**, 1 numéro par client, aucune campagne
marketing. (Détail complet : `docs/COUTS_WHATSAPP.md`.)

| Profil | Conversations/mois | Messages du bot | Facturés (après les 1 000 gratuits) | Coût Meta + IA/mois |
|---|---|---|---|---|
| Petit commerce | 40 | 240 | 0 | **45 DA** (IA seule) |
| Client actif (≈ quota Basic) | 200 | 1 200 | 200 | **347 DA** |
| Gros client | 800 | 4 800 | 3 800 | **3 253 DA** (47,5 % du pack Basic) |
| Très gros client | 2 500 | 15 000 | 14 000 | **11 484 DA** |

**⚠️ Alerte marge :** vos plans actuels sont **Basic 6 850 DA** et **Pro 18 700 DA** par mois.
À **800 conversations WhatsApp/mois**, le coût du canal absorbe déjà **47,5 %** du pack Basic
et **17 %** du pack Pro ; à **2 500 conversations**, il dépasse le prix du pack Basic
(**167 %**). Trois façons de s'en sortir :

1. **Pass-through** : le client paie Meta au message (comme un crédit prépayé), vous prenez une
   marge dessus. Le plus sain économiquement.
2. **Option payante** : WhatsApp en **add-on** (ex. +X DA/mois incluant N messages service, puis
   facturation à l'unité) — c'est ce que font ManyChat, Wati, etc.
3. **Plafond dur** : WhatsApp réservé à *Enterprise* ou limité à N conversations/mois par plan,
   avec coupure nette (le code sait déjà faire : `LIMIT_REACHED` dans `chat.js`).

**Bonne nouvelle :** pour un petit commerce qui envoie **moins de 1 000 messages/mois**, Meta ne
facture **rien**. C'est un argument commercial énorme face aux concurrents.

### 3.4 L'alternative « Meta Business Agent » (à éviter ici)

Meta vend son **propre agent IA** intégré : depuis le **1er août 2026** il est facturé **2,00 $
par million de jetons** (≈ **4–5 cents par message**, soit ~5,50–6,75 DA — **10× votre tarif
algérien**). Meta ne facture jamais deux fois le même message : une réponse du Business Agent est
facturée au jeton, une réponse de **votre** IA est facturée comme message de service.
**Conclusion : votre bot maison est beaucoup moins cher en Algérie.** Une réponse du bot
coûte 0,81 DA (Meta 0,62 DA + IA 0,19 DA), contre ~5,4 à 6,8 DA pour l'agent de Meta, soit
**~7× moins cher**. Le vrai coût, c'est le tarif Meta par message, pas le modèle Gemini.

### 3.5 Si vous ne voulez pas du statut Tech Provider

Il est possible de passer par un **BSP** (Twilio, 360dialog, Infobip…). C'est plus rapide à
brancher, mais :

- Twilio : **+0,005 $ par message** (entrant comme sortant) → le message de service Algérie passe
  de 0,0046 $ à **0,0096 $ ≈ 1,30 DA**, soit **×2,1** ;
- 360dialog : ~49 $/mois de base + 0,005 $/message ;
- Vous restez **dépendant d'un tiers** pour l'onboarding de vos clients.

**Verdict :** si WhatsApp devient un pilier de l'offre, devenir Tech Provider directement ;
si c'est un test, un BSP peut servir de sonde pendant quelques semaines.

---

## 4. Coût des réseaux : récapitulatif « ça coûte combien ? »

| Poste | Qui paie | Montant |
|---|---|---|
| Messenger (service client, commentaires) | personne | **0 $** |
| Telegram | personne | **0 $** |
| WhatsApp — frais Meta | le client (recommandé) | Algérie : **0,62 DA/réponse** au-delà de **1 000/numéro/mois** ; marketing **3,50 DA** (sans franchise) |
| TikTok | personne (côté messages) | **0 $** + candidature |
| Accès API (Cloud API, Embedded Signup, App Review, vérification d'entreprise) | vous | **0 $** — c'est du temps et de la conformité, pas de l'argent |
| Domaine, hébergement site + API | vous | Cloudflare Pages/Workers : offre gratuite largement suffisante (100 000 requêtes/jour) ; **5 $/mois** si dépassement |
| Base de données (Supabase) | vous | gratuit jusqu'à ~500 Mo ; **25 $/mois** au-delà (plan Pro) |
| Modèle IA (Gemini) | vous | négligeable devant les frais Meta ci-dessus — le chiffre réel est déjà dans **Admin → « Coût IA »** (`aiUsage.costUsd`) |
| **Développement** | vous | Messenger **5–8 j** · Telegram **2–4 j** · WhatsApp **15–25 j** · TikTok **5–10 j** (+ délais Meta) |

Le seul poste qui peut réellement faire mal, c'est **le volume de messages WhatsApp**, pas les
réseaux sociaux en général.

---

## 5. Ordre de mise en œuvre recommandé

1. **Factoriser** (`functions/_shared/channels/`, un seul webhook Meta, `channel_automations` en
   base) — **2–3 jours**. Sans ça, chaque canal ajouté coûte deux fois plus cher.
2. **Telegram** — **2–4 jours**. Valide l'architecture multi-canal sans dépendre de Meta + gratuit.
3. **Facebook Messenger** — **5–8 jours** + App Review. Le gain commercial est immédiat et le coût
   par message est nul ; on réutilise tel quel le « commentaire → MP » déjà écrit pour Instagram.
4. **WhatsApp**, dans cet ordre :
   a. décider du **modèle commercial** (§3.3) ;
   b. lancer le **dossier Meta** (Tech Provider, vérification d'entreprise, App Review) — c'est le
      chemin critique, le code peut avancer en parallèle ;
   c. développer webhook + fenêtre 24 h + templates + **compteur de messages facturables par
      client** (indispensable : sans lui, vous ne pouvez ni refacturer, ni couper).
5. **TikTok** : compte pilote pour vérifier l'éligibilité Algérie, puis décision.
6. **SMS / e-mail** : à considérer plus tard comme canaux de **relance** (panier abandonné),
   pas de conversation.

---

## 6. Sources (vérifiées le 7 octobre 2026)

- Meta — *Pricing on the WhatsApp Business Platform*, page officielle mise à jour le 30/09/2026
  (catégories, 1 000 messages de service gratuits par numéro et par mois à partir du 01/10/2026,
  fenêtre gratuite de 72 h) : https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta — *Embedded Signup : Implementation* (mise à jour du 24/07/2026, **v2/v3 dépréciés au
  15/10/2026**, prérequis Tech Provider / Solution Partner) : https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/
- Meta — *Onboarding WhatsApp Business app users* (prérequis Solution Partner / Tech Provider,
  mode Coexistence) : https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/
- Tarifs par pays (barème du 01/10/2026 ; **Algérie = « Rest of Africa »**, 0,0259 $ / 0,0046 $ / 0,0046 $) : relevés BSP
  et agrégateurs — Whautomate (https://whautomate.com/whatsapp-business-api-pricing),
  Gallabox (https://docs.gallabox.com/pricing-and-billing/whatsapp-pricing/rate-card),
  ManyChat (https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide).
- Meta Business Agent : 2,00 $ / million de jetons depuis le 01/08/2026, ~4–5 cents par message,
  sans double facturation avec les messages de service :
  https://www.wati.io/en/blog/whatsapp-service-message-pricing/
- Twilio — *WhatsApp pricing* (frais de traitement **0,005 $/message**, pass-through des frais Meta) :
  https://www.twilio.com/en-us/whatsapp/pricing
- TikTok — *Business Messaging API* (Open Beta régional, comptes Business, approbation) :
  https://business-api.tiktok.com/portal/docs/business-messaging-api/v1.3
- X — fin du palier gratuit (févr. 2026) et facturation à l'usage :
  https://www.outstand.so/blog/x-api-pricing
- Google — fin de la messagerie Business Profile et de l'API Business Messages (31/07/2024) :
  https://www.mbadv.agency/google-business-profile/using-messaging-in-google-business-profile
- Telegram — Bot API gratuite, sans quota facturé : https://freeapihub.com/apis/telegram-bot-api
