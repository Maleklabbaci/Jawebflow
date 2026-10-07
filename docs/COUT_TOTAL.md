# Combien ça te coûte exactement — tous les frais

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Rejouable : `node scripts/couts-totaux.mjs` · `--clients=100` · `--slickpay=1.4`

---

## 1. La réponse courte

| | Coût pour toi |
|---|---|
| **Ajouter WhatsApp au plan Pro** | **186 DA** par client et par mois = **1 % du prix du pack** |
| **Un client Pro complet** (web + WhatsApp + encaissement) | **783 DA** = **4,2 %** de ce qu'il paie |
| Le même, si tu obtiens les dollars au taux parallèle | **~1 166 DA** = **6,2 %** |
| **Les frais fixes** (domaine + Supabase + Cloudflare) | **122 DA/mois à 50 clients** = **2 DA par client** |
| **Point mort** | **1 client** |

**En une phrase :** tes coûts variables tournent autour de **4 à 6 % du revenu**, et le poste
le plus lourd n'est ni l'IA ni Meta — **c'est le 1,6 % d'encaissement SlickPay**, plus le
**change du dollar** si tu ne peux pas payer tes fournisseurs au taux officiel.

---

## 2. Les 5 postes qui te coûtent de l'argent

| # | Poste | Montant | Nature |
|---|---|---|---|
| ① | **Infra fixe** — domaine, Cloudflare, Supabase | **122 DA/mois** à 50 clients | fixe |
| ② | **IA (Gemini)** | 0,186 DA par message · 1,49 DA par conversation web | variable |
| ③ | **WhatsApp (Meta)** | 0,62 DA par réponse **après 1 000 gratuites/mois/numéro** · 3,50 DA par message marketing, **sans franchise** | variable |
| ④ | **Encaissement (SlickPay)** | **1,4 % à 2 %** de chaque paiement client | variable |
| ⑤ | **Mise en place** | 0 DA chez Meta, mais un numéro par client + 15–25 j de développement | une fois |

---

## 3. Coût d'un client, tous frais variables inclus

Usage supposé : Basic 250 conversations web · Pro 200 web + 1 000 messages WhatsApp ·
Enterprise 500 web + 5 000 messages WhatsApp · SlickPay 1,6 %.

| Plan | Prix | IA web | WhatsApp | Encaissement | **Coût total** | Marge | Marge % |
|---|---|---|---|---|---|---|---|
| **Basic** | 6 850 DA | 373 DA | 0 DA | 110 DA | **482 DA** | 6 368 DA | **93,0 %** |
| **Pro / Business** | 18 700 DA | 298 DA | 190 DA | 299 DA | **787 DA** | 17 913 DA | **95,8 %** |
| **Enterprise** | 47 100 DA | 745 DA | 3 410 DA | 754 DA | **4 929 DA** | 42 171 DA | **89,5 %** |

*(Hors frais fixes, qui sont de 2 DA par client — voir §5.)*

---

## 4. Le détail du poste WhatsApp

| Messages/mois et par client | Meta | IA | **Total** | ≈ conversations |
|---|---|---|---|---|
| 500 | 0 DA | 93 DA | **93 DA** | 83 |
| **1 000** (le forfait Pro) | **0 DA** | **186 DA** | **186 DA** | 167 |
| 2 000 | 620 DA | 372 DA | **992 DA** | 333 |
| 5 000 (le forfait Enterprise) | 2 480 DA | 930 DA | **3 410 DA** | 833 |
| 10 000 | 5 580 DA | 1 860 DA | **7 440 DA** | 1 667 |

**Les 1 000 premiers messages sont gratuits chez Meta** → offrir 1 000 messages dans Pro ne
coûte **que l'IA : 186 DA**, soit 1 % du pack. Une campagne marketing de 1 000 messages coûte
**3 500 DA** — sans franchise, jamais incluse dans un plan.

---

## 5. Frais fixes

Pour 50 clients (base ≈ 299 Mo, 3 mois d'historique, 128 k requêtes/mois) :

| Poste | Coût/mois |
|---|---|
| Nom de domaine | 122 DA |
| Supabase | **0 DA** (299 Mo sur les 500 Mo gratuits) |
| Cloudflare Pages Functions | **0 DA** (128 k requêtes sur 3 M gratuites) |
| **TOTAL** | **122 DA** — soit **2 DA par client** |

**Seuils à connaître :**

- **Supabase passe en payant (25 $ ≈ 3 375 DA)** au-delà de 500 Mo, soit autour de
  **~84 clients** si tu gardes 3 mois d'historique. → Purger les conversations de plus de
  3 mois : la vue `assistant_monthly_usage` agrège déjà les totaux, l'historique détaillé
  n'est pas nécessaire au tableau de bord.
- **Cloudflare reste gratuit jusqu'à ~940 clients actifs.** Le plan payant (5 $) ne se
  justifie pas à ton échelle.

**Conclusion : l'infrastructure n'est pas ton problème.** À 50 clients elle coûte 122 DA/mois.

---

## 6. Vue d'ensemble à 50 clients

Portefeuille supposé : 25 Basic · 20 Pro · 5 Enterprise.

| Poste | Par mois | % du revenu |
|---|---|---|
| **REVENU** (abonnements) | **780 750 DA** | 100 % |
| IA + WhatsApp + encaissement — 25 × Basic | − 12 053 DA | 1,5 % |
| IA + WhatsApp + encaissement — 20 × Pro | − 15 664 DA | 2,0 % |
| IA + WhatsApp + encaissement — 5 × Enterprise | − 24 543 DA | 3,1 % |
| Frais fixes (infra) | − 122 DA | 0,0 % |
| **MARGE NETTE** | **728 369 DA** | **93,3 %** |

Détail du coût variable : **encaissement 12 492 DA** · IA 39 768 DA (dont WhatsApp 20 770 DA).

---

## 7. ⚠️ Le vrai frais caché : payer tes fournisseurs en dollars

Tes recettes sont en dinars ; tes dépenses (Google, Meta, Supabase, Cloudflare) sont **en
dollars**. Or le dinar n'est pas librement convertible :

| | Taux (octobre 2026) |
|---|---|
| Taux officiel (Banque d'Algérie) | **≈ 134 DA/USD** |
| Marché parallèle (Square Port-Saïd) | **≈ 240 DA/USD** |
| **Écart** | **+79 %** |

Dépenses mensuelles payables en dollars, à 50 clients :

| Poste | en USD | au taux officiel | au taux parallèle | Écart |
|---|---|---|---|---|
| IA Gemini | 204,24 $ | 27 368 DA | 49 016 DA | + 21 649 DA |
| WhatsApp — frais Meta facturés | 92,54 $ | 12 400 DA | 22 209 DA | + 9 809 DA |
| Infra (Supabase + Cloudflare + domaine) | 0,90 $ | 121 DA | 216 DA | + 95 DA |
| **TOTAL** | **297,67 $** | **39 888 DA** | **71 441 DA** | **+ 31 553 DA** |

**Impact sur la décision WhatsApp :** le forfait de 1 000 messages dans Pro passe de **186 DA**
(taux officiel) à **333 DA** (parallèle) — soit de 1,0 % à 1,8 % du pack. **La conclusion ne
change pas**, mais il faut budgéter la devise.

**Voies à explorer auprès de ta banque** (aucun conseil réglementaire ici) :

- compte devise professionnel / allocation pour « services numériques » ;
- encaisser une partie en devises (clients de la diaspora, export de services) — ce qui
  équilibre naturellement la trésorerie ;
- carte devise adossée au compte professionnel.

> Les transactions sur le marché parallèle sont **illégales** en Algérie : elles sont citées
> ici uniquement pour expliquer l'écart de coût, pas comme plan d'affaires.

---

## 8. Le poste que personne n'anticipe : l'encaissement

| Mode de versement SlickPay | Frais par transaction |
|---|---|
| Instantané (auto) | 2,0 % |
| Quotidien | 1,9 % |
| Hebdomadaire | 1,6 % ← hypothèse retenue |
| Bimensuel | 1,5 % |
| **Mensuel** | **1,4 %** ← le moins cher |

Sur 50 clients (780 750 DA de revenu), c'est **12 492 DA/mois** au taux de 1,6 % — **le poste
le plus lourd de toute la structure de coûts**, devant l'IA (39 768 DA tous canaux confondus)
et devant Meta.

**Action simple : passer au versement mensuel** (1,4 % au lieu de 1,6 %) économise
~1 560 DA/mois à 50 clients, sans rien changer d'autre. (À vérifier : certaines banques
ajoutent leur propre commission de 1,5–2,5 % ; à confirmer avec ta banque acquéreuse.)

---

## 9. Mise en place — une seule fois

| Poste | Coût | Qui paie |
|---|---|---|
| Vérification d'entreprise Meta | **0 DA** | toi |
| App Review (permissions WhatsApp) | **0 DA** | toi |
| Statut Tech Provider / Embedded Signup | **0 DA** | toi |
| Numéro dédié par client (SIM) | ≈ 500–1 500 DA | **le client** |
| Développement du canal (15–25 jours) | ton temps | toi |
| Meta Verified (optionnel, non requis) | abonnement | — |

**Le vrai frein n'est pas le prix, c'est la contrainte :** un numéro branché sur l'API ne peut
plus servir dans l'application WhatsApp normale. Le client doit donc accepter un **numéro
dédié** (souvent une 2ᵉ SIM) ou utiliser le mode « Coexistence » pour garder son app.
C'est le premier obstacle à l'adoption, avant toute question de coût.

---

## 10. À retenir

1. **WhatsApp dans Pro : 186 DA par client et par mois** (1 % du pack), Meta étant gratuit
   jusqu'à 1 000 messages par numéro. C'est le meilleur rapport valeur/coût de tout le catalogue.
2. **Un client Pro te coûte 783 DA** (4,2 %) — ou **~1 166 DA** (6,2 %) si tu paies tes
   fournisseurs en dollars au taux parallèle.
3. **Les frais fixes sont ridicules** : 122 DA/mois à 50 clients (2 DA par client). Le point
   mort est atteint dès le premier client.
4. **Deux postes à surveiller**, dans cet ordre : l'**encaissement** (1,4–2 % du revenu, le plus
   gros poste) et le **change du dollar** (+79 % sur tout ce qui est libellé en USD).
5. **Le marketing reste hors forfait** : 3,50 DA le message, aucune franchise — c'est le seul
   poste dont le coût peut s'envoler sans contrôle.

---

## 11. Rejouer les calculs

```bash
node scripts/couts-totaux.mjs                     # 50 clients, SlickPay 1,6 %
node scripts/couts-totaux.mjs --clients=100       # autre taille de portefeuille
node scripts/couts-totaux.mjs --slickpay=1.4      # versement mensuel
```

| Script | Ce qu'il calcule |
|---|---|
| `scripts/couts-totaux.mjs` | **tout** : infra + IA + WhatsApp + encaissement + devise |
| `scripts/couts-whatsapp.mjs` | le canal WhatsApp seul (marchés, BSP, pub, forfaits) |
| `scripts/couts-plans.mjs` | le coût de chaque pack et les plafonds IA |

**Sources :** page officielle Meta *Pricing on the WhatsApp Business Platform* (mise à jour du
30/09/2026) · tarifs Gemini 3.1 Flash-Lite · **slick-pay.com/pricing** (1,4–2 % par transaction) ·
**Banque d'Algérie** (134,43 DA/USD au 06/10/2026) et relevés du Square Port-Saïd
(~239,50–240 DA/USD début octobre 2026) · prix des packs dans `scripts/` et `slickpay.js`.
