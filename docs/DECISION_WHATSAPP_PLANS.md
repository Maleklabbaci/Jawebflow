# Décision : WhatsApp dans les plans

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Chiffres issus de `node scripts/couts-whatsapp.mjs` (§11) et `docs/COUTS_WHATSAPP.md`.

---

## 0. La meilleure place : **le plan Pro**

WhatsApp va dans **Pro** (avec un forfait plus large dans **Enterprise**). Pas dans Basic.
Pas réservé à Enterprise.

| | Coût pour toi | Ce que ça change |
|---|---|---|
| **Inclure 1 000 messages dans Pro** | **186 DA** = **1 % du prix du pack** | La raison de passer de Basic (6 850 DA) à Pro (18 700 DA) : **+11 850 DA** |
| **1 client qui monte en gamme** | — | finance **~63 forfaits WhatsApp** (11 850 ÷ 186) |

**Pourquoi Pro est le bon endroit, pour TOI :**

1. **C'est ton meilleur levier d'ARPU.** Le canal coûte 1 % du pack mais vaut les yeux de la
   tête pour un commerçant algérien. Un seul passage Basic → Pro finance 63 forfaits WhatsApp.
2. **Ne le vends PAS à l'unité sur Basic.** Une option à 2 500 DA te rapporterait 2 314 DA de
   marge… mais ferait renoncer à une montée de gamme de 11 850 DA. Tu troquerais 11 850 DA
   contre 2 500 DA. (Exception : un client qui ne *peut pas* payer Pro — au cas par cas, hors
   tarif public.)
3. **Le travail humain suit l'argent.** Chaque client WhatsApp demande un numéro dédié, un
   onboarding Meta, et surtout **l'approbation de ses templates** par Meta — c'est du travail
   non automatisable, à refaire par client. Tu veux le faire pour des clients à 18 700 DA,
   pas pour la masse des clients Basic à 6 850 DA.
4. **Pas réservé à Enterprise** : WhatsApp est le canal grand public en Algérie, pas un besoin
   de grand compte. L'enfermer dans le pack à 47 100 DA prive 90 % de tes clients du canal —
   et toi de la montée de gamme Pro.

**Pourquoi Pro est le bon endroit, pour TES CLIENTS :**

1. **1 000 messages ≈ 167 vraies conversations** — de quoi couvrir un commerce normal, alors
   que le pack commence par coûter 0 DA à JawebFlow (c'est Meta qui offre les 1 000 premiers).
   C'est de la valeur perçue quasi gratuite.
2. **C'est le canal qu'ils utilisent déjà** : leur client écrit sur WhatsApp, pas sur leur site.
   Le widget web devient un bonus, pas l'argument principal.
3. **Zéro paperasse pour eux** : ils branchent WhatsApp depuis le tableau de bord (Embedded
   Signup), sans jamais voir Meta, un BSP ou une facture en dollars.
4. **Aucune facture surprise** : recharge **prépayée** (pas de post-payé à la fin du mois) et
   **arrêt automatique** à la fin du forfait + recharges achetées. Un commerçant préfère
   « ça s'arrête » à « tu me dois 12 000 DA ».

---

## 1. La décision, plan par plan

| Plan | WhatsApp | Inclus | Coût réel pour toi | Effet sur la marge |
|---|---|---|---|---|
| **Découverte** (0 DA) | ❌ | — | — | — (0 crédit IA de toute façon) |
| **Basic** (6 850 DA) | ❌ **pas inclus, pas en option** | — | 0 DA | — |
| **Pro / Business** (18 700 DA) | ✅ **inclus** | **1 000 messages/mois** | **186 DA** | **1,0 % du prix** |
| **Enterprise** (47 100 DA) | ✅ **inclus** | **5 000 messages/mois** | **3 414 DA** | **7,2 % du prix** |

**Au-delà du forfait inclus** : **1,61 DA par message** (coût réel 0,81 DA → marge 50 %),
ou un pack de rechargement. **Les campagnes marketing ne sont jamais incluses** (voir §3).

### Pourquoi c'est tenable : la franchise de Meta

Meta offre **1 000 messages de service gratuits par numéro d'entreprise et par mois**
(depuis le 01/10/2026). Offrir « 1 000 messages » dans Pro ne te coûte donc **que l'IA** :
0,19 DA × 1 000 = **186 DA** — soit **1 % du prix de l'abonnement**.

| Messages inclus | Coût réel/mois | % du pack Pro | % du pack Enterprise |
|---|---|---|---|
| 1 000 | 186 DA | 1,0 % | 0,4 % |
| 2 000 | 993 DA | 5,3 % | 2,1 % |
| 3 000 | 1 800 DA | 9,6 % | 3,8 % |
| **5 000** | **3 414 DA** | 18,3 % | **7,2 %** |
| 10 000 | 7 449 DA | 39,8 % | 15,8 % |

👉 **C'est l'argument commercial le moins cher de tout le catalogue** : « WhatsApp inclus »
dans Pro pour 1 % du prix, et ça devient la raison de passer de Basic à Pro.


### 1 bis. Le montage client, concrètement (prépayé, pas post-payé)

| Élément | Prix | Coût pour toi | Marge |
|---|---|---|---|
| Inclus dans Pro | — | 186 DA/mois | — |
| **Recharge 1 000 messages** | **1 800 DA** (1,80 DA/msg) | 807 DA | 55 % |
| **Recharge 5 000 messages** | **8 000 DA** (1,60 DA/msg) | 4 035 DA | 50 % |
| **Pack campagne 1 000 messages** (marketing) | **7 000 DA** | 3 497 DA | 50 % |

Trois garde-fous, dans cet ordre :

1. **Le forfait inclus** (1 000 dans Pro, 5 000 dans Enterprise) — au-delà, rien ne part.
2. **Recharge prépayée** : le client achète un pack *avant* de consommer. Pas de facture en fin
   de mois, donc pas d'impayés en dollars à rattraper côté JawebFlow.
3. **Arrêt net** à épuisement : l'IA s'arrête, le client est prévenu, le widget web et
   Instagram continuent de fonctionner normalement (le code sait déjà faire ce type de blocage
   avec `LIMIT_REACHED` dans `chat.js`).

**Aucun nouveau système de paiement à construire pour démarrer** : la console admin sait déjà
créer des factures en DA (section *Factures* d'`AdminPage.tsx`). Une recharge = une facture.
Le paiement en ligne pourra être branché ensuite sur le même flux.

**Les campagnes marketing sont toujours hors forfait** — c'est le seul poste dont le coût
échappe au contrôle (3,50 DA le message, sans franchise Meta).

---

## 2. Ce que ça donne pour le client (à mettre sur la page Tarifs)

**Pro / Business** — remplacer la ligne actuelle
« Accès anticipé WhatsApp & réseaux sociaux (prochainement) » par :

> **WhatsApp inclus : 1 000 messages par mois**, puis 1,61 DA le message supplémentaire.
> Les 1 000 premiers messages ne nous coûtent rien : c'est Meta qui les offre.

*(Tant que le canal n'est pas livré, garder la mention « en préparation » — mais le chiffre
de 1 000 doit déjà être annoncé, pour ne pas promettre autre chose plus tard.)*

**Enterprise** — remplacer « Tous les canaux dès leur disponibilité (web, WhatsApp, réseaux) » par :

> **WhatsApp inclus : 5 000 messages par mois**, au-delà au tarif négocié.
> Tous les canaux (web, WhatsApp, réseaux) dès leur disponibilité.

**Basic** — **supprimer toute mention WhatsApp** de la liste des fonctionnalités.
Le canal devient explicitement un avantage du plan supérieur.

---

## 2 bis. « Marketing » : de quoi je parle exactement

**« Marketing » n'est pas ce que fait JawebFlow — c'est une *catégorie de message* chez Meta.**
Meta classe chaque message sortant dans l'une de ces catégories, et c'est elle qui fixe le prix :

| Catégorie | C'est quoi, concrètement | Prix en Algérie | Franchise |
|---|---|---|---|
| **Service** | **Ta réponse** à un client qui t'a écrit, dans les 24 h | 0,62 DA | 1 000/mois offerts |
| **Utility** | Message **que tu déclenches**, lié à une action du client : confirmation de commande, rappel de RDV, avis de livraison | 0,62 DA | ❌ aucune |
| **Marketing** | Message **que tu déclenches pour vendre** : promo, offre, « votre panier vous attend », relance d'un client inactif, newsletter | **3,50 DA** | ❌ aucune |
| **Authentication** | Code OTP (hors sujet ici) | 0,62 DA | ❌ aucune |

### Ce que ça change pour JawebFlow : rien, tant qu'on ne fait que répondre

**Tout ce que le bot fait aujourd'hui est du « service »** : il ne parle qu'à des gens qui lui
ont écrit. Donc **aucun coût marketing** dans le produit actuel — et c'est déjà pris en compte
dans le calcul du plan Pro (1 000 messages = 186 DA).

### Le marketing apparaît seulement si on ajoute des messages SORTANTS

Et le dépôt en a déjà un : `functions/_shared/relances.ts` envoie deux relances
automatiques (**+1 h** et **+24 h**) après une demande validée, via le cron
`/api/cron/relances`. Aujourd'hui elles partent en **DM Instagram**, dans la fenêtre de
24 h de Meta — donc gratuitement.

Si on les branche sur WhatsApp, la facture dépend **entièrement de la façon dont elles sont écrites** :

| Ce que dit la relance | Catégorie Meta | Coût |
|---|---|---|
| « Petit point sur votre commande : l'équipe finalise la confirmation » *(texte actuel du dépôt)* | **Utility** | **0,62 DA** |
| « Il vous reste un article dans votre panier, -10 % aujourd'hui ! » | **Marketing** | **3,50 DA** |

**Même outil, même client, même minute : 5,6× d'écart — à cause d'une seule phrase.**
Et Meta reclasse lui-même un template jugé promotionnel : on ne peut pas contourner en
étiquetant une promo en « utility ».

### La règle à retenir pour l'offre

- **Relances transactionnelles** (suivi de commande, rappel de RDV) → **utility, 0,62 DA** :
  elles peuvent entrer dans le forfait inclus du plan Pro, comme les réponses de service.
- **Campagnes promotionnelles** (promo, panier abandonné, réengagement) → **marketing, 3,50 DA** :
  facturées à l'unité, jamais incluses.

---

## 3. Les 4 règles à ne pas enfreindre

1. **Distinguer relance transactionnelle et campagne promotionnelle** (voir §2 bis).
   Une relance de suivi (« votre commande est confirmée ») est de l'**utility : 0,62 DA** —
   elle peut entrer dans le forfait. Une **promo** (« -10 % aujourd'hui ! ») est du
   **marketing : 3,50 DA**, sans franchise : une campagne à 1 000 contacts = **3 497 DA**.
   → Le promotionnel se facture au message ou en pack (« 1 000 relances : X DA »).
   **Jamais « illimité »** : c'est le moyen le plus rapide de perdre de l'argent.
2. **Un numéro WhatsApp par client.** La franchise de 1 000 messages est **par numéro** et par
   mois. Un numéro partagé entre plusieurs clients gaspillerait la franchise et empêcherait de
   compter qui consomme quoi.
3. **Le plafond IA de Pro doit monter.** Les conversations WhatsApp consomment le **même**
   compteur (`conversation_contexts`) et le **même plafond de coût** que le web. Aujourd'hui,
   Pro s'arrête à **817 conversations** (plafond 9 $ ≈ 1 215 DA) : le client n'aurait même pas de
   quoi consommer son forfait WhatsApp + son quota web. → passer le plafond de Pro à **~20 $**
   (voir `docs/COUTS_PLANS.md` §5), sinon la promesse est incohérente dès le premier mois.
4. **Le pays des clients finaux change le prix.** Meta facture selon le pays du **destinataire** :
   un client qui vend en France paie **2,66 DA/réponse, soit 4,3× l'Algérie**. → une clause
   « tarif selon le pays de tes clients » est nécessaire avant de vendre à prix fixe.

---

## 4. Ce qu'il faut changer dans le code (quand le canal sera développé)

| # | Fichier | Modification |
|---|---|---|
| 1 | `functions/_shared/limits.ts` | Ajouter `WHATSAPP_MESSAGES_PER_PLAN = { free: 0, basic: 0, pro: 1000, enterprise: 5000 }` et un compteur dédié, distinct du quota de conversations |
| 2 | `supabase/migration_whatsapp_metering.sql` | Table des messages sortants : `assistant_id`, `phone_number_id`, `category`, **`billable`**, `created_at` |
| 3 | `functions/api/webhook/whatsapp.ts` (nouveau) | Sur chaque statut de message, lire **`pricing.billable` / `pricing.type` / `pricing.category`** renvoyés par Meta et incrémenter le compteur |
| 4 | `src/pages/PricingPage.tsx` | Remplacer les lignes WhatsApp de Pro et Enterprise (§2) ; retirer toute mention côté Basic |
| 5 | `src/pages/AdminPage.tsx` + tableau de bord | Afficher « WhatsApp : X / 1 000 » par client, et l'alerte de dépassement |
| 6 | `functions/_shared/limits.ts` | `COST_CAP_USD_PER_PLAN.pro` : 9 → **20 $** (§3.3) |
| 7 | `docs/NOUVEAUX_CANAUX.md` + `docs/COUTS_WHATSAPP.md` | Mettre à jour avec la décision (Basic : non · Pro : 1 000 · Enterprise : 5 000) |

**Le compteur peut être exact, il n'y a rien à estimer** : Meta renvoie dans le webhook de
statut un objet `pricing` qui dit précisément si le message a été facturé :

```json
"pricing": { "billable": true,  "pricing_model": "PMP", "type": "regular",              "category": "service" }
"pricing": { "billable": false, "pricing_model": "PMP", "type": "free_customer_service", "category": "service" }
```

→ on stocke `billable` tel quel : la refacturation au client est la **copie exacte** de ce que
Meta te facture. Et le code stocke déjà `channel` dans `conversation_contexts`, donc le tableau
de bord peut séparer l'usage web de l'usage WhatsApp sans migration lourde.

---

## 5. Résumé en une ligne

**Basic : rien. Pro : 1 000 messages inclus (1 % du prix) puis 1,61 DA/message.
Enterprise : 5 000 inclus puis négocié.**

Le « marketing » dont je parlais n'existe pas dans le produit actuel : le bot ne fait que
répondre, et répondre c'est du « service ». Il n'apparaît que le jour où on branche des
**campagnes promotionnelles** sur WhatsApp — et c'est le seul poste qui coûte vraiment cher
(3,50 DA le message, sans franchise). Les relances de suivi que le dépôt envoie déjà
(`relances.ts`) restent, elles, du « utility » à 0,62 DA et peuvent entrer dans le forfait.

**Arbitrage chiffré, si l'idée d'une option payante sur Basic revient** : vendre
« 1 000 messages » 2 500 DA/mois garde 2 314 DA de marge (coût 186 DA) — mais si ce client
aurait de toute façon pris Pro pour WhatsApp, tu échanges **11 850 DA de montée de gamme
contre 2 500 DA**. Règle simple : **aucune option WhatsApp au tarif public en dessous de Pro.**
Pour un client qui ne peut réellement pas payer Pro, décide au cas par cas (remise de montée
de gamme plutôt qu'option Basic : tu gardes le client dans la bonne grille tarifaire).
