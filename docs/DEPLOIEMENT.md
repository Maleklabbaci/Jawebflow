# Mettre le site en ligne automatiquement

> Aujourd'hui, la mise en ligne se fait à la main : `npm run deploy:cloudflare` depuis ta machine.
> Ce guide explique comment la rendre **automatique**, pour ne plus jamais avoir à y penser.

---

## D'abord : « pousser » ou « déployer » ?

Ce sont deux choses différentes, et c'est là que tout se joue :

| | Ce que ça fait | État actuel |
|---|---|---|
| **Pousser** (git push) | envoie le code sur GitHub | **déjà automatique** : chaque intervention sur la branche est committée et poussée |
| **Déployer** | transforme ce code en site en ligne | **manuel** : `npm run deploy:cloudflare` |

Pousser ne met rien en ligne : GitHub n'est qu'un entrepôt de code. C'est le déploiement qui
publie. Les deux solutions ci-dessous rendent donc le **déploiement** automatique, à la suite du push.

---

## Solution 1 — Sans rien installer (la plus simple)

Cloudflare peut surveiller le dépôt GitHub et reconstruire le site tout seul à chaque push.

1. Cloudflare → **Workers & Pages** → projet **jawebflow** → **Settings** → **Builds & deployments**.
2. **Connect to Git** → autoriser GitHub → choisir **Maleklabbaci/Jawebflow**.
3. Renseigner les réglages de build :
   - **Production branch** : `main`
   - **Build command** : `npm run build:pages`
   - **Build output directory** : `dist`
   - **Node version** : lue depuis `.node-version` (déjà à 20) — rien à faire.
4. **Save**. C'est fini.

À partir de là :

- un push sur **`main`** → le site public est reconstruit et publié automatiquement ;
- un push sur **n'importe quelle autre branche** (dont la branche de travail) → Cloudflare
  construit un **aperçu** avec sa propre adresse (`<branche>.jawebflow.pages.dev`), **sans toucher
  au site public**. Tu peux donc voir le résultat d'un changement avant de le mettre en ligne.

⚠️ **À savoir** : avec cette solution, c'est Cloudflare qui construit. Les variables
d'environnement (jetons Gemini, Supabase, canaux…) doivent donc être renseignées dans
**Cloudflare → Settings → Environment variables** — c'est déjà le cas aujourd'hui, il n'y a rien
à refaire.

⚠️ **Ne pas cumuler avec la solution 2** : tu aurais deux déploiements pour le même push (inutile,
mais sans danger).

---

## Solution 2 — Tout depuis GitHub (déjà prêt dans le dépôt)

Le fichier **`.github/workflows/deploy.yml`** est déjà écrit. Il lui manque seulement deux secrets.

1. Créer un jeton Cloudflare : **My Profile → API Tokens → Create Token** → modèle
   **« Cloudflare Pages — Edit »** → copier la valeur.
2. Récupérer l'**identifiant de compte** : Cloudflare → **Workers & Pages** → colonne de droite
   **Account ID**.
3. GitHub → dépôt → **Settings → Secrets and variables → Actions → New repository secret** :
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (indispensables : le workflow construit le site
     lui-même, donc Cloudflare ne peut pas les fournir — voir « Dépannage » plus bas)

Ensuite, à chaque push :

| Branche | Résultat |
|---|---|
| `main` | déploiement de **production** |
| `arena/**`, autres | déploiement d'**aperçu** (adresse dédiée, site public intact) |

L'avantage de cette solution : **le code est vérifié avant d'être publié**. Le workflow lance
`npm run lint` (types) puis `npm test` (691 tests), et **ne déploie que si tout passe**. Un test
rouge bloque la mise en ligne au lieu de casser le site.

**Tant que les secrets ne sont pas ajoutés, le workflow s'ignore proprement** (un message bleu, pas
un échec rouge) : rien à nettoyer si tu choisis la solution 1.

---

## Quelle solution choisir ?

| | Solution 1 (Cloudflare) | Solution 2 (GitHub Actions) |
|---|---|---|
| Mise en place | 4 clics, aucun secret | 2 secrets à créer |
| Tests avant publication | non | **oui** (types + 691 tests) |
| Aperçu par branche | oui | oui |
| Où voir les journaux | Cloudflare | GitHub → onglet Actions |

- Tu veux **le plus simple** → solution 1.
- Tu veux **ne jamais publier du code cassé** → solution 2.

---

## Dépannage : « supabaseUrl is required » / page blanche

**C'est LE piège à connaître**, et il n'a rien à voir avec Cloudflare :

> Les variables `VITE_*` sont **injectées dans le JavaScript au moment de la construction**
> (`npm run build`). Elles n'existent pas à l'exécution. Les définir dans Cloudflare ne sert donc à
> rien **si la construction n'a pas lieu chez Cloudflare** (machine locale, GitHub Actions…).

Le site se construit alors avec des valeurs vides, se déploie sans broncher, et affiche une page
blanche devant tes clients. Un garde-fou empêche désormais ce scénario : la construction est refusée
et la marche à suivre s'affiche (voir plus bas).

### Reconnaître le cas

| Symptôme | Ce que ça veut dire |
|---|---|
| Page blanche + `supabaseUrl is required` dans la console | le bundle a été construit sans `VITE_SUPABASE_URL` |
| Écran sombre « le site n'est pas encore configuré » | idem, mais l'explication est à l'écran (garde-fou côté site) |
| `CONSTRUCTION ARRÊTÉE : configuration manquante` | le garde-fou a bloqué le déploiement : c'est le bon comportement |

### Vérifier ce que le serveur voit

`https://jawebflow.pages.dev/api/health` renvoie, en booléens, l'état des intégrations côté serveur
(`supabase`, `gemini`, `metaWebhookVerify`, paiements…). ⚠️ Cette route teste les variables **côté
serveur** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) : elle peut donc dire « tout va bien » alors
que le site (navigateur) manque de `VITE_SUPABASE_URL`. Les deux jeux de variables sont distincts :

| Où | Nom | Rôle |
|---|---|---|
| Site (navigateur) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | injectées à la construction |
| Serveur (Functions) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | lues à l'exécution |

### Les trois corrections possibles

1. **Laisser Cloudflare construire** (recommandé, cf. solution 1 ci-dessus) : les variables déjà
   présentes dans Cloudflare sont alors utilisées au moment de la construction.
2. **Construire sur ta machine** : crée un fichier `.env` (copie de `.env.example`) avec les deux
   valeurs `VITE_*` — elles se trouvent dans Supabase → *Project Settings* → *API*.
3. **Construire via GitHub Actions** (solution 2) : ajoute `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` comme secrets **ou** variables du dépôt ; le workflow les transmet à la
   construction. (Ce sont des valeurs publiques : elles finissent dans le JavaScript du site — d'où
   l'innocuité de les mettre en « Variables » plutôt qu'en « Secrets ».)

### Le garde-fou

`scripts/check-env.mjs`, exécuté automatiquement avant `npm run build:pages`, refuse la construction
si les deux variables manquent, en expliquant quoi faire. Pour construire malgré tout (site
volontairement sans base) :

```bash
SKIP_ENV_CHECK=1 npm run build:pages            # macOS / Linux
set SKIP_ENV_CHECK=1 && npm run build:pages     # Windows
```

⚠️ **Ordre important** : une variable ajoutée dans Cloudflare ne s'applique qu'à la **construction
suivante**. Après l'ajout, relance un déploiement (ou pousse un commit) — sinon l'ancien bundle,
construit sans elle, reste en ligne.

### À ne jamais faire

Ne préfixe **jamais** `SUPABASE_SERVICE_ROLE_KEY` par `VITE_`. Tout ce qui commence par `VITE_` finit
dans le JavaScript public : la clé service donnerait un accès **total** à la base, à n'importe qui.
Seule la clé `anon` (protégée par les règles RLS) peut être exposée.

---

## Rappel : ce qui reste manuel à ce jour

Rien de ce qui précède ne publie la moindre **donnée** : ce sont des déploiements de code. Les
tâches restantes se font une fois pour toutes :

1. Exécuter `supabase/migration_channels.sql` (une fois) — sinon l'onglet Messageries affiche
   « migration à exécuter ».
2. Renseigner les variables d'environnement des canaux dans Cloudflare
   (voir `docs/INSTALLATION_CANAUX.md`).
3. Brancher les canaux depuis le tableau de bord (menu **Canaux**).
