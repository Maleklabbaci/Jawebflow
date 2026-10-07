# Combien ça te coûte exactement — tous les frais, WhatsApp compris

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> **Taux retenu : 1 $ = 270 DA** — le taux réel d'accès au dollar (le taux officiel de la
> Banque d'Algérie, ≈ 134 DA, ne s'applique pas à tes achats).
> Rejouable : `node scripts/couts-totaux.mjs` · `--clients=100` · `--change=250`

---

## 1. Les 4 packs, WhatsApp compris — l'essentiel

| Pack | Prix | Inclus | WhatsApp | **Coût réel** | Marge | **Marge %** |
|---|---|---|---|---|---|---|
| **Découverte** | 0 DA | IA coupée | — | 0 DA | — | — |
| **Basic** | 6 850 DA | 1 000 conv. web | ❌ **non inclus** | **852 DA** | 5 998 DA | **87,6 %** |
| **Pro / Business** | 18 700 DA | 5 000 conv. web | ✅ **1 000 msg/mois** | **1 266 DA** | 17 434 DA | **93,2 %** |
| **Enterprise** | 47 100 DA | illimité | ✅ **5 000 msg/mois** | **9 070 DA** | 38 030 DA | **80,7 %** |

*Scénario A — usage réaliste : Basic 250 conversations web · Pro 200 conversations web + 1 000
messages WhatsApp · Enterprise 500 + 5 000.*

**En une phrase :** WhatsApp coûte **1 266 − 594 = 672 DA** de plus qu'un Pro sans WhatsApp
(c'est-à-dire **3,6 %** du pack, dont 373 DA d'IA et 299 DA de frais d'encaissement en plus),
et le pack garde **93 % de marge**.

---

## 2. Le détail complet, poste par poste

### Scénario A — usage réaliste

| Pack | Prix | IA web | IA WhatsApp | Meta | Encaissement | **COÛT TOTAL** | Marge | Marge % |
|---|---|---|---|---|---|---|---|---|
| Découverte | 0 DA | — | — | — | — | **0 DA** | — | — |
| **Basic** | 6 850 DA | 743 DA | 0 DA | 0 DA | 110 DA | **852 DA** | 5 998 DA | 87,6 % |
| **Pro** | 18 700 DA | 594 DA | 373 DA | 0 DA | 299 DA | **1 266 DA** | 17 434 DA | 93,2 % |
| **Enterprise** | 47 100 DA | 1 485 DA | 1 863 DA | 4 968 DA | 754 DA | **9 070 DA** | 38 030 DA | 80,7 % |

**Pourquoi Meta est à 0 DA sur Pro :** les **1 000 premiers messages de service de chaque
numéro sont gratuits** chez Meta. Le forfait Pro tombe exactement dedans — il ne te coûte donc
que l'IA.

### Scénario B — usage maximal (le pire cas)

Le client consomme **tout** ce que les plafonds autorisent, WhatsApp compris.

| Pack | Plafond IA | Conv. web | WhatsApp | Coût IA | dont Meta | **COÛT TOTAL** | Marge | Marge % |
|---|---|---|---|---|---|---|---|---|
| **Basic** | 3 $ (810 DA) | 272 | non inclus | 810 DA | 0 DA | **920 DA** | 5 930 DA | 86,6 % |
| **Pro** | 20 $ (5 400 DA) | 1 692 | 1 000 | 5 400 DA | 0 DA | **5 699 DA** | 13 001 DA | 69,5 % |
| **Enterprise** | 30 $ (8 100 DA) | 2 100 | 5 000 | 8 100 DA | 4 968 DA | **13 822 DA** | 33 278 DA | 70,7 % |

> ⚠️ **Le plafond IA ne borne que Gemini.** Les frais Meta (colonne « dont Meta ») ne sont
> bornés par rien : ils suivent le volume. C'est le seul endroit où une dérive est possible —
> d'où l'importance de facturer les messages au-delà du forfait.

*(Le plafond Pro est celui que je recommande : **20 $** au lieu des 9 $ actuels, sinon le client
n'a pas de quoi consommer son forfait WhatsApp + son quota web.)*

---

## 2 bis. « Et tout » : Messenger + Telegram + TikTok + WhatsApp

### La règle qui simplifie tout : **seul WhatsApp a des frais au message**

| Canal | Frais plateforme / message | Dev. | État | Prérequis |
|---|---|---|---|---|
| Widget web | **AUCUN** | 0 j | en production | — |
| Instagram (DM + commentaires) | **AUCUN** | 0 j | en production | App Meta (déjà en place) |
| **Telegram** | **AUCUN** | 2–4 j | à développer | aucun (BotFather) |
| **Facebook Messenger** | **AUCUN** | 5–8 j | à développer | App Review Meta (`pages_messaging`) |
| **TikTok** (DM + commentaires) | **AUCUN** | 5–10 j | beta, à tester | Business Messaging API + approbation |
| **WhatsApp** | **1,24 DA** | 15–25 j | à développer | Tech Provider + vérification d'entreprise |

**Meta ne facture rien sur Messenger** (la Send API est gratuite) et **TikTok ne facture rien
sur aucune API officielle** — aucun tarif au message n'existe sur le portail développeur.
Leur seul coût récurrent, c'est **l'IA : 2,97 DA par conversation**, la même quelle que soit
la plateforme.

### Le vrai coût de « et tout », c'est le développement

**27 à 47 jours de travail** : Messenger 5–8 j + Telegram 2–4 j + TikTok 5–10 j +
WhatsApp 15–25 j. Les frais d'API sont nuls pour 3 canaux sur 4 : ce que tu paies, c'est
le temps — et, pour WhatsApp, le dossier Meta.

> ⚠️ **TikTok** : accès gratuit mais **payant en temps** — compte Business obligatoire,
> candidature à la Business Messaging API, revue de sécurité des données, et l'API reste en
> **beta restreinte** (APAC, LATAM, METAP, Amérique du Nord ; l'EEE, la Suisse et le
> Royaume-Uni en sont exclus). **L'Algérie relève de METAP** : éligibilité probable, mais **à
> confirmer avec un compte pilote avant de le promettre à un client.**

### Le coût des packs si le client utilise TOUS les canaux

Usage « et tout » : Basic 400 conversations tous canaux · Pro 900 + 1 000 messages WhatsApp ·
Enterprise 2 500 + 5 000 messages WhatsApp.

| Pack | Prix | IA canaux | IA WhatsApp | Meta | Encaissement | **COÛT TOTAL** | **Marge %** |
|---|---|---|---|---|---|---|---|
| **Basic** | 6 850 DA | 1 188 DA | 0 DA | 0 DA | 110 DA | **1 298 DA** | **81,1 %** |
| **Pro** | 18 700 DA | 2 673 DA | 373 DA | 0 DA | 299 DA | **3 345 DA** | **82,1 %** |
| **Enterprise** | 47 100 DA | 7 425 DA | 1 863 DA | 4 968 DA | 754 DA | **15 010 DA** | **68,1 %** |

**À lire attentivement :** la marge baisse **non pas à cause des nouveaux réseaux** (ils sont
gratuits) mais parce que **plus de canaux = plus de conversations = plus de tokens Gemini**.
C'est la seule dépense que « et tout » ajoute réellement.

### Où mettre chaque canal (recommandation)

| Canal | Coût récurrent | Où le placer |
|---|---|---|
| Web + Instagram | 0 | tous les packs (déjà en place) |
| **Messenger + Telegram** | 0 (hors IA) | **tous les packs payants, Basic compris** — c'est de la valeur gratuite |
| **TikTok** | 0 (hors IA) | tous les packs payants, **mais après le test d'éligibilité** |
| **WhatsApp** | 1,24 DA/message | **Pro (1 000 inclus) · Enterprise (5 000)** |

**Pourquoi donner Messenger et Telegram à Basic ne coûte rien :** aucun frais de plateforme.
Le seul effet, c'est que **le plafond IA de Basic se remplit plus vite** — un commerçant
présent sur 4 réseaux atteint ses **272 conversations** en quelques semaines.

### Les plafonds IA à ajuster en conséquence

| Pack | Plafond actuel | Couvre | **Plafond proposé** | Couvre |
|---|---|---|---|---|
| Basic | 3 $ (810 DA) | 272 conv. | **5 $ (1 350 DA)** | **454 conv.** (4 canaux, sans WhatsApp) |
| Pro | 9 $ (2 430 DA) | 817 conv. | **20 $ (5 400 DA)** | 1 692 conv. + 1 000 msg WhatsApp |
| Enterprise | 30 $ (8 100 DA) | 2 100 conv. | **30 $ (8 100 DA)** | 2 100 conv. + 5 000 msg WhatsApp |

*Rappel : ce plafond ne borne que Gemini — les frais Meta suivent le volume.*

### Ordre de mise en œuvre recommandé

1. **Telegram** (2–4 j) — valide l'architecture multi-canal sans dépendre de Meta, gratuit.
2. **Messenger** (5–8 j) — le plus gros gain en Algérie après WhatsApp, coût nul, réutilise
   le « commentaire → MP » déjà écrit pour Instagram.
3. **TikTok** (5–10 j) — **après** un compte pilote pour vérifier l'éligibilité METAP.
4. **WhatsApp** (15–25 j + dossier Meta) — le seul canal payant, à cadrer commercialement.

---

## 3. Au-delà du forfait : combien facturer

| Poste | Coût réel | **Prix conseillé** | Marge |
|---|---|---|---|
| 1 message WhatsApp supplémentaire | **1,61 DA** | **3,23 DA** | 50 % |
| Recharge 1 000 messages | 1 615 DA | **3 229 DA** | 50 % |
| Recharge 5 000 messages | 8 073 DA | **16 146 DA** | 50 % |
| Campagne marketing 1 000 messages | 6 993 DA | **≈ 13 986 DA** | 50 % |

**Le détail d'un message supplémentaire :** Meta **1,24 DA** + IA **0,37 DA** = **1,61 DA**.

⚠️ **Le marketing est un poste à part** : 6,99 DA de frais Meta par message, **sans aucune
franchise** et sans IA (un template de campagne n'est pas généré par Gemini). Il se facture
**toujours séparément**, jamais inclus dans un forfait.

---

## 4. D'où viennent les coûts unitaires (au taux de 270 DA)

| Poste | Tarif réel | En DA | Remarque |
|---|---|---|---|
| Message IA (Gemini) | 0,00138 $ | **0,37 DA** | mesuré sur le code du dépôt |
| Conversation web (8 messages) | 0,011 $ | **2,97 DA** | |
| Réponse WhatsApp (service) | 0,0046 $ | **1,24 DA** | après 1 000 gratuites/mois/numéro |
| Message marketing WhatsApp | 0,0259 $ | **6,99 DA** | sans franchise (5,6× le service) |
| Encaissement SlickPay | 1,6 % | — | de chaque paiement encaissé |

---

## 5. Frais fixes

Pour 50 clients (base ≈ 299 Mo, 128 k requêtes/mois) :

| Poste | USD | DA/mois |
|---|---|---|
| Nom de domaine | 0,90 $ | 243 DA |
| Supabase | 0,00 $ | 0 DA (299 Mo sur 500 Mo gratuits) |
| Cloudflare Pages Functions | 0,00 $ | 0 DA (128 k sur 3 M requêtes) |
| **TOTAL** | **0,90 $** | **243 DA** — soit **5 DA par client** |

**Seuils :** Supabase passe à 25 $ (**6 750 DA**) vers **~84 clients** si tu gardes 3 mois
d'historique → purge les conversations de plus de 3 mois. Cloudflare reste gratuit jusqu'à
**~940 clients**. À 50 clients, l'infra représente **0,03 % du revenu**.

---

## 6. Vue d'ensemble à 50 clients

Portefeuille supposé : 25 Basic · 20 Pro · 5 Enterprise.

| Poste | Par mois | % du revenu |
|---|---|---|
| **REVENU** (abonnements) | **780 750 DA** | 100 % |
| 25 × Basic (IA + encaissement) | − 21 303 DA | 2,7 % |
| 20 × Pro (IA + WhatsApp + encaissement) | − 25 316 DA | 3,2 % |
| 5 × Enterprise (IA + WhatsApp + encaissement) | − 45 348 DA | 5,8 % |
| Frais fixes (infra) | − 243 DA | 0,03 % |
| **MARGE NETTE** | **688 541 DA** | **88,2 %** |

Détail des coûts variables : **encaissement 12 492 DA** · IA 54 635 DA · **Meta 24 840 DA** ·
infra 243 DA.

---

## 7. ⚠️ Ce que le taux de 270 DA change

Tes recettes sont en dinars, tes fournisseurs facturent en dollars. **Tes coûts en DA doublent
par rapport au taux affiché dans ta console (135).**

| Poste | en USD | ≈ taux officiel (134) | **≈ 270 DA (réel)** | Surcoût |
|---|---|---|---|---|
| IA Gemini | 202,35 $ | 27 115 DA | **54 635 DA** | + 27 520 DA |
| WhatsApp — frais Meta | 92,00 $ | 12 328 DA | **24 840 DA** | + 12 512 DA |
| Infra | 0,90 $ | 121 DA | **243 DA** | + 122 DA |
| **TOTAL / mois** | **295,25 $** | **39 563 DA** | **79 718 DA** | **+ 40 154 DA** |

**L'écart est de ×2,01.** Deux conséquences concrètes :

1. **La console admin sous-estime les coûts de moitié** : `AdminPage.tsx` convertit les coûts
   IA avec un taux de 135 DA. À corriger (afficher 270, ou rendre le taux paramétrable).
2. **Les parts du prix des packs doublent** pour tout ce qui est libellé en dollars :
   le forfait WhatsApp de Pro passe de 1,0 % à **2,0 %** du pack, la conversation web de
   1,49 DA à **2,97 DA**, la réponse WhatsApp de 0,62 à **1,24 DA**.

**Pistes légales à voir avec ta banque :** compte devise professionnel, allocation « services
numériques », ou encaisser une partie en devises (clients de la diaspora). Le marché parallèle
est illégal : il sert ici à **mesurer un coût réel**, pas de plan d'affaires.

---

## 8. Le poste que personne n'anticipe : l'encaissement

| Mode de versement SlickPay | Frais par transaction |
|---|---|
| Instantané | 2,0 % |
| Quotidien | 1,9 % |
| Hebdomadaire | 1,6 % ← hypothèse retenue |
| Bimensuel | 1,5 % |
| **Mensuel** | **1,4 %** ← le moins cher |

À 50 clients : **12 492 DA/mois** (1,6 %), **10 930 DA** au taux mensuel (1,4 %) — soit
**1 560 DA économisés par mois** sans rien changer d'autre. C'est le poste le plus lourd de
toute la structure de coûts, devant Meta.

*(Vérifie aussi la commission de ta banque acquéreuse : 1,5–2,5 % selon les banques.)*

---

## 9. Mise en place (une seule fois)

| Poste | Coût | Qui paie |
|---|---|---|
| Vérification d'entreprise Meta | **0 DA** | toi |
| App Review (permissions WhatsApp) | **0 DA** | toi |
| Statut Tech Provider / Embedded Signup | **0 DA** | toi |
| Numéro dédié par client (SIM) | ≈ 500–1 500 DA | **le client** |
| Développement du canal | 15–25 jours | toi |

**Le vrai frein n'est pas le prix** : un numéro branché sur l'API ne peut plus servir dans
l'application WhatsApp normale. Le client doit accepter un **numéro dédié** (2ᵉ SIM) ou le mode
« Coexistence ». C'est le premier obstacle, avant toute question d'argent.

---

## 10. À retenir

1. **WhatsApp dans Pro coûte 373 DA** (1 000 messages inclus, Meta gratuit) — **2,0 %** du pack
   au taux réel. Dans Enterprise : **6 833 DA** pour 5 000 messages — **14,5 %** du pack.
2. **Un client Pro complet te coûte 1 266 DA** (6,8 % de ce qu'il paie) ; au pire cas **5 699 DA**
   (30,5 %). La marge reste ≥ **69,5 %** même dans le pire scénario.
3. **La marge globale à 50 clients est de 88,2 %** — mais elle est passée de 93,3 % (calcul à
   135 DA) à 88,2 % à cause du taux réel.
4. **Deux postes à surveiller :** le **change du dollar** (+79 % sur tout ce qui est en USD) et
   l'**encaissement** (12 492 DA/mois à 50 clients). Ce sont eux qui décident de ta marge
   réelle, pas Gemini.
5. **Trois corrections à faire :** passer SlickPay en versement mensuel (1,4 %), corriger le
   taux de conversion dans la console (135 → 270), et facturer le marketing hors forfait.
6. **« Et tout » ne coûte presque rien en frais** : Messenger, Telegram et TikTok n'ont
   **aucun** frais au message. Le vrai coût, c'est **27 à 47 jours de développement** et
   l'IA des conversations supplémentaires. Offre-les généreusement — ils font monter la
   valeur perçue de Basic sans toucher ta marge au-delà de l'IA.

---

## 11. Rejouer les calculs

```bash
node scripts/couts-totaux.mjs                  # 4 packs, WhatsApp compris, taux 270
node scripts/couts-totaux.mjs --clients=100    # autre taille de portefeuille
node scripts/couts-totaux.mjs --change=250     # autre taux dollar
node scripts/couts-totaux.mjs --slickpay=1.4   # versement mensuel SlickPay
```

| Script | Ce qu'il calcule |
|---|---|
| `scripts/couts-totaux.mjs` | **tout** : 4 packs + WhatsApp + IA + encaissement + devise |
| `scripts/couts-whatsapp.mjs` | le canal WhatsApp seul (marchés, BSP, pub, forfaits) |
| `scripts/couts-plans.mjs` | le coût de chaque pack et les plafonds IA |

**Sources :** page officielle Meta *Pricing on the WhatsApp Business Platform* (30/09/2026) ·
tarifs Gemini 3.1 Flash-Lite · **slick-pay.com/pricing** (1,4–2 % par transaction) ·
**Banque d'Algérie** (134,43 DA/USD au 06/10/2026) · **relevés du Square Port-Saïd**
(~240–270 DA/USD, octobre 2026 — taux retenu : **270**, fourni par le propriétaire du projet).
