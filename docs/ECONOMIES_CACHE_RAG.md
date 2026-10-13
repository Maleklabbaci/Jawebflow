# 💰 Économies : mise en cache du contexte + RAG (13/10/2026)

Deux leviers distincts, tout deux branchés sur **le même appel Gemini** :

| Levier | Ce qu'il fait | Où c'est branché |
|---|---|---|
| **RAG borné** | N'envoie à Gemini **que les sections de la base qui parlent de la question**, avec un plafond dur en caractères | `functions/api/site-chat.ts`, `functions/api/chat.js`, `functions/api/webhook/instagram.ts`, canaux |
| **Mise en cache** *(context caching)* | Met en cache la partie **stable** (consignes + base complète + FAQ + tarifs) et la **relit à 10 % du prix** | `functions/api/chat.js` → `functions/_shared/gemini-cache.ts` |
| **Recherche pendant l'appel** | L'agent vocal ne porte QUE ses règles : la base est cherchée à la question (≤ 900 car.) | `functions/api/voice/knowledge.ts` → `chercher_information` |

Code : `functions/_shared/rag.ts` (sélection + budgets) · `functions/_shared/gemini-cache.ts` (cache) ·
`functions/_shared/prompt.ts` (`buildCacheKnowledgeBlock`).

---

## 1. Les tarifs réels (Gemini 3.1 Flash-Lite, oct. 2026)

| Poste | Prix |
|---|---|
| Entrée normale | **0,25 $** / M de jetons |
| **Lecture du cache** | **0,025 $** / M → **−90 %** |
| Écriture du cache | 0,08333 $ / M (une fois par entrée) |
| **Stockage du cache** | **1,00 $** / M de jetons **par heure** |

> ⚠️ C'est le **stockage** qui décide de tout : garder un bloc de 6 700 jetons en cache 24 h coûte
> **0,16 $ de stockage par jour**, soit plus que ce qu'un petit commerçant économise. On cache donc
> par **petites tranches** : `TTL = 10 minutes` par défaut (`GEMINI_CONTEXT_CACHE_TTL_SECONDS`
> pour allonger). Une conversation active relit le même bloc à 10 % du prix, puis le cache expire.

**Plancher Google** : la famille Gemini 3 refuse de créer un cache **en dessous de 4 096 jetons**
(~16 400 caractères). `cacheableChars()` refuse donc *avant* l'appel réseau : consigne courte = RAG
seul, sans tentative inutile (ni latence, ni bruit).

---

## 2. Mesures faites sur le code (pas des estimations)

### Chat du site vitrine (`/api/site-chat`)

| Cas | Avant | Après RAG | Économie |
|---|---|---|---|
| Base par défaut (1 669 car.) | 5 185 car. · ~1 297 jetons | **identique** (base déjà sous le budget) | 0 % — rien à gagner |
| Base pleine (5 469 car.) | 8 985 car. · ~2 247 jetons · **0,56 $** / 1 000 messages | 4 687 car. · ~1 172 jetons · **0,29 $** / 1 000 messages | **−48 %** (≈ 72 DA / 1 000 messages) |

Ici **le cache n'est pas possible** : le prompt complet du site fait ~1 300 jetons, 3 fois moins que
le plancher de Google. Le bon levier, c'est le RAG — et c'est celui qui est branché.

### Chat marchand (`/api/chat`) — assis sur la base de connaissance du compte

| Cas | Comportement choisi | Coût des jetons répétés (1 000 messages) |
|---|---|---|
| 3 fiches (base 256 car.) | consignes + base = ~1 786 jetons ⇒ **sous le plancher** : RAG par tour (sélection de 271 car.) | **~0,65 $** (inchangé, déjà optimal) |
| 60 fiches (base 19 908 car.) | consignes + base = ~6 700 jetons ⇒ **cache explicite** : relus à 0,025 $/M | **0,17 $** au lieu de 0,65 $ ⇒ **−74 %** |

Sur le gros catalogue, la mise en cache coûte **0,00056 $** d'écriture (une fois) et **0,0067 $/heure**
de stockage : elle est donc rentable dès **~1 300 messages par mois** *dans cette configuration*, et
donne en plus au modèle **tout le catalogue** au lieu d'un extrait — réponses plus justes, sans
inventer un prix parce que la fiche n'était pas passée.

---

## 2 bis. 🎙️ L'appel vocal : la base n'est plus dans le prompt du tout

Le chat écrivait la base dans son prompt système ; **l'appel**, lui, ne la
transportait même plus. Mesures (mêmes outils, 13/10/2026) :

| Cas | Avant | Après |
|---|---|---|
| Appel d'un marchand, 60 fiches (base 5 768 car.) | prompt **8 676 car.** (~2 169 jetons) **à chaque tour de parole** | prompt **3 520 car.** (~880 jetons) **−59 %** |
| Appel du site vitrine | 5 862 car. (base comprise) | **4 080 car.** (~1 020 jetons) **−30 %** |
| Question du client pendant l'appel | — | recherche `chercher_information` → **≤ 900 car.** (~225 jetons), seulement s'il demande quelque chose |
| « bonjour », « ok », « merci » | base renvoyée quand même | **aucune recherche** : 0 donnée payée |

Le chemin est : `chercher_information` (outil du jeton) → `POST /api/voice/knowledge`
→ `selectKnowledgeSections()` sur la base du compte (`knowledge_entries`, sinon les
notes/FAQ/tarifs) → **les lignes utiles uniquement**, avec un plafond dur de
900 caractères et **60 recherches / 10 min / IP**.

Deux garde-fous ajoutés le même jour, parce qu'une recherche doit être HONNÊTE :

- **plus de « réponse à côté »** : si la question n'a aucun terme en commun avec la
  base, la recherche renvoie vide (le bloc « informations vitales » ne répond plus
  à une question de moto) ⇒ l'agent dit « je ne sais pas » ;
- **plus de faux positifs de mots outils** : « est », « ou », « vos », « quelle »…
  sont ignorés, et un terme de 2-3 lettres ne compte que s'il est un **mot entier**
  (« est » ne matche plus « question » ni « essentiel »).

## 3. Ce qui est **toujours** envoyé à 100 % du prix

La donnée vivante ne se cache pas (sinon Gemini répondrait avec un contexte périmé) :

- le message du client et l'historique court de la conversation ;
- la mémoire du prospect, le brouillon de commande, l'état du dossier ;
- les documents du site **sélectionnés pour la question** (≤ 5 extraits de 620 caractères) ;
- si le cache est actif, les fiches/FAQ/tarifs **ne sont pas renvoyés en plus** : ils sont déjà dans
  le cache (règle `cachedPieces`) — aucun doublon facturé.

---

## 4. Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `GEMINI_CONTEXT_CACHE_ENABLED` | `true` | coupe la mise en cache (`false`) si tu veux zéro frais de stockage |
| `GEMINI_CONTEXT_CACHE_TTL_SECONDS` | `600` | durée de vie du cache (120 s → 86 400 s). Court = moins de stockage, long = plus de relectures à 10 % |

Budgets (dans `functions/_shared/rag.ts`) :

| Constante | Valeur | Ce qu'elle plafonne |
|---|---|---|
| `TURN_RAG_BUDGET_CHARS` | 9 000 | le contexte de connaissance envoyé à chaque message marchand |
| `SITE_KB_TURN_BUDGET_CHARS` | 2 600 | la base du site vitrine par message |
| `KB_CACHE_BUDGET_CHARS` | 20 000 | ce qui part dans le cache (~5 000 jetons) |
| `CACHE_MIN_TOKENS` | 4 096 | plancher Google : en dessous, aucun cache n'est tenté |

---

## 5. Ce que tu vois dans les journaux

- `[gemini-cache] cache système prêt (gemini-3.1-flash-lite, 5 100 jetons, TTL 600s…)`
- `cache Gemini réutilisé (5 100 jetons relus à 10 % du prix)` — visible dans `diagnostics` du widget (onglet Réseau)
- `RAG fiches : 60 fiches → 680 jetons sur ~5 000` — la sélection réelle du tour
- `[site-chat] base du site : 2 480/5 469 car. envoyés (~620 jetons, 55 % de moins)`

Et la réponse du chat porte désormais `usage.cachedTokens` : le nombre de jetons facturés à 10 %.
