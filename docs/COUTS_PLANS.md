# Combien coûte chacun de tes packs — calcul réel

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Tous les chiffres sont **calculés depuis le code du dépôt**, pas repris d'un guide.
> Pour les rejouer : `node scripts/couts-plans.mjs`

> ⚠️ **MISE À JOUR — taux du dollar porté à 270 DA.**
> Ce document a été écrit avec un taux de 135 DA/$. Au taux réel d'accès au dollar (**270 DA**),
> **tous les montants libellés en dollars doublent** (et leur part dans le prix des packs aussi).
> Chiffres recalculés : **`docs/COUT_TOTAL.md`** (`node scripts/couts-totaux.mjs`).
>
> | Avant (135 DA) | Après (270 DA) |
> |---|---|
> | 0,19 DA par message IA | **0,37 DA** |
> | 1,49 DA par conversation web | **2,97 DA** |
> | 0,62 DA par réponse WhatsApp | **1,24 DA** |
> | 3,50 DA par message marketing | **6,99 DA** |
> | 186 DA (1 000 msg WhatsApp dans Pro) | **373 DA** |
> | 3 414 DA (5 000 msg dans Enterprise) | **6 833 DA** |
> | 0,81 DA par réponse WhatsApp (Meta + IA) | **1,61 DA** |
> | Marge globale (50 clients) | 93,3 % → **88,2 %** |
>
> Les tarifs en USD (Meta, Gemini) et les prix des packs en DA sont inchangés.

---

## 1. La réponse en une table

| Pack | Prix | Quota annoncé | Coût IA **pire cas** | Marge | Coût réel d'un client typique |
|---|---|---|---|---|---|
| **Découverte** | 0 DA | 0 conversation | 0 DA | — | 0 DA (IA coupée) |
| **Basic** | 6 850 DA | 1 000 conv. | **405 DA** (5,9 %) | **94 %** | 74 à 372 DA (50–250 conv.) |
| **Pro / Business** | 18 700 DA | 5 000 conv. | **1 215 DA** (6,5 %) | **93 %** | 74 à 372 DA |
| **Enterprise** | 47 100 DA | illimité | **4 050 DA** (8,6 %) | **91 %** | 372 à 1 486 DA |

**En clair : les packs sont très rentables.** Le coût IA d'une conversation complète
(≈ 8 messages) est de **1,49 DA**. Un client Basic qui fait 250 conversations par mois
te coûte **372 DA** sur un abonnement à 6 850 DA.

⚠️ Mais il y a un piège dans le code — voir §4 : **le plafond de coût coupe l'IA
bien avant le quota vendu.**

---

## 2. D'où viennent ces chiffres (le calcul, pas une opinion)

### 2.1 Le compteur du dépôt

Le quota n'est pas compté en messages mais en **unités pondérées**
(`supabase/migration_ai_usage.sql`) :

| Ce que le visiteur fait | Unités de quota | Appel IA ? |
|---|---|---|
| Message simple | **1** | Oui |
| Message de politesse (« salam », « merci ») | **0** | **Non** (réponse locale, gratuite) |
| Photo (vision) | **4** | Oui |
| Recherche dans le catalogue | **+2** | Oui |

Et : **1 conversation commerciale = 8 unités**. Donc « 1 000 conversations » = jusqu'à
8 000 messages. Le calcul de coût ci-dessous suppose **8 messages IA par conversation**,
ce qui est **prudent** (les politesses, elles, ne coûtent rien).

### 2.2 Le prompt, mesuré (pas estimé)

J'ai fait tourner `buildSalesSystemPrompt()` du dépôt sur trois configurations réelles :

| Configuration | Taille du prompt système |
|---|---|
| Juste le nom de la boutique | 6 125 caractères ≈ **1 531 tokens** |
| Nom + secteur + site + ton | 6 449 caractères ≈ **1 612 tokens** |
| + bloc comportement et règles du commerçant | 7 499 caractères ≈ **1 875 tokens** |

À cela s'ajoute, à chaque message : les **connaissances (RAG)** — jusqu'à 7 000 caractères
de notes, la FAQ (900), les tarifs (1 200), les extraits de site (5 × 620) — et
**l'historique** de la conversation.

### 2.3 Le coût par message

Avec le modèle configuré (`GEMINI_MODEL`, défaut `gemini-3.1-flash-lite`) et son tarif
officiel vérifié — **0,25 $ / M en entrée, 1,50 $ / M en sortie** :

| Profil de message | Tokens entrée | Tokens sortie | Coût | En DZD |
|---|---|---|---|---|
| Simple (peu de contexte) | 2 400 | 200 | 0,090 ¢ | **0,12 DA** |
| Typique (FAQ + historique) | 3 600 | 350 | 0,143 ¢ | **0,19 DA** |
| Riche (photo, catalogue, long échange) | 6 500 | 700 | 0,267 ¢ | **0,36 DA** |
| **Moyenne pondérée du trafic réel** | 3 495 | 335 | 0,138 ¢ | **0,19 DA** |

→ **Coût d'une conversation (8 messages) : 0,0110 $ ≈ 1,49 DA.**

`limits.ts` utilise exactement ces tarifs : **les constantes du dépôt sont justes.**

---

## 3. Le coût selon l'intensité d'usage

| Pack | 50 conv. | 250 conv. | 1 000 conv. | 3 000 conv. | Plafond |
|---|---|---|---|---|---|
| **Basic** | 74 DA (1,1 %) | 372 DA (5,4 %) | **405 DA** (5,9 %) | **405 DA** (5,9 %) | 405 DA |
| **Pro** | 74 DA (0,4 %) | 372 DA (2,0 %) | 1 215 DA (6,5 %) | **1 215 DA** | 1 215 DA |
| **Enterprise** | 74 DA (0,2 %) | 372 DA (0,8 %) | 1 486 DA (3,2 %) | 4 050 DA (8,6 %) | 4 050 DA |

Entre parenthèses : la part du prix du pack mangée par le coût IA.
Quand le pourcentage **arrête de monter**, c'est que le plafond a déjà coupé.

**Exposition maximale** : même si **tous** tes clients atteignaient leur plafond, tu
paierais au maximum 405 DA (Basic) / 1 215 DA (Pro) / 4 050 DA (Enterprise) par client
et par mois. Sur 100 clients Basic au taquet : **40 500 DA de coût pour 685 000 DA de
revenus**.

---

## 4. ⚠️ Le piège : le plafond de coût coupe AVANT le quota vendu

`limits.ts` définit **deux freins indépendants** : le quota de conversations (celui
affiché sur la page Tarifs) et un **plafond de coût en dollars**
(`COST_CAP_USD_PER_PLAN`, commenté « décision du propriétaire »). L'IA s'arrête au
**premier des deux** atteint.

| Pack | Quota vendu | Plafond | Ce que le client peut vraiment consommer | Frein réel |
|---|---|---|---|---|
| Basic | 1 000 conv. | 3 $ | **272 conversations** | ⚠️ plafond (27 % du quota) |
| Pro | 5 000 conv. | 9 $ | **817 conversations** | ⚠️ plafond (16 % du quota) |
| Enterprise | illimité | 30 $ | 2 725 conversations | plafond |

**Conséquence concrète :** un client Basic qui atteint 272 conversations dans le mois
voit le message « *Cet assistant a terminé son forfait pour ce mois-ci. 😊* » — alors
qu'il a payé pour **1 000** conversations et qu'il n'en a consommé que **27 %**.

C'est un choix défendable (protection contre les abus), mais il est **invisible** :
ni la page Tarifs, ni le tableau de bord ne l'expliquent. Trois façons de le régler :

1. **Relever les plafonds** pour les aligner sur la promesse (§5) — le plus simple ;
2. **Baisser la promesse** affichée (Basic « jusqu'à 300 conversations », Pro « jusqu'à
   800 ») — moins vendeur, mais honnête ;
3. **Mentions dans le tableau de bord** : afficher au commerçant son plafond réel, pas
   seulement son quota.

---

## 5. Ce que tu peux te permettre (marge cible 80 %)

Le seuil à partir duquel un pack cesse de tenir 80 % de marge **si tu relevais le
plafond** :

| Pack | Budget IA max (20 % du prix) | Conversations couvertes | Plafond actuel coupe à |
|---|---|---|---|
| Basic | 1 370 DA | **922 conversations** | 272 |
| Pro | 3 740 DA | **2 516 conversations** | 817 |
| Enterprise | 9 420 DA | **6 338 conversations** | 2 725 |

**Autrement dit : ton pack Basic pourrait tenir sa promesse de 1 000 conversations
presque intégralement, tout en gardant ~78 % de marge.** Le plafond de 3 $ est
beaucoup plus prudent que nécessaire.

### Réglages proposés

| Pack | Plafond actuel | Plafond proposé | Effet | Marge après |
|---|---|---|---|---|
| Basic | 3 $ | **11 $** | les 1 000 conversations annoncées deviennent réelles (997 couvertes) | **78,3 %** |
| Basic (variante) | 3 $ | 10 $ | 906 conversations couvertes — arrondi commercial à « 1 000 » | 80,3 % |
| Pro | 9 $ | **20 $** | couvre ~1 812 conversations | **85,6 %** |
| Enterprise | 30 $ | 30 $ (inchangé) | ajouter une clause de « usage raisonnable » | 91,4 % |

Trois réserves avant de bouger ces valeurs :

- **Le pack Pro est le plus exposé.** Ses 5 000 conversations annoncées coûteraient
  **7 452 DA** (39,8 % du prix, marge 60 %). C'est le seul pack où la promesse et la
  marge cible ne sont pas compatibles : pour rendre les 5 000 conversations vraies il
  faudrait un plafond à **~55 $** (soit 60 % de marge), et pour rester à 80 % de marge
  il faut s'en tenir à **~2 500 conversations**. Donc : **soit tu montes le prix du Pro,
  soit tu baisses son quota annoncé.**
- **Le plafond ne se relève pas « pour tous » sans risque** : c'est lui qui borne ton
  exposition. À 11 $ au lieu de 3 $, ton pire cas sur un client Basic passe de 405 DA à
  1 485 DA. Tant que le client paie 6 850 DA, ça reste très rentable — mais ces deux
  valeurs (plafond, prix) doivent bouger ensemble.
- **Les prix annuels sont plus serrés** : Basic annuel 5 480 DA/mois, Pro 14 960 DA/mois,
  Enterprise 37 680 DA/mois (source : `PricingPage.tsx`). À plafonds relevés, ces
  offres perdent ~10 points de marge de plus que le mensuel.

---

## 6. Un coût caché : le cache de contexte Gemini

`functions/_shared/gemini-cache.ts` met le prompt système en cache pour payer la
relecture 10× moins cher (0,025 $/M au lieu de 0,25 $/M). **Mais Google facture aussi
le STOCKAGE du cache : 1,00 $ / million de tokens / heure**, que le cache serve ou non.

Avec un prompt de 1 600 tokens et un TTL d'1 heure renouvelé à chaque usage :

| | Valeur |
|---|---|
| Économie par message | 0,036 ¢ ≈ **0,049 DA** |
| Coût de stockage par heure de cache vivant | 0,160 ¢ ≈ **0,216 DA** |
| **Seuil de rentabilité** | **4,4 messages par heure** (≈ 107 messages/jour étalés) |

**Sous ~110 messages/jour, le cache coûte plus qu'il ne rapporte.** Exemple : un
assistant à 30 messages/jour paie ~1,73 DA/jour de stockage pour 1,46 DA d'économie.

→ Le cache devrait être **conditionné au volume de l'assistant**, pas activé pour tous.

> 📌 Effet secondaire utile : `costUsdFromTokens()` dans `limits.ts` facture les tokens
> cachés au **prix plein**. Le « Coût IA ce mois » de la console admin est donc une
> **borne haute** — le vrai coût est un peu plus bas (mais pas de beaucoup, cf. ci-dessus).

---

## 7. Les coûts fixes (payés par toi, pas par client)

| Poste | Coût | Note |
|---|---|---|
| Cloudflare Pages/Workers | **0 $** | offre gratuite : 100 000 requêtes/jour |
| Supabase | **0 $** | gratuit jusqu'à ~500 Mo ; **25 $/mois** au-delà |
| Nom de domaine | ≈ 0,9 $/mois | ~11 $/an |
| **Total** | **≈ 0,90 $/mois ≈ 122 DA** | soit **1 DA par client** à 100 clients |

Le modèle ne devient un sujet qu'à partir de ~50 clients actifs (passage Supabase Pro,
puis Workers payant à 5 $/mois). **Aujourd'hui, ton vrai coût variable, c'est l'IA, et
il est faible.**

---

## 8. Et si tu ajoutes WhatsApp ? (rappel)

WhatsApp s'ajoute **par-dessus** le coût IA : 0,54 DA par réponse du bot, après
1 000 messages gratuits par numéro et par mois (tarif Algérie du 01/10/2026).

| Usage WhatsApp | Messages/mois | Coût Meta | + IA | Total |
|---|---|---|---|---|
| 25 conversations | 200 | 0 DA | 37 DA | **37 DA** |
| 125 conversations | 1 000 | 0 DA | 186 DA | **186 DA** |
| 250 conversations | 2 000 | 540 DA | 372 DA | **912 DA** |
| 625 conversations | 5 000 | 2 160 DA | 929 DA | **3 089 DA** |
| 3 125 conversations | 25 000 | 12 960 DA | 4 645 DA | **17 605 DA** |

**WhatsApp coûte plus cher que l'IA elle-même** dès 2 000 messages/mois. Un pack Basic
avec 5 000 messages WhatsApp : 2 160 DA de frais Meta = **31,5 % du prix du pack** à
absorber. → à refacturer (pass-through ou option payante), jamais à absorber en silence.

---

## 9. À retenir

1. **Tes packs sont sains** : 91 à 94 % de marge, coût IA réel ≈ 1,49 DA par conversation.
2. **Le seul vrai problème n'est pas le coût, c'est la promesse** : le plafond de coût
   coupe l'IA à 27 % (Basic) et 16 % (Pro) du quota annoncé. Un client qui paie pour
   1 000 conversations s'arrête à 272.
3. **Correction la moins coûteuse** : relever les plafonds — Basic de 3 $ à **11 $**
   (la promesse « 1 000 conversations » devient vraie, marge 78 %), Pro à **20 $**.
   Pour le Pro, il faut en plus choisir entre monter le prix ou baisser le quota annoncé
   (~2 500 conversations pour rester à 80 % de marge).
4. **Le cache Gemini doit être conditionné au volume** (> ~110 messages/jour).
5. **WhatsApp, si tu l'ajoutes, doit être refacturé** : c'est lui qui coûte cher, pas Gemini.

---

## 10. Comment revérifier ces chiffres

```bash
node scripts/couts-plans.mjs                    # hypothèses par défaut
node scripts/couts-plans.mjs --change=140       # autre taux de change
node scripts/couts-plans.mjs --marge-cible=70   # autre objectif de marge
```

| Hypothèse | Où elle vit dans le code |
|---|---|
| Quotas par pack | `functions/_shared/limits.ts` → `DEFAULT_PLAN_LIMITS` |
| Plafonds de coût | `functions/_shared/limits.ts` → `COST_CAP_USD_PER_PLAN` |
| Tarifs Gemini | `functions/_shared/limits.ts` → `GEMINI_PRICE_*` |
| Prix des packs (DZD/USD) | `functions/api/slickpay.js` → `PLAN_AMOUNTS_*`, `src/pages/PricingPage.tsx` |
| Pondération du quota (8 unités) | `supabase/migration_ai_usage.sql` |
| Taille du prompt | `functions/_shared/prompt.ts` (mesurée) |
| Cache de contexte | `functions/_shared/gemini-cache.ts` |
| Où l'IA est coupée | `functions/api/chat.js` (lignes ~226-260) |

**Tarif Gemini vérifié le 7 octobre 2026** : `gemini-3.1-flash-lite` = 0,25 $/M entrée,
1,50 $/M sortie, 0,025 $/M entrée en cache, stockage 1,00 $/M tokens/heure.
