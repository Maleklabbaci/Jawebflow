# Audit complet de la plateforme JawebFlow

Date : 21 septembre 2026 · Branche : `arena/01a0c258-jawebflow` · Commits : `29898c6`, `99360f9`, `86fcbe1`

---

## 1. Le point le plus important : il y a DEUX backends, et seul l'un des deux était corrigé

| | Stack | Fichiers | Où c'est utilisé |
|---|---|---|---|
| **Serveur Express** | `server.ts` (~2 100 lignes) | `npm run dev` / `npm start` | Local + Cloud Run |
| **Cloudflare Pages Functions** | `functions/api/*`, `functions/_shared/*` | `npm run deploy:cloudflare` | **Votre site en production** |

Votre site tourne sur **Cloudflare Pages** (`deploy:cloudflare`, `INSTAGRAM_REDIRECT_URI=https://jawebflow.pages.dev`, `public/_redirects`, `public/_routes.json`).
`deploy:firebase` ne déploie **que** `dist` en statique : aucun endpoint `/api/*` n'existe sur Firebase Hosting. Si un client installe le widget depuis un domaine Firebase Hosting, il ne fonctionne pas.

**Conséquence :** mes deux premiers correctifs (crash du serveur, plan « free ») concernaient `server.ts`, donc le développement local — **pas** votre production. Le backend réellement actif (`functions/`) contenait d'autres bugs, plus graves, corrigés dans le commit `86fcbe1`.

**Recommandation forte :** faire de `functions/` la seule source de vérité et réduire `server.ts` au dev, ou l'inverse. Aujourd'hui chaque règle métier existe en double et les deux versions divergent déjà (plan gratuit bloqué côté Express, jamais vérifié côté Cloudflare).

---

## 2. Ce qui expliquait « l'IA ne répond pas / répond mal » — corrigé

### 2.1 Firestore interrogé en ANONYME depuis les Functions → la base de connaissances n'était jamais chargée

`functions/api/chat.js`, `scan.js`, `track.js`, `widget-config.js` faisaient :

```js
fetch(`https://firestore.googleapis.com/v1/.../assistants/${id}?key=${env.FIRESTORE_API_KEY}`)
```

Une clé Web dans l'URL = requête **non authentifiée**. Les règles exigent `signedIn() && resource.data.userId == request.auth.uid` → **PERMISSION_DENIED**. Et comme la réponse n'était jamais vérifiée (`if (assistantRes.ok)`) :

- `chat.js` : `config = {}` → **l'IA répondait sans le nom, les tarifs, la FAQ ni les notes du client**, silencieusement ;
- `scan.js` : l'écriture `PATCH` échouait → le scan annonçait `success: true, scanned: N` **sans rien enregistrer** ;
- `track.js` : `PATCH prospects/...` refusé → **les téléphones/emails capturés étaient perdus** (seul le premier `create` passait).

**Corrigé** : nouveau module `functions/_shared/google.ts` (JWT signé par le compte de service → jeton OAuth), lecture `adminGetDocument()` avec vérification systématique de la réponse, écritures en Admin, et `firebase`-rules cohérentes.

> ⚠️ Si vos règles Firestore déployées sont en réalité ouvertes (`allow read, write: if true`), alors tout *fonctionnait* mais **n'importe qui pouvait lire/écrire les données de tous vos clients** (leads, tokens Instagram, base de connaissances). Dans les deux cas le correctif est le même : accès Admin côté serveur + règles fermées (`firestore.rules` mis à jour).

### 2.2 Modèles Gemini morts ou en fin de vie

| Fichier | Avant | État | Après |
|---|---|---|---|
| `functions/api/webhook/instagram.ts` | `gemini-1.5-flash` | **retiré par Google** → toutes les réponses DM tombaient sur la phrase générique | variable `GEMINI_MODEL` |
| `functions/api/crawler/analyze.ts` | `gemini-2.5-flash-lite` | génération 2.5 **arrêtée en octobre 2026** | `GEMINI_MODEL` |
| `server.ts` (×7) | `gemini-2.5-flash-lite` | idem | `GEMINI_MODEL` |
| défaut partout | — | — | **`gemini-3.1-flash-lite`** (stable, moins cher, retrait pas avant mai 2027) |

**Correction honnête de mon analyse précédente :** j'avais qualifié `gemini-3.7-flash` de modèle inexistant. C'est faux — Gemini 3.7 Flash est GA depuis le 13/08/2026 ([journal Google](https://ai.google.dev/gemini-api/docs/changelog), [doc modèle](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)). Mon changement vers `2.5-flash-lite` a substitué un modèle valide par un modèle bientôt retiré ; c'est maintenant centralisé dans `GEMINI_MODEL`.

### 2.3 Les pannes étaient invisibles

`chat.js` répondait **HTTP 200** avec une phrase de secours à chaque erreur, sans aucun log : impossible de savoir pourquoi le bot ne répondait pas.

**Corrigé** : chaque réponse embarque un tableau `diagnostics` (`GEMINI_API_KEY absente côté Pages Functions`, `config assistant non chargée: HTTP 403 ...`, `Gemini ... HTTP 400 ...`), les erreurs sont loggées (visibles dans `wrangler pages deployment tail`), et le simulateur du cockpit les affiche.

### 2.4 Le bot oubliait la conversation

Le widget n'envoyait jamais `history`, pourtant géré par l'API → le bot repartait de zéro à chaque message. `public/cdn/widget.js` envoie désormais les 6 derniers échanges.

---

## 3. Sécurité

| # | Problème | Gravité | Statut |
|---|---|---|---|
| 1 | **Mots de passe Super Admin en dur** (`Malek2001`, `Admin2026!`) dans `AdminPage.tsx` → présents dans le bundle public, lisibles par tout visiteur | **Critique** | corrigé — Firebase Auth + `isUserAdmin()` uniquement. **Changez ces mots de passe.** |
| 2 | `/api/scan` & `/api/crawler/analyze` **sans authentification** : n'importe qui pouvait écraser la base de connaissances d'un autre client en passant son `assistantId` | **Critique** | corrigé — jeton Firebase + vérification de propriété |
| 3 | **SSRF** : ces endpoints fetchaient n'importe quelle URL (`http://169.254.169.254/…`, `http://127.0.0.1`, réseau privé), utilisables comme proxy interne / DoS | Élevé | corrigé — `isPublicHttpUrl()` (Express + Functions), testé sur 14 cas |
| 4 | **Webhooks Instagram sans vérification de signature** : n'importe qui pouvait POSTer de faux DM et faire répondre/dépenser le bot | Élevé | corrigé — `X-Hub-Signature-256` vérifiée (active dès que `INSTAGRAM_APP_SECRET` est défini) |
| 5 | Vérification Meta **contournée** côté Express : le challenge était renvoyé pour *n'importe quel* `hub.verify_token` (la liste `validTokens` n'était jamais utilisée) | Élevé | corrigé — jeton exigé, `403` sinon |
| 6 | Jetons de vérification **codés en dur** (`jawebflow_secret_token`, `jawebflow`, …) servant de valeur par défaut | Moyen | corrigé — échec fermé (`503`) si non configuré |
| 7 | `firestore.rules` : **aucune règle pour `invoices`** (la console admin ne pouvait pas lire les factures) ; `usage` et `knowledge_base` non couverts ; créations `conversation_contexts` non bornées | Moyen | corrigé |
| 8 | CORS `*` + **aucune limitation de débit** sur les endpoints IA publiques (le quota Gemini peut être épuisé par un tiers) | Moyen | partiellement corrigé — limiteur en mémoire côté Express ; **ajoutez une règle de rate limiting Cloudflare** en production |
| 9 | Tout détenteur d'un `assistantId` peut interroger la base de connaissances d'un autre client via `/api/chat` (pas de clé widget ni de domaine autorisé) | Moyen | à faire — voir §6 |
| 10 | `functions/api/widget-config.js` renvoyait **tous** les champs string du document (`userId`, `webhookUrl`, notes internes) publiquement | Moyen | corrigé — liste blanche de champs publics |
| 11 | `env.FIRESTORE_API_KEY` utilisé comme clé de service dans les Functions (confusion clé publique / secret) | Moyen | corrigé — compte de service pour Firestore, clé Web uniquement pour valider les jetons |

---

## 4. Bugs fonctionnels corrigés

1. **Plan d'abonnement jamais vérifié en production** : `chat.js` ne regarde pas `plan`. Un compte gratuit consomme donc l'IA, alors que `server.ts` bloque (`AI_DISABLED_FREE_PLAN`). Deux comportements opposés selon l'environnement.
2. **`server.ts` mourait** sur un `unhandledRejection` du SDK Firestore Admin sans identifiants (le site tombait dès le premier appel API) → identifiants validés avant usage + garde-fous de processus.
3. **`.env` jamais chargé** (`dotenv` installé mais jamais importé) : toutes vos clés étaient ignorées en local. Les valeurs d'exemple (`MY_GEMINI_API_KEY`) sont désormais traitées comme absentes.
4. **`/widget.js` ≠ `/cdn/widget.js`** : deux copies divergentes (407 vs 390 lignes) et le serveur Express renvoyait l'ancienne sur les deux routes. Une seule copie maintenant (+ détection robuste du `<script>` qui manquait dans la copie récente, + historique envoyé).
5. **Webhook Instagram en double** : deux endpoints vivants (`/api/webhook/instagram` et `/api/instagram/webhook`) avec des comportements différents. Les deux sont sécurisés ; **gardez-en un seul** (Meta ne peut pointer que vers une URL).
6. **`for...forEach` avec `async`** dans les webhooks de paiement (`server.ts`) : les mises à jour de plan peuvent ne jamais aboutir. À remplacer par `for...of` + `await Promise.all`.
7. **Paiement encaissable sans vérification** (`server.ts`) : `POST /api/payment/checkout` enregistre une facture `status: 'paid'` **sans confirmation de paiement**. Les webhooks Stripe/SlickPay ne vérifient pas la signature (`STRIPE_WEBHOOK_SECRET` inutilisé) ni le montant. À traiter avant toute vraie vente.

---

## 5. Vérifications effectuées

- `npx tsc --noEmit` ✅ · `npm run build` (vite + esbuild) ✅
- `esbuild --bundle` sur **chaque** Page Function (imports TS résolus) ✅
- **`wrangler pages dev`** (runtime Cloudflare réel) :
  - `/api/scan` et `/api/crawler/analyze` sans jeton → **401** ✅
  - signature Meta valide → **200**, invalide/absente → **401** ✅ (comparaison d'empreinte validée octet-pour-octet contre `crypto.createHmac`)
  - `hub.verify_token` correct → challenge, incorrect → **403**, non configuré → **503** ✅
  - `/api/chat` sans clé → texte de secours **+ diagnostics explicites** ✅
- Serveur Express : 6 cas d'SSRF refusés (`localhost`, `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`, `[::1]`), URL publique toujours autorisée, limitation de débit → **429** au 61ᵉ appel/min, webhook refusé avec un mauvais jeton ✅
- Cas de plan (via Firestore simulé) : `free` bloqué, `pro`/`basic` autorisés, quota dépassé → `LIMIT_REACHED`, `assistantId` inconnu → `ASSISTANT_NOT_FOUND` ✅

---

## 6. Ce qu'il vous reste à faire (par ordre d'importance)

1. **Changer les mots de passe Super Admin** `Malek2001` / `Admin2026!` (ils ont été exposés publiquement) et vérifier la liste `SUPER_ADMIN_EMAILS`.
2. **Configurer `FIREBASE_SERVICE_ACCOUNT`** dans Cloudflare Pages → Settings → Environment variables (sinon lecture de la base de connaissances et capture des prospects restent cassées — le comportement est désormais explicite, plus silencieux).
3. **Déployer `firestore.rules`** (`firebase deploy --only firestore:rules`) et surtout vérifier dans la console Firebase que les règles actives ne sont pas ouvertes.
4. **Ajouter un rate limiting Cloudflare** (WAF → Rate limiting rules) sur `/api/chat`, `/api/scan`, `/api/crawler/analyze`.
5. **Choisir un seul backend** (Functions *ou* Express) pour éviter la divergence ; sinon reporter chaque règle métier deux fois.
6. **Sécuriser la facturation** : vérifier les signatures Stripe/SlickPay et ne marquer `paid` qu'après confirmation — **c'est le point le plus risqué qui reste**.
7. **Clé widget + restriction de domaine** : `assistantId` seul ne protège rien ; l'ajout d'une clé publique et d'un contrôle d'origine empêcherait l'usage détourné de vos assistants et le vol de contenu des bases de connaissances.
8. **Fusionner les deux webhooks Instagram** et renseigner `INSTAGRAM_APP_SECRET` + `INSTAGRAM_VERIFY_TOKEN`/`META_VERIFY_TOKEN`.
9. Vérifier `GET /api/health` après déploiement : il indique en une requête quelles intégrations sont réellement configurées.
