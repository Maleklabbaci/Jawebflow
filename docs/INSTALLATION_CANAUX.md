# Brancher les canaux (Messenger, WhatsApp, TikTok, Telegram)

> Guide d'installation, côté propriétaire (toi). Le commerçant, lui, n'aura qu'à cliquer sur « Connecter » quand l'interface sera branchée.
>
> Décisions commerciales : `docs/DECISION_WHATSAPP_PLANS.md` (WhatsApp dans Pro/Enterprise)
> et `docs/QUELS_CANAUX.md` (quels canaux valent le coup en Algérie).

---

## 1. Ce qui a été construit (et pourquoi de cette façon)

Avant : **un** webhook Instagram de 1 506 lignes. Quatre canaux de plus = cinq copies à maintenir, cinq endroits où oublier un correctif.

Maintenant : **un seul cerveau**, quatre branchements.

```
functions/_shared/channels/
├── types.ts        le contrat : InboundMessage, StatusEvent, ChannelAdapter
├── registry.ts     la liste des canaux connus
├── signature.ts    vérification des signatures (échec FERMÉ)
├── metering.ts     quotas WhatsApp + le compteur de facturation
├── pipeline.ts     ⭐ LE CERVEAU : quotas, connaissances, IA, journalisation
├── messenger.ts    ├─ adaptateur Messenger (page Facebook)
├── whatsapp.ts     ├─ adaptateur WhatsApp (Cloud API)
├── telegram.ts     ├─ adaptateur Telegram (Bot API)
└── tiktok.ts       └─ adaptateur TikTok (Business Messaging)

functions/api/webhook/
├── messenger.ts    GET challenge + POST  → « vérifier → router »
├── whatsapp.ts     GET challenge + POST  → « vérifier → router »
├── telegram.ts     POST (clé dans l'URL) → « vérifier → router »
└── tiktok.ts       POST (clé dans l'URL) → « vérifier → router »
```

Chaque webhook fait trois choses, jamais quatre : **vérifier** la signature, **analyser** la charge utile, **router** vers le pipeline. Toute la mécanique (quota du plan, plafond de coût, base de connaissances, mémoire de la conversation, réponse IA, journalisation + facturation) vit dans `pipeline.ts` — donc elle est **identique** sur les quatre canaux, et testée une seule fois.

Ajouter un 5ᵉ canal coûte désormais **un fichier adaptateur + une ligne** dans `registry.ts`.

### Le chemin d'un message

1. L'intégration est retrouvée (`channel_integrations`, clé = canal + identifiant du compte).
2. L'assistant et ses quotas sont chargés.
3. **Anti-renvoi** : la plateforme réémet ses webhooks ; un message déjà traité ne repart pas (ni double réponse au client, ni double dépense).
4. « stop » / « توقف » met le bot en silence pour ce contact ; « reprends » / « كمل » le rallume.
5. Quota de conversations du plan + plafond de coût réel (comme le web).
6. **Quota WhatsApp** (le seul canal payant) : forfait du plan + recharges prépayées.
7. Base de connaissances → mémoire de la conversation → Gemini → envoi (découpé si la plateforme a une limite de longueur).
8. Journalisation : quota de conversations **et** compteur de facturation.

---

## 2. Installation en 3 étapes

### Étape 1 — la base de données (5 minutes)

Coller `supabase/migration_channels.sql` dans **Supabase → SQL Editor → Run**.

Elle crée trois tables :

| Table | À quoi elle sert |
|---|---|
| `channel_integrations` | quel assistant répond sur quel compte de quel canal |
| `channel_messages` | **le compteur de facturation** (une ligne par message entrant/sortant) |
| `channel_credits` | les recharges prépayées achetées par le client |

…plus la vue `channel_monthly_usage` (la jauge « X / 1 000 » du tableau de bord) et les règles de lecture (chaque marchand ne voit que ses lignes).

### Étape 2 — les variables d'environnement

Cloudflare Pages → **Settings → Environment variables**. Sans ces valeurs, le canal concerné répond « absence de secret » et **n'accepte aucun webhook** (échec fermé : personne ne peut faire dépenser l'IA d'un client).

| Variable | Canal | Où la trouver |
|---|---|---|
| `MESSENGER_PAGE_ACCESS_TOKEN` | Messenger | Facebook Developers → l'app → Page connectée → jeton de page |
| `MESSENGER_APP_SECRET` | Messenger | Facebook Developers → Settings → Basic → App Secret |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | WhatsApp Business → jeton permanent du système utilisateur |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | identifiant du numéro (pas le numéro lui-même !) |
| `WHATSAPP_APP_SECRET` | WhatsApp | App Secret de l'app qui porte le produit WhatsApp |
| `TELEGRAM_BOT_TOKEN` | Telegram | @BotFather → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram | une chaîne aléatoire que **tu** choisis (52 caractères max) |
| `TIKTOK_ACCESS_TOKEN` | TikTok | TikTok for Business → Business Messaging (accès à obtenir) |
| `TIKTOK_BUSINESS_ID` | TikTok | identifiant du compte Business |
| `TIKTOK_APP_SECRET` | TikTok | App Secret de l'app TikTok |
| `META_VERIFY_TOKEN` (ou `INSTAGRAM_VERIFY_TOKEN`) | Messenger + WhatsApp | déjà en place pour Instagram — le même suffit |

> Un `INSTAGRAM_APP_SECRET` déjà configuré est accepté en repli pour Messenger et WhatsApp : Meta peut utiliser un seul App Secret.

### Étape 3 — brancher chaque canal

#### Facebook Messenger — *priorité n°1 en Algérie (29,3 M d'utilisateurs)*

1. Facebook Developers → l'app → **Add Product → Messenger**.
2. **Webhooks → Callback URL** : `https://jawebflow.pages.dev/api/webhook/messenger`
   Verify Token : la valeur de `META_VERIFY_TOKEN`.
3. S'abonner aux champs **`messages`** et **`messaging_postbacks`**.
4. Permission `pages_messaging` (+ `pages_manage_engagement` pour répondre aux commentaires) → **App Review + vérification d'entreprise** (gratuit, quelques jours).
5. Insérer la ligne de connexion :

```sql
insert into public.channel_integrations (user_id, assistant_id, channel, account_id, display_name)
values ('<user_id>', '<assistant_id>', 'messenger', '<ID_DE_LA_PAGE>', 'Ma page');
```

**Coût : 0 DA au message.** Meta ne facture rien sur Messenger.

#### WhatsApp Business (Cloud API) — *le seul canal payant*

1. Passer **Tech Provider**, faire vérifier l'entreprise, puis l'App Review de `whatsapp_business_messaging` + `whatsapp_business_management`.
2. **Embedded Signup v4** (les v2/v3 sont dépréciés depuis le 15/10/2026).
3. **Webhooks → Callback URL** : `https://jawebflow.pages.dev/api/webhook/whatsapp` (le même Verify Token).
4. S'abonner au champ **`messages`** — c'est **obligatoire** : sans lui, aucune facturation n'est connue, donc rien à refacturer.
5. `insert into channel_integrations (…) values (…, 'whatsapp', '<PHONE_NUMBER_ID>', '+213 …')`.

**Coût : 0,0046 $ par réponse** (marché « Rest of Africa », dont l'Algérie) **après 1 000 gratuites par mois et par numéro** ; **6,99 DA par message marketing**, sans franchise. D'où le forfait inclus : **Pro 1 000**, **Enterprise 5 000**, puis recharge — voir `docs/COUTS_WHATSAPP.md`.

⚠️ **Fenêtre de 24 h** : hors fenêtre, Meta refuse un message libre (erreur 131047). Le code l'explique en clair au lieu d'échouer en silence.

#### Telegram — *banc d'essai, gratuit, sans revue*

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://jawebflow.pages.dev/api/webhook/telegram?key=<CLE_ALEATOIRE>" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

```sql
insert into public.channel_integrations (user_id, assistant_id, channel, account_id, access_token)
values ('<user_id>', '<assistant_id>', 'telegram', '<CLE_ALEATOIRE>', '<TELEGRAM_BOT_TOKEN>');
```

Telegram n'envoie aucun identifiant de compte dans ses « updates » : le routage passe par la **clé** dans l'URL. (Cette astuce est aussi celle de TikTok.)

> Positionnement : Telegram n'apparaît dans **aucun** classement d'usage en Algérie — il est là comme banc d'essai, pas comme argument commercial (`docs/QUELS_CANAUX.md`).

#### TikTok — *gratuit, mais éligibilité à confirmer*

1. Compte **Business** TikTok + candidature à la **Business Messaging API** + revue de sécurité des données.
2. Callback : `https://jawebflow.pages.dev/api/webhook/tiktok?key=<CLE_ALEATOIRE>`.
3. `insert into channel_integrations (…) values (…, 'tiktok', '<CLE_ALEATOIRE>', '<TIKTOK_BUSINESS_ID>')`.

⚠️ L'API est en **beta restreinte** (APAC, LATAM, METAP dont l'Algérie, Amérique du Nord — EEE/Suisse/RU exclus). L'éligibilité d'un compte algérien **reste à confirmer par un test** avant d'en parler à un client. De même, la charge utile exacte des webhooks TikTok n'est documentée qu'après l'obtention de l'accès : le parseur écrit ici est **tolérant**, à revérifier ce jour-là.

---

## 3. La facturation : on ne devine jamais

| Qui | Ce qui arrive | Enregistré |
|---|---|---|
| Message **entrant** | toujours | `billable = false` (c'est gratuit chez toutes les plateformes) |
| Message **sortant** | à l'envoi | `billable = false` — provisoire |
| **Accusé de livraison** | `status = delivered` | `billable = pricing.billable` **recopié tel quel** |

Autrement dit : la refacturation du client est la **copie exacte** de ce que Meta facture. Un message `sent` ou `failed` ne coûte rien et n'est donc jamais compté ; deux accusés pour le même message ne comptent qu'une fois (anti-doublon en base).

Le forfait WhatsApp du mois se lit sur ces lignes : `Pro = 1 000` facturés inclus, puis `channel_credits` (recharges). Forfait épuisé → le client reçoit un message d'attente poli, **sans appel à l'IA** (donc sans dépense supplémentaire).

---

## 4. Vérifier que tout marche

```bash
npm run lint    # tsc --noEmit → 0 erreur
npm test        # 657 tests, 39 fichiers → 0 échec
```

Les deux fichiers qui couvrent les canaux :

| Fichier | Ce qu'il prouve |
|---|---|
| `tests/channels-parsers.test.ts` (49 tests) | signatures (échec fermé), lecture des messages, `pricing.billable`, quota 1 000/1 001ᵉ, découpage des réponses longues |
| `tests/channels-webhook.test.ts` (32 tests) | les 4 webhooks de bout en bout : challenge Meta, 401 sur mauvaise signature, réponse envoyée, journalisation, renvois de Meta, « stop »/« reprends », recharges, fenêtre 24 h |

**Le réseau est entièrement simulé** (`tests/helpers/fakes.ts` route `graph.facebook.com`, `api.telegram.org`, `business-api.tiktok.com`). Chaque test vérifie qu'**aucun** appel réseau imprévu n'a eu lieu : si un test passait « un peu par hasard », il échouerait.

Test de fumée manuel, une fois un canal branché :

1. Écrire au numéro / à la page depuis **un autre compte**.
2. Vérifier la réponse dans la messagerie.
3. Vérifier en base : `select channel, direction, billable, category from channel_messages order by created_at desc limit 5;`
4. Envoyer ensuite un accusé de livraison réel et vérifier que `billable` correspond à ce que Meta rapporte.

---

## 5. Ce qui reste à faire (côté interface)

Le serveur est complet et testé. Il reste l'écran marchand — **aucune ligne de ce qui suit n'est encore écrite** :

1. **Boutons « Connecter »** par canal dans le tableau de bord (aujourd'hui : insertion SQL manuelle, comme ci-dessus).
2. **Diagnostics en clair** : afficher `last_error` de `channel_integrations` (« jeton expiré », « page non autorisée »…) et un bouton **« Réactiver »**.
3. **Jauge WhatsApp** : « 743 / 1 000 messages ce mois-ci » + bouton de recharge (la vue `channel_monthly_usage` est déjà prête pour ça).
4. **Fusion de `functions/api/webhook/instagram.ts`** dans le même pipeline (≈1 500 lignes en moins à maintenir) — c'est le prochain gros gain, à faire quand Instagram sera à nouveau testable.
