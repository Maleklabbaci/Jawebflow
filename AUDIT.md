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

---

## 7. Correctifs du 5 octobre 2026 — la conversation et la nature des validations

Deux défauts signalés par le propriétaire, corrigés dans **`functions/`** (le backend
réellement déployé sur Cloudflare Pages). Le serveur Express `server.ts` ne contient
**aucune** logique de commande/brouillon : il n'était donc pas concerné par le second
correctif (seul son message de secours Gemini a été aligné, cf. 7.1).

### 7.1 Le bot re-saluait en pleine conversation

La salutation partait dès qu'un message ressemblait à une politesse, sans vérifier si la
conversation avait déjà commencé. Un « ok » ou « salam » en cours d'échange relançait
« Bienvenue chez … » et tuait la discussion.

- `classifySmallTalk()` distingue bonjour / merci / au revoir / accord ; `localPoliteReply()`
  ne renvoie le message de bienvenue **qu'au premier contact** (`conversationStarted === false`).
- Instagram : la branche de politesse **archive l'échange** (`saveThread`) et vide
  `pending_messages`, sinon le message suivant repartait mélangé au précédent.
- Widget web : `/api/chat` charge l'historique serveur **avant** la réponse de politesse,
  journalise l'échange dans la fiche client, et `JawebChatWidget` envoie désormais les
  6 derniers messages — deux « salam » de suite ne renvoient plus qu'une seule bienvenue.
- `server.ts` : une panne de l'IA ne renvoie plus la salutation mais demande de répéter.

### 7.2 « La case commande » : la nature réelle de ce que le client valide

Tout était enregistré sous le mot « commande », y compris une visite immobilière ou un
rendez-vous. La nature est maintenant déduite de ce qui a réellement été convenu.

- `DealKind = order | visit | appointment | booking | quote` (`functions/_shared/sales-intent.ts`).
  « oui je valide la visite » → **Visite** ; « oui j'achète celle-là » → **Commande** ;
  « oui je valide le rendez-vous » → **Rendez-vous** ; réservation et devis idem.
- Le brouillon hérite de la nature posée par le bot (« Confirmez-vous cette visite ? »),
  donc un simple « oui » valide bien une visite.
- **Normalisation arabe réparée** : le pliage de « أ » se faisait après la décomposition
  NFKD, qui séparait la lettre — « أوافق » était lu « ا وافق » et **aucune** confirmation
  écrite en arabe n'était reconnue. Verbes darija ajoutés (« nvalidi la visite »,
  « waf9t 3la rdv », « nconfirmi »…).
- Annulations/modifications (`order-changes.ts`) : `dealWords()` emploie le mot juste en
  français/darija/arabe — on n'annonce plus « la commande est annulée » à un client qui
  avait validé une visite — et propose « date, heure ou coordonnées » au lieu de
  « taille/couleur » hors commande.
- `/api/leads` : `confirmed → delivered` autorisé hors commande (une visite se « réalise »,
  elle ne s'« expédie » pas) ; interdit pour une commande.
- Tableau de bord : onglet **« Commandes & RDV »**, badge de nature, libellés d'état partagés
  (`DEAL_STATUS_LABELS`) et bloc « Ce que ce client a validé » dans la fiche client.
- Notification marchand et contexte transmis à l'IA portent la bonne nature
  (« 🔥 VISITE À CONFIRMER », « Ne relancez pas la même question sur cette commande »).

### 7.3 Vérifications de cette passe

- `npx vitest run` → **33 fichiers / 543 tests** ✅ (511 avant ces correctifs)
- `npx tsc --noEmit` ✅ · `npm run build` (vite + esbuild) ✅
- Tests dédiés : politesse et absence de re-salutation (Instagram **et** widget web),
  nature de la validation (visite / rendez-vous / réservation / devis / commande),
  darija et arabe, transitions d'état par nature, affichage du tableau de bord.
- Non vérifié ici : aucun test contre un vrai compte Instagram/Gemini ni un projet
  Supabase réel — la validation repose sur la suite du dépôt.

---

## 8. Relances automatiques (1 h / 24 h) — 5 octobre 2026

Quand un client **valide une action** (commande, visite, rendez-vous, réservation,
devis) sur Instagram, deux relances sont planifiées sur sa fiche (`relances`) :
**+1 h** et **+24 h**. La tâche `GET /api/cron/relances?token=…` (à appeler toutes
les ~10 min par cron-job.org / n8n / ViaSocket) envoie en DM les relances arrivées à
échéance puis les marque envoyées.

- `functions/_shared/relances.ts` : planification (`buildRelances`), échéance
  (`dueRelances`) et textes (`relanceText`, qui reprend la bonne nature).
- `functions/api/webhook/instagram.ts` : crée les relances à la validation.
- `functions/api/cron/relances.js` : l'envoi planifié (auth par `CRON_SECRET`).

**À configurer pour activer :** ajouter `CRON_SECRET` dans Cloudflare Pages, puis
créer une tâche planifiée appelant `/api/cron/relances?token=<CRON_SECRET>` toutes les
10 minutes.

**Limite Meta :** Instagram n'autorise un message sortant que dans les 24 h suivant le
dernier message du client. La relance « 1 h » passe toujours ; la « 24 h » est à la
limite de la fenêtre et peut être refusée par Meta — elle est tentée puis marquée
envoyée pour ne pas boucler. Le widget web n'a pas de canal sortant : seules les
discussions Instagram sont relancées.

---

## 9. Prêt « grande société » (hors paiement, reporté) — 5 octobre 2026

### Échelle : fin du plafond de 200 prospects
- `supabaseListProspects(env, id, { limit, offset })` page désormais ; `listAllProspects`
  parcourt TOUT (garde-fou 5000) pour les tâches de fond (relances, résumés).
- `/api/leads` accepte `?limit&offset` et renvoie `{ prospects, total, hasMore }`.
- Tableau de bord : bouton « Charger plus de clients » (monte la limite par +200).

### Isolation des clients + débit sur `/api/chat`
- `widget-access.ts` : chaque assistant peut définir `widgetKey` et `allowedDomains`
  (liste de domaines, sous-domaines compris). `/api/chat` renvoie **403** si la clé ou
  le domaine ne correspond pas ; rien n'est configuré → laissé passer (rétrocompatibilité).
- `rate-limit.ts` : limite glissante (60/min par assistant+origine) → **429**. En mémoire
  par isolate (best-effort) ; complétez avec une règle de rate limiting Cloudflare (WAF).
- Le widget envoie son `origin` pour que la restriction de domaine s'applique.

**Pour activer l'isolation :** dans la config de l'assistant (jsonb `config`), définir
`widgetKey` (clé publique que seul votre widget envoie) et `allowedDomains`
(ex. `["https://votre-site.dz"]`).

**Reste à faire (non traité ici) :** rôles d'équipe (admin/agent/lecture seule) et,
explicitement reporté à votre demande, la sécurisation des paiements (§4.7).

### Rôles d'équipe + écran « Sécurité & équipe » (même passe)
- `src/lib/roles.ts` : `resolveTeamRole` (propriétaire = admin ; sinon `teamRoles`
  email→rôle ; à défaut lecture seule) et `roleCan` (permissions par rôle).
- Tableau de bord : carte **« Sécurité & équipe »** (admin) dans « Mon profil » pour
  régler `widgetKey` + `allowedDomains` (bouton Générer) et assigner des rôles
  (`teamRoles`). L'abonnement/facturation est masqué aux non-admins.

## 10. Le coach du bot — la plateforme développe le robot du marchand (5 octobre 2026)

**But :** le marchand ne sait pas quoi ajouter pour que son robot vende. La
plateforme le lui dit, et « Mon IA » peut le faire à sa place.

- `functions/_shared/bot-coach.ts` : `buildCoachPlan()` analyse l'état RÉEL de
  l'assistant et renvoie un plan ordonné (10 points : fiches de connaissances,
  informations officielles, questions restées sans réponse, règles du commerçant,
  site, Instagram, clé/domaines du widget, relais humain, ton, test au simulateur)
  avec pour chacun *quoi / pourquoi / comment / quel écran*, plus un score
  « prêt à X % ». `coachPlanText()` en fait un texte lisible.
- **« Mon IA » oriente le marchand** : `CopilotSnapshot.coach` (questions ouvertes,
  ton, relais humain, clé/domaines) alimente `buildContextBlock()`, qui ajoute
  « Robot prêt à X % » + « CE QU’IL RESTE À AMÉLIORER ». La consigne n°10 lui dit
  de ne donner **que deux points à la fois** et de proposer d'agir avec ses outils.
- **Tableau de bord** : carte « 🎯 Développez votre robot » dans « Résumé »
  (score, barre de progression, 4 étapes avec bouton « Ouvrir » sur le bon écran,
  et « Demander à « Mon IA » de s’en occuper »). Ouvrir le simulateur marque
  l'étape « testé » (localStorage).
- Les questions en attente sont chargées dès qu'un assistant est actif
  (`/api/learning`), donc le score est juste sans ouvrir l'onglet « Apprentissage ».

Tests : `tests/bot-coach.test.ts` (7) + carte du coach dans `dashboard-smoke`.

## 11. Récap lisible, nature réelle de la demande, et message envoyé au client à la confirmation (5 octobre 2026)

Trois correctifs suite à un cas réel (carte « Commande » avec « Abdelmalek \nClient :
Eh je veux parler au telephone … ») :

1. **Récap illisible (`\nClient :`)** : le brouillon de demande était construit avec
   `draftMessages.join('\\n')` (séparateur *littéral* `\n`), que `buildDealRecap`
   (qui coupe sur de vrais retours ligne) ne savait pas relire. → `join('\n')` dans
   `functions/api/chat.js` et `functions/api/webhook/instagram.ts`.
2. **« Commande » alors que le client veut juste parler** : la nature venait du
   libellé de confirmation du bot, qui disait « commande » par défaut. Nouveau
   `refineDealKind(kind, texteClient)` : si la nature est « order » mais que le
   client parle de téléphone/appel **sans aucun mot d'achat**, elle est reclasse
   en « rendez-vous ». Branché sur le brouillon ET la confirmation, côté web et
   Instagram.
3. **Confirmer prévient le client** : `POST /api/leads` (orderId+orderStatus)
   envoie désormais un DM Instagram `dealConfirmationMessage(kind, nom)` quand le
   statut passe à `confirmed` (et journalise le message). La bulle du site n'a pas
   de canal sortant → `clientNotified: false` dans ce cas.

Tests : `tests/sales-intent.test.ts` (+3) et `tests/leads-api.test.ts` (+2 : envoi
Instagram + cas site sans envoi). 581 tests / 37 fichiers, tsc 0.

## 12. Garde-fous anti « commandes » parasites + honnêteté produits (5 octobre 2026)

Suite à des cartes aberrantes (« Salam · Salam · Tu me connais » en *Commande*, un
appel devenu *Commande*, et le bot qui invente une marque de streetwear pour une
agence de marketing) :

1. **`hasDealSignal()`** (sales-intent.ts) : une demande n'est finalisée que si le
   fil porte une vraie intention (achat, visite, rdv, réservation, appel, date…).
   Branché comme condition de création dans `chat.js` et `webhook/instagram.ts` :
   une conversation de salutations ne crée **plus jamais** de commande.
2. **`hasDateSignal()` + `refineDealKind()`** : « le 07 octobre », « demain »,
   « 14h » sans mot d'achat → nature **Rendez-vous**, plus « Commande ».
3. **Honnêteté produits** (prompt.ts) : consigne stricte de ne jamais citer une
   marque / produit / prix absent de la base de connaissances ; si la base est
   vide, présenter l'activité générale sans inventer de catalogue.

Tests : `sales-intent` (+ garde-fou signal/date/nature) et `chat-orders-api`
(+ « un oui dans des salutations ne crée aucune commande »). 586 tests / 37 fichiers.

## 13. Suppression avec confirmation (client, commande / visite / RDV) — 5 octobre 2026

Le marchand peut nettoyer son suivi :
- **`POST /api/leads`** accepte `action: 'delete_prospect'` (supprime la fiche et
  tout l'historique) et `action: 'delete_order'` + `orderId` (supprime UNE demande
  sans toucher au client ni aux autres). Autorisation propriétaire vérifiée comme
  pour le reste ; validations strictes (400 si paramètres incohérents).
- `delete_order` réécrit la fiche complète : `supabaseUpsertProspect` FUSIONNE les
  commandes (union par id) et ne pourrait donc pas en retirer une.
- **Tableau de bord** : icône corbeille sur chaque carte de demande (« Commandes &
  RDV ») et colonne « Actions » sur la liste des clients, chacune derrière une
  `window.confirm` (« Le client ne sera pas prévenu », « action irréversible »).

Tests : `tests/leads-api.test.ts` (+3 : suppression client, suppression d'une seule
demande, validation des paramètres). 589 tests / 37 fichiers, tsc 0.
