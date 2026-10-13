# 💠 LE PLAN — détail complet (décision du 14/10/2026)

> Taux de travail : **270 DA = 1 $**. Tous les montants en dinar sont calculés avec ce taux.

---

## 1. Les prix

| | Gratuit | **Basic** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **Mensuel** | 0 $ | **10 $** = 2 700 DA | **20 $** = 5 400 DA | sur devis |
| **Annuel** (2 mois offerts = 10 mois payés) | — | **100 $/an** = 27 000 DA | **200 $/an** = 54 000 DA | négocié |
| Équivalent mensuel en annuel | — | 8,33 $ = 2 250 DA | 16,67 $ = 4 500 DA | — |

L'annuel, dit autrement : **tu paies 10 mois, tu en as 12.**

---

## 2. Ce que le client reçoit

**1 conversation = 1 message du client + la réponse de l'assistant (2 messages).**

| | Gratuit | **Basic** | **Pro** |
|---|---|---|---|
| Conversations / mois | 0 | **500** | **1 500** |
| Messages au total (client + bot) | — | 1 000 | 3 000 |
| Minutes d'appel (1 min = 10 conversations) | — | **50 min** | **150 min** |
| Repère quotidien | — | ~17 conversations/jour | ~50 conversations/jour |
| Chatbot du site web | ❌ | ✅ | ✅ |
| Instagram · Messenger · Telegram · TikTok | ❌ | ✅ | ✅ |
| **WhatsApp** | ❌ | ❌ | ✅ (1 000 messages inclus) |
| Agent vocal (le bot qui appelle) | ❌ | ✅ | ✅ |
| Personnalisation du widget | — | **totale** | **totale** |
| Module Réseaux sociaux (interfaces séparées) | ❌ | selon déblocage | selon déblocage |

### Deux exemples de mois réel

- **Basic** : 400 conversations écrites + 10 minutes d'appel (= 100 conversations) = **500 → forfait épuisé.**
- **Pro** : 1 200 conversations écrites + 30 minutes d'appel (= 300 conversations) = **1 500 → forfait épuisé.**

Un appel et l'écrit **piochent dans le même compteur** : le client choisit comment il dépense son forfait.

---

## 3. Ce que ça te coûte, ce que tu gardes

Coûts réels (Gemini Flash-Lite pour l'écrit, Gemini Live pour la voix) :

| | Coût réel |
|---|---|
| 1 message écrit (question + réponse) | **0,36 DA** (0,24 → 0,72) |
| 1 conversation écrite | **0,36 DA** |
| 1 conversation en appel | **0,62 DA** |
| 1 minute d'appel | **6,18 DA** = 17 messages |

### Au pire cas (le client épuise tout son forfait)

| Forfait | Coût IA max | Tu encaisses | **Ta marge** |
|---|---|---|---|
| **Basic** 500 conv (écrit) | 361 DA | 2 700 DA | **87 %** |
| **Basic** 50 min (tout en appels) | 309 DA | 2 700 DA | **89 %** |
| **Pro** 1 500 conv (écrit) | 1 083 DA | 5 400 DA | **80 %** |
| **Pro** 150 min (tout en appels) | 927 DA | 5 400 DA | **83 %** |

En moyenne (cas réel) : Basic te coûte **0,69 $** sur 10 $ (93 % de marge), Pro **2,07 $** sur 20 $ (90 %).

**Ta marge ne descend jamais sous 80 %, même si le client épuise tout, tout le temps.**

---

## 4. Ce qui arrête l'IA

1. **Le compteur de conversations** — arrivé au bout, l'assistant s'arrête proprement (message clair au visiteur, jamais d'erreur).
2. **Aucun plafond en dollars** sur Basic et Pro : c'est le forfait qui décide, jamais un montant.
3. **Enterprise** garde un fusible de **30 $** (8 100 DA) tant que le devis n'est pas chiffré.

---

## 5. Enterprise — comment ça marche

```
Le client nous contacte → on chiffre son besoin → Jimmy débloque son accès (🔓)
```

- Volume, canaux et minutes : **négociés** au cas par cas.
- Le module Réseaux sociaux s'ouvre **client par client**, depuis l'admin (bouton 🔒/🔓), jamais automatiquement.

---

## 6. Le widget : liberté totale

Le marchand est chez lui : il fait **exactement** ce qu'il veut.

### Déjà en place ✅

| Réglage | Choix |
|---|---|
| Couleur principale + dégradé | 6 palettes prêtes ou sa propre couleur |
| Position | bas-droite · bas-gauche |
| Forme | cercle · squircle · compact |
| Taille | discret (48 px) · standard (56 px) · confort (64 px) |
| Icône | 7 icônes fournies **ou son propre logo** |
| Thème | clair · sombre |
| Textes | accroche, message d'accueil, titre et sous-titre |
| Badge « en ligne » | affiché · masqué |
| Mention « Développé par JawebFlow » | affichée · masquée |
| Contact de secours WhatsApp | son numéro |
| Voix de l'agent | **6 voix** (Enjouée, Posée, Chaleureuse, Claire, Sérieuse, Grave) |
| Phrase d'ouverture de l'appel | son texte, prononcé exactement |
| Durée max d'un appel | 3 · 5 · 10 · 15 min |

### À construire 🔧 (demandé le 14/10)

| Nouveau réglage | Ce que ça fait |
|---|---|
| **Mode « le bot qui appelle »** | Widget 100 % appel : pas de chat, un seul gros bouton — le visiteur appuie, ça sonne, l'assistant parle. |
| **Bulle qui pulse** | Animation continue autour de la bulle : impossible de la rater. |
| **Accroche retardée** | La phrase d'accroche apparaît après X secondes (le visiteur a le temps d'arriver sur la page). |
| **Ouverture automatique** | Le chat s'ouvre tout seul après X secondes, avec un message d'accroche du bot. |
| **Message proactif** | Le bot parle le premier : « Vous cherchez un prix ? Je peux vous appeler tout de suite. » |
| **Bouton d'appel mis en avant** | Un vrai bouton « 📞 Appelez-moi » dans l'en-tête et dans l'accroche. |
| **CSS libre** | Le marchand colle son propre CSS pour aller au-delà des réglages prévus. |

### Le comportement (écrit **et** parlé) ✅

Même cerveau des deux côtés : ton, langue (darija DZ, darija TN, français, arabe, anglais), longueur des réponses, règles du marchand (priorité absolue), base de connaissances, FAQ, tarifs, recherche produits du site, mémoire, capture de contacts.

---

## 7. Récapitulatif en une image

```
               GRATUIT      BASIC 10 $        PRO 20 $
Conversations     0            500               1 500
Messages          —          1 000               3 000
Appels            —          50 min             150 min
WhatsApp          ❌            ❌                  ✅
Coût IA max       —          ~361 DA            ~1 083 DA
Ta marge          —            87 %               80 %

        ENTREPRISE → il contacte, on chiffre, Jimmy débloque
```
