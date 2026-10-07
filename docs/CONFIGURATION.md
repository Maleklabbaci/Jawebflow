# Tout ce qu'il faut régler (la liste complète)

> **La question à laquelle ce document répond : « je règle quoi pour que tout marche ? »**
>
> Vérifie à tout moment ton état réel sur **https://jawebflow.pages.dev/api/health** : cette page
> liste, en français, ce qui manque et où le trouver. Rien n'y révèle une clé.

---

## En un coup d'œil

| # | À faire | Où | Sans ça |
|---|---|---|---|
| 1 | Exécuter les migrations SQL | Supabase → SQL Editor | Rien n'est enregistré (clients, conversations, automatisations, canaux) |
| 2 | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Cloudflare **+** au moment de la construction | **Page blanche** |
| 3 | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare → Environment variables | Le serveur ne lit aucune donnée |
| 4 | `GEMINI_API_KEY` | Cloudflare | L'assistant ne répond pas |
| 5 | Un canal au moins (Telegram pour commencer) | Cloudflare + tableau de bord | Aucun message ne part |
| 6 | `META_VERIFY_TOKEN` | Cloudflare + Meta | Meta refuse de vérifier le webhook |
| 7 | `SLICKPAY_API_KEY` *(si tu encaisses en ligne)* | Cloudflare | Paiements en mode manuel |

Le reste est **facultatif** : e-mails, relances automatiques, compteur de facturation WhatsApp.

---

## Étape 1 — La base de données (5 minutes, une seule fois)

Supabase → **SQL Editor** → coller et exécuter, dans cet ordre :

| Fichier | Ce qu'il crée | Obligatoire ? |
|---|---|---|
| `supabase/schema.sql` | assistants, conversations, clients, commandes | ✅ oui |
| `supabase/schema_auth_migration.sql` | comptes marchands, connexion Instagram | ✅ oui |
| `supabase/migration_ai_usage.sql` | compteur de conversations par mois | ✅ oui |
| `supabase/migration_knowledge_entries.sql` | base de connaissances normalisée | ✅ oui |
| `supabase/migration_bot_mutes.sql` | le « stop » du visiteur | ✅ oui |
| `supabase/migration_instagram_threads.sql` | historique des conversations Instagram | ✅ oui |
| `supabase/migration_ig_automations.sql` | automatisations (commentaire → message privé) | ✅ oui |
| `supabase/migration_learning.sql` | « questions sans réponse » | ✅ oui |
| `supabase/migration_admin_console.sql` | console admin | ✅ oui |
| `supabase/migration_admin_security.sql` | sécurisation de la console | ✅ oui |
| `supabase/migration_admin_repair.sql` | réparations | ✅ oui |
| **`supabase/migration_channels.sql`** | **canaux (Messenger, WhatsApp, TikTok, Telegram) + compteur de facturation** | ✅ oui |

Toutes sont sans danger à rejouer (`if not exists`). Le tableau de bord dit lui-même quand une table
manque, au lieu de planter : l'onglet **Canaux** affiche alors « migration à exécuter ».

---

## Étape 2 — Les deux variables du SITE (la cause des pages blanches)

⚠️ **Le piège n°1 du projet.** `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont
**injectées dans le JavaScript au moment de la construction**. Les définir dans Cloudflare ne suffit
donc **que si c'est Cloudflare qui construit le site**.

| | Nom | Où le trouver |
|---|---|---|
| Site (navigateur) | `VITE_SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* |
| Site (navigateur) | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → clé *anon* / *publishable* |

Ces deux valeurs sont **publiques** (elles finissent dans le JavaScript du site) : c'est normal, la
clé *anon* est faite pour ça — la sécurité est assurée par les règles RLS de la base.

> 🚫 **Ne préfixe JAMAIS `SUPABASE_SERVICE_ROLE_KEY` par `VITE_`.** Elle se retrouverait dans le
> JavaScript public et donnerait un accès **total** à la base à n'importe qui.

Détail du dépannage : `docs/DEPLOIEMENT.md` § « supabaseUrl is required / page blanche ».

---

## Étape 3 — Les variables du SERVEUR (Cloudflare → Settings → Environment variables)

Celles-ci sont lues **à l'exécution** par les Functions : les modifier prend effet **sans
reconstruire** le site (juste après un redéploiement des Functions).

### Obligatoires

| Variable | Où la trouver | Sans elle |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API | ❌ le serveur ne lit rien |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → clé *service_role* (⚠️ secrète) | ❌ idem |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | ❌ l'assistant ne répond pas |

Facultatif mais recommandé : `GEMINI_MODEL` (défaut : `gemini-3.1-flash-lite`).

### Canaux — un canal sans ses variables reste muet

Chaque webhook **échoue fermé** : sans secret configuré, il refuse tout message. C'est volontaire —
sinon n'importe qui pourrait faire dépenser ton IA.

| Canal | Variables | Coût | Prérequis à obtenir |
|---|---|---|---|
| **Telegram** ✅ *testable aujourd'hui* | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | gratuit | aucun (@BotFather) |
| **Messenger** *(priorité n°1 en Algérie)* | `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET` | gratuit | App Review + vérification d'entreprise Meta |
| **WhatsApp** | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` | **payant** (0,0046 $/réponse après 1 000 gratuites) | Tech Provider + Embedded Signup v4 |
| **TikTok** | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_BUSINESS_ID`, `TIKTOK_APP_SECRET` | gratuit | accès Business Messaging (à demander) |
| **Instagram** *(historique)* | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN` | gratuit | Meta |

- `MESSENGER_APP_SECRET` et `WHATSAPP_APP_SECRET` sont **facultatifs si `INSTAGRAM_APP_SECRET` est
  déjà rempli** : Meta peut utiliser un seul App Secret pour tous ses produits.
- `META_VERIFY_TOKEN` (ou `INSTAGRAM_VERIFY_TOKEN`) : une chaîne **que tu choisis**, identique dans
  Cloudflare et dans Meta. Sans elle, Meta reçoit un 503 et refuse de valider ton webhook.

Instructions détaillées, canal par canal : **`docs/INSTALLATION_CANAUX.md`**.

### Paiement (si tu encaisses en ligne)

| Variable | Où la trouver | Sans elle |
|---|---|---|
| `SLICKPAY_API_KEY` | slick-pay.com → tableau de bord → clé API | paiements en mode manuel |
| `SLICKPAY_BASE_URL` *(facultatif)* | défaut déjà correct dans le code | — |
| `SLICKPAY_ACCOUNT_ID` *(facultatif)* | sous-compte marchand dédié | — |

⚠️ **Corrigé** : le fichier d'exemple annonçait `SLICKPAY_PUBLIC_KEY` / `SLICKPAY_SECRET_KEY`, alors
que le code lit `SLICKPAY_API_KEY`. Avec les anciens noms, les paiements restaient en mode manuel
**sans le moindre message d'erreur**. Utilise bien `SLICKPAY_API_KEY`.

**Stripe n'est pas implémenté** côté Cloudflare Pages (aucun code de paiement ne l'appelle — il
n'apparaît que dans l'ancien serveur Express). Inutile de le configurer.

### Facultatif (confort)

| Variable | À quoi ça sert | Sans elle |
|---|---|---|
| `BREVO_API_KEY`, `EMAIL_SENDER`, `EMAIL_SENDER_NAME` | e-mails (relances, notifications) | les e-mails ne partent pas |
| `CRON_SECRET` | protège `/api/cron/relances` | relances automatiques désactivées |
| `APP_URL` | liens dans les e-mails, retours de paiement | liens générés au mieux |
| `FIREBASE_SERVICE_ACCOUNT`, `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` | bases de connaissances historiques | dégradé (les données sont dans Supabase) |
| `AGENTROUTER_API_KEY`, `AGENTROUTER_BASE_URL`, `AGENTROUTER_MODEL` | second fournisseur d'IA de secours | sans effet : **utilisé uniquement par l'ancien serveur Express**, jamais par Cloudflare Pages |
| `ALLOWED_HOSTS`, `PORT` | serveur local uniquement | sans effet sur Cloudflare |

---

## Étape 4 — Vérifier ce qui marche

**La route qui répond à ta question :**

```
https://jawebflow.pages.dev/api/health
```

Elle renvoie, par exemple :

```json
{
  "integrations": {
    "gemini": true,
    "supabase": true,
    "siteFallback": true,
    "channels": { "messenger": false, "whatsapp": false, "telegram": true, "tiktok": false }
  },
  "toFix": [
    {
      "quoi": "Messenger : les messages ne partent pas.",
      "variables": ["MESSENGER_PAGE_ACCESS_TOKEN", "MESSENGER_APP_SECRET ou INSTAGRAM_APP_SECRET"],
      "ou": "Meta → jeton de page + App Secret"
    }
  ]
}
```

- `toFix` **vide** = tout est en place.
- Elle n'expose **jamais** une valeur : uniquement des booléens et des **noms** de variables.
- Les valeurs d'exemple de `.env.example` (`MY_GEMINI_API_KEY`, `your_key`…) sont traitées comme
  absentes — impossible de croire à tort que c'est configuré.

⚠️ **`siteFallback`** mérite une explication : c'est le repli que lit le **navigateur**. S'il est
faux, le site ne peut joindre aucune base → **page blanche**. C'est le premier point de `toFix`.

---

## Ordre recommandé (le plus vite utile)

1. **Étape 1** (SQL) — 5 minutes, débloque tout le reste.
2. **Étape 2** (les deux `VITE_*`) — sans elles, page blanche.
3. **Étape 3** : `SUPABASE_*` + `GEMINI_API_KEY` → l'assistant répond sur ton site.
4. **Telegram** (2 minutes, gratuit, aucune validation) → tu vois un vrai canal marcher de bout en bout.
5. **SlickPay** → tu encaisses. **Messenger / WhatsApp** → quand Meta a validé l'application.
6. Le reste (e-mails, relances) quand tu en as besoin.

---

## Les pièges rencontrés (et corrigés)

Ces trois-là ont coûté du temps parce qu'ils sont **silencieux** — le code ou la doc disaient
quelque chose que l'autre n'écoutait pas :

| Piège | Ce qui se passait | Corrigé |
|---|---|---|
| `VITE_*` non définies à la construction | site déployé, **page blanche** | garde-fou à la construction + écran explicatif (`docs/DEPLOIEMENT.md`) |
| `SLICKPAY_PUBLIC_KEY` / `SLICKPAY_SECRET_KEY` | noms jamais lus par le code → paiements en mode manuel, sans erreur | noms corrigés dans `.env.example` **et** dans `/api/health` |
| `/api/health` testait les mauvais noms SlickPay | annonçait « non configuré » même une fois tout en place | corrigé + tests de non-régression |
