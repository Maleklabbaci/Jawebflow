# Faut-il ajouter Telegram ? TikTok ? — la réponse par les chiffres algériens

> État au **7 octobre 2026** · Branche `arena/ec76ae56-jawebflow`
> Sources : NapoleonCat (utilisateurs par plateforme en Algérie, mai–juillet 2026),
> StatCounter (part d'usage, août 2026), webminds.dz (chiffres TikTok Algérie, mai 2026).

---

## 1. Réponse courte

| Canal | Verdict | Pourquoi |
|---|---|---|
| **Facebook Messenger** | ✅ **OUI — et en priorité n°1** | **29,3 M d'utilisateurs en Algérie (61 % de la population)** — plus qu'Instagram. Gratuit. |
| **TikTok** | ⚠️ **OUI, mais plus tard et après un test** | 12 M d'utilisateurs (15–28 ans). Gratuit, mais API en beta restreinte : éligibilité à confirmer. |
| **Telegram** | ❌ **NON pour le marché algérien** | **Il n'apparaît dans aucune statistique d'usage en Algérie.** Tes clients n'y sont pas. |

---

## 2. Les chiffres qui décident

### Utilisateurs en Algérie (2026)

| Plateforme | Utilisateurs | % de la population |
|---|---|---|
| **Facebook** | **35,0 M** | **73 %** |
| **Messenger** | **29,3 M** | **61 %** |
| Instagram | 15,4 M | 32 % |
| TikTok | ~12 M | ~25 % (audience 15–28 ans) |
| LinkedIn | 6,5 M | 13,5 % |
| **Telegram** | **non mesuré / absent des classements** | — |

### Part d'usage des réseaux sociaux (StatCounter, août 2026)

| Plateforme | Part |
|---|---|
| **Facebook** | **76,9 %** |
| YouTube | 13,0 % |
| Instagram | 7,6 % |
| Twitter/X | 2,1 % |

**Lecture :** en Algérie, le terrain de jeu, c'est **Facebook et Messenger**. Instagram — que
JawebFlow gère déjà — est **deux fois plus petit que Messenger**. Ajouter Messenger n'est donc
pas « un canal de plus » : c'est **le canal le plus grand du pays**, et il est **gratuit**.

---

## 3. Telegram : à écarter du produit (mais pas du plan de travail)

**Pourquoi non, côté marché :** Telegram n'apparaît dans aucun classement d'usage en Algérie.
Les commerçants algériens ne reçoivent pas leurs demandes clients sur Telegram, et leurs clients
n'y écrivent pas. Ajouter Telegram, ce serait construire un canal pour **zéro utilisateur réel**.

**Pourquoi il garde un intérêt… mais pas celui qu'on croit :** il est gratuit, sans validation
d'app, sans dossier Meta — la seule plateforme qu'on peut brancher en 2–4 jours. C'est donc un
**excellent outil de développement** : il permet de tester l'architecture multi-canal (webhook,
routage, contexte, base de connaissances) sans dépendre de Meta.

→ **Recommandation : code-le comme banc d'essai interne, mais ne le vends pas.** Ne le mets ni
sur la page Tarifs, ni dans la plaquette commerciale. Un canal que personne n'utilise décrédibilise
les trois autres.

---

## 4. TikTok : oui, mais pas comme promesse

**Pour le marché :** 12 M d'utilisateurs, surtout **15–28 ans**. C'est pertinent pour certains
secteurs — mode, cosmétiques, restauration, sport, formation — moins pour d'autres (immobilier
haut de gamme, B2B, services aux entreprises).

**Pour la technique :** toutes les API officielles TikTok sont **gratuites** (aucun tarif au
message), mais l'accès se paie **en temps** : compte Business obligatoire, candidature à la
Business Messaging API, revue de sécurité des données. Et l'API reste en **beta restreinte**
(APAC, LATAM, METAP, Amérique du Nord ; l'EEE, la Suisse et le Royaume-Uni en sont exclus).

**L'Algérie relève de METAP** → éligibilité *probable*, non confirmée.

→ **Recommandation : teste l'éligibilité avec un compte pilote AVANT de le promettre à un
client.** Si le test passe : TikTok dans tous les packs payants (coût récurrent nul). Sinon, on
aura perdu quelques heures au lieu de quelques semaines de développement.

---

## 5. L'impact sur les packs

| Canal | Frais par message | Où le placer |
|---|---|---|
| Web + Instagram | 0 | tous les packs (déjà en place) |
| **Messenger** | **0** | **tous les packs payants, Basic compris** |
| TikTok *(si éligible)* | **0** | tous les packs payants |
| Telegram | 0 | **nulle part** (outil interne) |
| WhatsApp | 1,24 DA | **Pro (1 000 inclus) · Enterprise (5 000)** |

**Messenger gratuit dans Basic — pour toi** : aucun frais de plateforme, donc aucune érosion de
marge au-delà de l'IA. **Pour le client** : le canal le plus utilisé du pays, offert. C'est le
meilleur argument de vente de tout le catalogue, et il ne coûte rien.

---

## 6. Feuille de route révisée

| Ordre | Canal | Durée | Pourquoi maintenant |
|---|---|---|---|
| **0** | **Factorisation multi-canal** | 2–3 j | **Aujourd'hui, 17 fichiers** portent du code spécifique à Instagram (`ig-api.ts`, `ig-automations.ts`, `instagram_integrations`, table `ig_automations`…) et le webhook fait **1 506 lignes**. Sans cette étape, chaque canal se paie deux fois. |
| **1** | **Messenger** + commentaires de Page | 5–8 j | **Le plus grand canal du pays (29,3 M)**, gratuit, réutilise le « commentaire → MP » déjà écrit pour Instagram. |
| **2** | **WhatsApp** | 15–25 j + dossier Meta | Le plus demandé, le seul payant → la montée en gamme Pro. |
| **3** | **TikTok** *(si le test d'éligibilité passe)* | 5–10 j | Audience jeune, coût nul. |
| — | ~~Telegram~~ | 2–4 j | **Uniquement comme banc d'essai de développement**, jamais vendu. |

**Le point clé :** Telegram et TikTok ne sont pas les bonnes prochaines étapes. **Messenger l'est**,
et de loin — c'est le réseau le plus utilisé en Algérie, il est gratuit, et il réutilise 80 % du
travail déjà fait pour Instagram.

---

## 7. Une nuance à garder en tête

Ces chiffres sont des **estimations de tiers** (NapoleonCat, StatCounter) : « utilisateurs » ne
veut pas dire « personnes qui écrivent à un commerce ». Le classement reste néanmoins sans
ambiguïté — l'écart Messenger (29,3 M) / Telegram (non classé) est trop grand pour être un
artefact de mesure.

**Vérification simple et gratuite avant de décider :** demande à une dizaine de tes clients
actuels *« par où tes clients te contactent-ils ? »*. Si aucun ne répond Telegram, la question
est tranchée.
