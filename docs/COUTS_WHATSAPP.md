# Ce que coûte WhatsApp — calcul complet

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Rejouable : `node scripts/couts-whatsapp.mjs`

---

## 1. L'essentiel

| Question | Réponse |
|---|---|
| Coût d'**une réponse du bot** en Algérie | **0,81 DA** (Meta 0,62 DA + IA 0,19 DA), après **1 000 messages de service gratuits** par numéro et par mois |
| Coût d'**une conversation** (6 réponses) | **4,84 DA** hors franchise · **1,12 DA** dans la franchise |
| Coût d'un client sous 1 000 messages/mois | **~186 DA** (l'IA seule — Meta ne facture rien) |
| Ce qui coûte vraiment cher | **le marketing : 3,50 DA par message**, sans aucune franchise |
| Un client Basic à 800 conversations/mois | **3 253 DA** de canal = **47,5 % de son abonnement** |
| Un client Basic à 2 500 conversations | **11 484 DA** = **167 % de son abonnement** ⚠️ |
| Prix conseillé de l'option (marge 50 %) | **1,61 DA par message**, ou forfait mensuel équivalent |
| Passer par un BSP (Twilio) | +0,005 $/message → le message passe de 0,62 à **1,30 DA (×2,1)** |

> ⚠️ **Correction par rapport à ma première analyse** : la doc officielle Meta classe
> **l'Algérie dans la région « Rest of Africa »**, pas en tarif propre. Les taux sont donc
> **marketing 0,0259 $** et **utility/service 0,0046 $** (et non 0,0225 / 0,0040 comme
> annoncé plus tôt). Certains barèmes partenaires affichent 0,0040 $ en service : la
> fourchette réelle est **0,0040–0,0046 $**.

---

## 2. Les 5 règles Meta qui décident de la facture

Source : page officielle **« Pricing on the WhatsApp Business Platform »**, mise à jour le
**30 septembre 2026** (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

1. **Facturation par message livré** (depuis le 01/07/2025), plus par conversation de 24 h.
   Meta ne facture **que les messages livrés** — un message échoué n'est pas facturé.
2. **Le tarif dépend du pays du DESTINATAIRE**, pas du tien. La table officielle des codes
   pays classe l'Algérie (indicatif +213) dans **« Rest of Africa »**.
3. **Tout ce que le client t'écrit est gratuit et illimité.**
4. Tes réponses (messages « service », y compris celles générées par ton IA) sont facturées
   **après 1 000 messages de service gratuits par numéro d'entreprise et par mois**
   — franchise remise à zéro chaque mois, non cumulable. *(Nouveauté du 01/10/2026.)*
5. Les **templates sortants** (relance, promo, confirmation de commande) n'ont **aucune
   franchise** : facturés dès le premier envoi. Les templates *utility* envoyés dans la
   fenêtre de 24 h sont devenus payants le 01/10/2026 (ils étaient gratuits depuis juillet 2025).

**Deux exceptions gratuites à connaître :**

- **Fenêtre « free entry point »** : si le client arrive par une **pub Click-to-WhatsApp**
  (Android/iOS uniquement) et que tu réponds dans les 24 h, une fenêtre s'ouvre où **tout est
  gratuit, marketing compris** — **jusqu'à 7 jours** depuis le 28/09/2026 (c'était 72 h avant).
- Les messages dans cette fenêtre **ne comptent pas** dans les paliers de volume.

---

## 3. Le coût réel en Algérie

### Une réponse du bot

| Poste | Coût |
|---|---|
| Réponse de service, **après** la franchise | 0,62 DA |
| + IA (Gemini 3.1 Flash-Lite, mesuré dans `COUTS_PLANS.md`) | 0,19 DA |
| **= coût total d'une réponse** | **0,81 DA** |
| Même réponse **dans** la franchise (1 000/mois) | **0,19 DA** (Meta = 0) |

### Une conversation (6 réponses du bot)

| Situation | Coût |
|---|---|
| Hors pub, franchise épuisée | **4,84 DA** |
| Dans la franchise | **1,12 DA** |
| Venu d'une pub Click-to-WhatsApp | **1,12 DA** |

### Les messages sortants — le vrai poste de dépense

| Type | Coût unitaire | Exemple |
|---|---|---|
| Utility (confirmation, rappel de RDV) | **0,62 DA** | 200 devis = **124 DA** |
| Marketing (relance, promo) | **3,50 DA** | **1 000 relances = 3 497 DA** |

**Le marketing coûte 5,6× une réponse de service**, et sans franchise. Une seule campagne de
relance à 1 000 contacts (3 497 DA) coûte plus cher que 200 conversations de service entières.

---

## 4. Selon le profil du client

| Profil | Conversations/mois | Messages du bot | Facturés par Meta | Coût Meta | Coût IA | **Total** |
|---|---|---|---|---|---|---|
| Petit commerce | 40 | 240 | 0 | 0 DA | 45 DA | **45 DA** |
| Commerce actif | 200 | 1 200 | 200 | 124 DA | 223 DA | **347 DA** |
| Gros volume | 800 | 4 800 | 3 800 | 2 360 DA | 893 DA | **3 253 DA** |
| Très gros | 2 500 | 15 000 | 14 000 | 8 694 DA | 2 790 DA | **11 484 DA** |

**Bonne nouvelle commerciale :** sous 1 000 messages de service par mois (≈ 165 conversations),
**Meta ne facture rien du tout** — il ne reste que le coût IA. C'est un argument de vente fort
(« WhatsApp ne vous coûte rien tant que vous restez sous 1 000 messages »).

Avec des relances en plus (1 000 contacts + 200 confirmations) :

| Profil | Service | + 1 000 relances | + 200 devis | **Total** |
|---|---|---|---|---|
| Petit commerce | 0 DA | 3 497 DA | 124 DA | **3 665 DA** |
| Commerce actif | 124 DA | 3 497 DA | 124 DA | **3 968 DA** |
| Gros volume | 2 360 DA | 3 497 DA | 124 DA | **6 873 DA** |
| Très gros | 8 694 DA | 3 497 DA | 124 DA | **15 105 DA** |

---

## 5. Le piège : le tarif dépend du pays de TON client

Meta facture selon **le pays du client final** (le destinataire), pas selon l'Algérie. Une
boutique algérienne qui vend à la diaspora paie donc le tarif du pays de ses clients.

| Marché du destinataire | Service | Marketing | × Algérie |
|---|---|---|---|
| **Algérie / Tunisie (Rest of Africa)** | 0,62 DA | 3,50 DA | 1,0× |
| France (Rest of Western Europe) | **2,66 DA** | 9,18 DA | **4,3×** |
| Canada / USA (North America) | 0,53 DA | 3,87 DA | 0,8× |
| Émirats | 1,42 DA | 6,09 DA | 2,3× |
| Autres pays (« Other ») | 1,20 DA | 9,37 DA | 1,9× |

👉 **À demander à chaque client avant de vendre une option à prix fixe** : « tes clients sont
dans quel pays ? ». Un e-commerçant qui vend en France double facilement sa facture WhatsApp.

*(Le Maroc sort de « Rest of Africa » au 01/10/2026 pour un tarif propre, plus élevé.)*

---

## 6. Accès direct Meta ou BSP ?

Pour 3 000 messages de service par mois et par client :

| Montage | Coût Meta | Frais BSP | **Total/mois** | Coût moyen/message |
|---|---|---|---|---|
| **Accès direct** (Tech Provider) | 1 242 DA | 0 DA | **1 242 DA** | 0,41 DA |
| **Twilio** (+0,005 $/msg) | 1 242 DA | 1 350 DA | **2 592 DA** | 1,09 DA |

L'accès direct est **gratuit chez Meta** mais exige : statut Tech Provider, vérification
d'entreprise, App Review des permissions `whatsapp_business_messaging` +
`whatsapp_business_management`, et **Embedded Signup v4** (v2/v3 dépréciés au 15/10/2026).

**Nuance stratégique importante :** les **paliers de volume** (baisse du tarif utility/
authentication au-delà de certains seuils mensuels) s'agrègent **au niveau du business
portfolio**. En statut *Tech Provider*, chaque client a son propre portfolio → chaque client
reste au tarif de base. Si JawebFlow portait lui-même les WABAs (modèle *Solution Partner*
avec ligne de crédit), le volume de **tous** les clients s'additionnerait et pourrait débloquer
des paliers inférieurs — mais tu porterais la facturation et le risque de paiement.

→ **Direct** si WhatsApp devient un pilier de l'offre ; **BSP** seulement pour tester.

---

## 7. Ce que WhatsApp mange dans chaque pack

Coût mensuel du canal (service + IA) rapporté au prix du pack :

| Pack | Prix | 40 conv. | 200 conv. | 800 conv. | 2 500 conv. |
|---|---|---|---|---|---|
| **Basic** | 6 850 DA | 45 DA (0,7 %) | 347 DA (5,1 %) | **3 253 DA (47,5 %)** | **11 484 DA (167 %)** ⚠️ |
| **Pro** | 18 700 DA | 45 DA (0,2 %) | 347 DA (1,9 %) | 3 253 DA (17,4 %) | **11 484 DA (61,4 %)** |
| **Enterprise** | 47 100 DA | 45 DA (0,1 %) | 347 DA (0,7 %) | 3 253 DA (6,9 %) | 11 484 DA (24,4 %) |

**Conclusion sans ambiguïté : WhatsApp ne peut pas être inclus silencieusement dans Basic.**
À 800 conversations/mois, il consomme déjà la moitié de l'abonnement ; au-delà, le pack est
vendu à perte. (Rappel : le plafond de coût IA de Basic est de 3 $ ≈ 405 DA — il couperait
l'IA bien avant, mais les frais Meta, eux, **ne sont pas plafonnés par JawebFlow**.)

---

## 8. Combien facturer l'option

Coût réel d'une réponse : **0,81 DA**. Prix conseillé pour une marge de 50 % :

| Palier | Coût réel | **Prix conseillé** | ≈ par jour (à 30 jours) |
|---|---|---|---|
| 1 000 messages | 807 DA | **1 614 DA** | 54 DA |
| 2 500 messages | 2 017 DA | **4 035 DA** | 134 DA |
| 5 000 messages | 4 035 DA | **8 070 DA** | 269 DA |
| 10 000 messages | 8 070 DA | **16 140 DA** | 538 DA |

**Trois montages possibles :**

- **A. Pass-through (le plus sain économiquement)** — le client achète des crédits WhatsApp.
  Prix au message conseillé : **1,61 DA** (contre 0,81 DA de coût).
- **B. Option mensuelle** — « **+3 228 DA/mois, 2 000 messages inclus, puis 1,61 DA/message** ».
  Couvre le gros du trafic, le dépassement reste payant.
- **C. Réservée à Pro/Enterprise** avec clause d'usage raisonnable.

⚠️ **Le marketing doit être facturé séparément et au message** : 3,50 DA chez toi contre
9,18 DA si tu appliques la même marge que sur le service. **Vendre « relances illimitées » est
le moyen le plus rapide de perdre de l'argent** — c'est exactement le piège que Meta a tendu
en supprimant la gratuité des messages de service le 01/10/2026.

---

## 9. Le levier qui rend WhatsApp presque gratuit : la pub Click-to-WhatsApp

Si le client vient d'une pub et que tu réponds dans les 24 h, la fenêtre gratuite (jusqu'à
7 jours) efface les frais Meta. Sur un client à 800 conversations/mois :

| Part du trafic via pub | Coût Meta/mois | Économie | Coût IA | Total |
|---|---|---|---|---|
| 0 % | 2 360 DA | 0 DA | 893 DA | 3 253 DA |
| 15 % | 1 913 DA | 447 DA | 893 DA | 2 805 DA |
| 30 % | 1 466 DA | 894 DA | 893 DA | 2 358 DA |
| **50 %** | **869 DA** | **1 490 DA** | 893 DA | **1 762 DA** |

👉 Meilleur argument commercial du canal : **« dépense en pub plutôt qu'en frais de message »**.
Conditions : répondre dans les 24 h, client sur WhatsApp Android/iOS (pas desktop/web).
Les réponses de **Meta Business Agent** restent facturées (2 $/M tokens ≈ 4–5 ¢/message) — sans
objet ici, puisque c'est **ton** IA qui répond : à 0,81 DA la réponse, ton bot maison est
**~7× moins cher** que l'agent de Meta en Algérie.

---

## 10. À l'échelle de JawebFlow

Avec 200 conversations/mois par client, option facturée à la marge de 50 % :

| Clients avec WhatsApp | Coût total | Encaissé | Marge |
|---|---|---|---|
| 5 clients | 1 737 DA | 3 474 DA | 1 737 DA |
| 25 clients | 8 685 DA | 17 370 DA | 8 685 DA |
| 100 clients | 34 740 DA | 69 480 DA | 34 740 DA |

**Le coût de WhatsApp augmente linéairement avec le trafic** — contrairement à l'IA, aucune
économie d'échelle n'est à attendre. Les seuls leviers sont : le tarif par message (paliers de
volume), l'accès direct plutôt qu'un BSP, et la fenêtre gratuite des pubs.

---

## 11. Ce qu'il faut faire concrètement

1. **Reconfirmer le barème** « Rest of Africa » du 01/10/2026 dans le **Billing Hub Meta**
   avant de publier un prix (les chiffres de service ici viennent de barèmes partenaires ;
   Meta publie son tableau dans un composant interactif qui ne s'exporte pas).
2. **Ne pas inclure WhatsApp dans Basic.** En faire une option facturée (montage B) ou une
   exclusivité Pro/Enterprise.
3. **Facturer les campagnes marketing à l'unité**, jamais en illimité.
4. **Consommer la franchise intelligemment** : 1 000 messages de service gratuits par numéro
   et par mois — donc **un numéro WhatsApp par client**, jamais un numéro partagé.
5. **Instrumenter le compteur** : il faut compter les messages facturables par client dès le
   premier jour (le code sait déjà compter les conversations IA — il faut la même chose pour
   les messages Meta, sinon la refacturation est impossible).
6. **Pousser la pub Click-to-WhatsApp** auprès des clients qui font du volume : c'est le seul
   moyen de ramener les frais Meta vers zéro.
7. **Vérifier le pays des clients finaux** avant de fixer le prix de l'option (France = 4,3×).

---

## 12. Sources et limites

**Sources officielles utilisées :**
- Meta — *Pricing on the WhatsApp Business Platform*, page mise à jour le **30/09/2026** :
  facturation par message livré, tarif par pays du destinataire, table des codes pays
  (**Algérie = Rest of Africa**), franchise de **1 000 messages de service** par numéro et par
  mois, gratuité des messages entrants, fenêtre « free entry point », Meta Business Agent à
  2 $/M tokens, paliers de volume au niveau du portfolio.
  https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Extension de la fenêtre « free entry point » de 72 h à **7 jours** au **28/09/2026**
  (changelog Meta, relayé par les partenaires).
- Meta — *Embedded Signup : Implementation* (prérequis Tech Provider, **v2/v3 dépréciés au
  15/10/2026**).
- Twilio — frais de traitement **0,005 $/message** (entrant et sortant), frais Meta en
  pass-through : https://www.twilio.com/en-us/whatsapp/pricing

**Limites à assumer :**
- Le **tableau chiffré** du barème Meta est un composant interactif non exportable : les taux
  « Rest of Africa » au 01/10/2026 retenus ici (0,0259 / 0,0046 / 0,0046) viennent de barèmes
  publiés par des partenaires Meta (Gallabox, ManyChat, Sleekflow). Fourchette observée :
  **service/utility 0,0040–0,0046 $, marketing 0,0225–0,0259 $**.
- La page Meta contient encore des passages non mis à jour (elle affiche « 72 heures » pour la
  fenêtre pub à un endroit, alors que le changelog du 28/09/2026 annonce 7 jours).
- Le coût IA (0,19 DA/message) vient de la mesure faite dans `docs/COUTS_PLANS.md`.
- Hypothèse de trafic : **6 réponses du bot par conversation** (modifiable :
  `--reponses=8`).

**Rejouer les calculs :**

```bash
node scripts/couts-whatsapp.mjs                      # hypothèses par défaut
node scripts/couts-whatsapp.mjs --change=140         # autre taux de change
node scripts/couts-whatsapp.mjs --marge=60           # autre marge de revente
node scripts/couts-whatsapp.mjs --reponses=8         # conversations plus longues
node scripts/couts-whatsapp.mjs --bsp=twilio         # en passant par un BSP
node scripts/couts-whatsapp.mjs --rate-service=0.0040  # autre taux Meta
```
