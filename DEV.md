# Développer le bot JawebFlow — guide pratique

> Objectif : savoir **où** toucher, **comment** vérifier, **comment** déployer.
> État vérifié le 5 octobre 2026 : `npm test` → **36 fichiers / 568 tests OK**,
> `npm run lint` (tsc) → 0 erreur.

---

## 0. Avant de coder : 80 % des changements se font SANS code

Depuis le tableau de bord, un commerçant règle déjà :

| Réglage | Effet sur le bot |
|---|---|
| **Connaissance** (notes) | Ce que le bot sait (produits, prix, conditions) |
| **Règles du commerçant** (`specialRulesText` / `customInstructions`) | Priorité maximale dans le prompt |
| **Ton** (`assistantTone`) | Style de réponse |
| **Longueur** (`behavior.length`) | Réponse courte ou détaillée |
| **Mention du site** (`behavior.websiteMentions`) | Quand citer le lien officiel |
| **Contact de rappel humain** (`whatsappEscalation`) | À qui renvoyer le client |

Si la demande est « il doit dire X » ou « il ne doit jamais dire Y » → **règle du
commerçant**, pas de code.

---

## 1. La carte du cerveau du bot

| Fichier | Rôle | On y va pour… |
|---|---|---|
| `functions/_shared/prompt.ts` | `buildSalesSystemPrompt()` : identité, **PÉRIMÈTRE**, secteur, infos officielles, pack métier, règles du commerçant | Changer **comment il parle** et ce dont il a le droit de parler |
| `functions/_shared/sales-intent.ts` | `dealKindOf()` (visite / RDV / devis / commande), `extractClientName()`, `buildDealRecap()` | Améliorer la **détection** d'une intention |
| `functions/_shared/relances.ts` | `buildRelances()` (+1 h / +24 h), `dueRelances()`, `relanceText()` | Délais et textes de relance |
| `functions/_shared/order-changes.ts` | Annulations / modifications selon la nature | Le vocabulaire des annulations |
| `functions/_shared/lead-facts.ts` | Infos client (nom, téléphone…) | Ce qu'on extrait d'un client |
| `functions/_shared/learning.ts` | Détecte une réponse « je ne sais pas » → journalise dans `learning_questions` (onglet **Apprentissage IA**) | Les trous de connaissance |
| `functions/_shared/supabase.ts` | Tout l'accès aux données (prospects, assistants, connaissances) | Une requête/écriture |
| `functions/_shared/widget-access.ts`, `rate-limit.ts` | Clé widget, domaines autorisés, débit | L'isolation |
| `functions/_shared/ig-api.ts`, `ig-automations.ts` | Envoi Instagram, automatisations | Le canal Instagram |
| `functions/api/chat.js` (≈780 lignes) | **L'orchestrateur web** : accès → quotas → contexte → appel Gemini → écriture du lead | Brancher une nouvelle règle |
| `functions/api/webhook/instagram.ts` | L'orchestrateur Instagram | Idem, côté IG |
| `functions/api/leads.js` | API des clients pour le tableau de bord (paginée) | Un champ côté dashboard |
| `functions/api/cron/relances.js` | Le cron des relances (`?token=CRON_SECRET`) | Planification |
| `src/components/DashboardPlatform.tsx` | Ce que le commerçant voit et règle | L'interface |

**Règle d'or :** le modèle Gemini **n'a aucun outil d'action** (pas de
function calling). Il ne peut donc rien écrire : toutes les écritures
(nom, commande, statut, handoff) sont faites par le **code**, sur des champs
précis. Si vous voulez une nouvelle action, elle passe par le code.

---

## 2. Le cycle de travail

```bash
npm test          # 568 tests, 36 fichiers — doit rester à 0 échec
npm run lint      # = tsc --noEmit — 0 erreur
npm run dev       # serveur local (server.ts) avec un .env → site + widget réels
npm run deploy:cloudflare   # build vite + wrangler pages deploy dist
```

- **Les tests tournent sans aucune clé réelle** : `tests/helpers/fakes.ts`
  installe un faux Supabase (`FakeSupabase.seed/rows`, pagination + `Content-Range`)
  et une fausse API Meta (`FakeMeta.sent('messages')`). C'est le filet de sécurité.
- **Un changement de comportement = une fonction pure + un test.** C'est comme ça
  que les 568 tests sont construits ; ne mettez jamais la logique directement dans
  le handler HTTP.
- `npm run deploy:cloudflare` déploie le site ; les `functions/` sont servies
  automatiquement par Cloudflare Pages (pas de `wrangler.toml`, pas de CI).

---

## 3. Variables d'environnement

Dans `.env.example` : `GEMINI_API_KEY`, `GEMINI_MODEL`, `AGENTROUTER_*`,
`APP_URL`, `STRIPE_*`, `SLICKPAY_*`, `INSTAGRAM_*`, `META_VERIFY_TOKEN`,
`META_PAGE_ACCESS_TOKEN`.

Lues par le code mais **absentes de `.env.example`** (à ajouter dans Cloudflare
Pages → Settings → Environment variables) :
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`,
`CRON_SECRET`, `EMAIL_SENDER`.

Après déploiement : **`GET /api/health`** dit en une requête ce qui est réellement
configuré. Les valeurs qui ressemblent encore à un placeholder
(`MY_GEMINI_API_KEY`, `your_key`, `change_me`) sont traitées comme **absentes**.

Cron des relances : mettre `CRON_SECRET` et planifier
`GET /api/cron/relances?token=<CRON_SECRET>` toutes les ~10 min.

---

## 4. Les deux pièges connus (documentés dans `AUDIT.md` §1 et §6)

1. **Il y a DEUX moteurs** : `server.ts` (Express) et `functions/` (Cloudflare).
   Toute règle métier ajoutée dans l'un doit être **reportée dans l'autre**, sinon
   le bot se comporte différemment selon l'environnement. Idéalement : mettre la
   règle dans `functions/_shared/` et l'importer des deux.
2. **Il y a DEUX webhooks Instagram** (`/api/webhook/instagram` et
   `/api/instagram/webhook`). Meta ne peut pointer que vers une URL → n'en
   gardez qu'un.

Autres leçons déjà payées :
- **Normaliser l'arabe/darija avant de comparer** (sinon « commande » passe à côté).
- Ne **jamais** comparer des listes de mots exacts : préférer des motifs.
- `supabaseUpsertProspect` **remplace** un tableau (`orders`, `relances`) par clé →
  toujours renvoyer le tableau complet, pas un élément.
- Tailwind : écrire les classes **en littéral** (pas de concatenation dynamique).
- Dans les tests React, un label dupliqué → `getAllByText`, pas `getByText`.
- Un `setState` avec un **nouvel objet** à chaque rendu crée une boucle infinie :
  rendre les mises à jour idempotentes (comparer avant de setter).

---

## 5. Recette : ajouter une capacité au bot

Exemple « le bot propose un créneau de visite » :

1. **Règle métier** dans `functions/_shared/…` : une fonction pure, testable,
   sans `fetch` ni `env`.
2. **Test unitaire** dans `tests/…` : cas nominal + cas limites (darija, arabe,
   réponse ambiguë, client qui change d'avis).
3. **Brancher** dans `functions/api/chat.js` **et** `functions/api/webhook/instagram.ts`.
4. Si c'est optionnel : ajouter le réglage dans `AssistantConfig`
   (`src/lib/supabase.ts`), l'UI dans `DashboardPlatform.tsx`, et le lire dans le
   prompt/comportement.
5. Mettre à jour `AUDIT.md` (ce qui a changé, comment l'activer, ce qui reste).
6. `npm test && npm run lint` → commit → push.

---

## 6. Ce qui reste à faire (ordre de priorité, `AUDIT.md` §6)

1. Changer les mots de passe Super Admin exposés.
2. `FIREBASE_SERVICE_ACCOUNT` + règles Firestore déployées.
3. Rate limiting **Cloudflare (WAF)** sur `/api/chat`, `/api/scan`, `/api/crawler/analyze`
   (la limite en mémoire est par isolate, donc contournable).
4. **Choisir un seul backend** (piège n°1).
5. **Sécuriser la facturation** (signatures Stripe/SlickPay, `paid` seulement après
   confirmation) — *reporté à la demande du client ; c'est le point le plus risqué
   qui reste avant d'encaisser.*
6. Fusionner les deux webhooks Instagram.
