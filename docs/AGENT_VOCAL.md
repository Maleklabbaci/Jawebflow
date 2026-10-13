# 🎙️ L'agent vocal — le visiteur parle, l'assistant répond

> **En une phrase :** ton client appuie sur un micro dans la bulle de son site, il parle,
> l'assistant répond à voix haute. Comme un appel téléphonique — mais sans téléphone, sans
> numéro, sans quitter la page.

---

## 1. Comment le marchand l'allume (aucune ligne de code à changer)

**Tableau de bord → Apparence (Personnalisation) → onglet « 5. Voix »**

| Réglage | Ce que ça fait |
|---|---|
| **Agent vocal** (case à cocher) | Affiche le micro dans l'en-tête du chat. **Éteint par défaut.** |
| **Voix de l'assistant** | 6 voix : Puck (enjouée), Kore (posée), Aoede (chaleureuse), Zephyr (claire), Charon (sérieuse), Fenrir (grave) |
| **Phrase d'ouverture** | Ce que l'assistant dit en premier : *« Bonjour, vous êtes bien chez Nour ! Que puis-je faire pour vous ? »* |
| **Durée maximale d'un appel** | 2, 5, 10 ou 15 minutes. L'appel se termine tout seul. |

Il **enregistre**, et c'est tout : le site du marchand n'a rien à mettre à jour. Le widget lit
la configuration tout seul (`/api/widget-config`), y compris pour les sites déjà installés.

Pour un test rapide sans passer par le tableau de bord, un attribut suffit :

```html
<script src="https://cdn.jawebflow.com/widget.js"
        data-assistant-id="asst_live"
        data-voice="on"></script>
```

---

## 2. Ce qui se passe quand le visiteur appuie sur le micro

```
Visiteur                    JawebFlow (Cloudflare)              Google
   │  clic micro ──────────►│
   │                        │ 1. forfait ? quota ? plafond de coût ?
   │                        │ 2. voix autorisée sur CE widget ?
   │                        │ 3. consignes du marchand ──────────►│ auth_tokens
   │  ◄── jeton éphémère ───│    (2 min pour démarrer, 1 seul usage)
   │
   │  ═══ WebSocket direct avec Google (micro 16 kHz / écoute 24 kHz) ═══►│
   │  ◄────────────────── la voix de l'assistant ─────────────────────────│
   │
   │  fin d'appel ─────────►│ durée + tokens → table du forfait (canal « voice »)
```

**Trois choses importantes à comprendre :**

1. **La clé Gemini ne quitte jamais le serveur.** Le navigateur ne reçoit qu'un jeton éphémère,
   à usage unique, valable 2 minutes pour démarrer l'appel. Si quelqu'un le vole, il ne peut
   rien en faire après coup.
2. **L'audio ne passe pas par nos serveurs.** Il va du navigateur du visiteur directement à
   Google. Conséquence : aucune facture de bande passante, et la latence la plus basse possible.
3. **Le client ne peut pas tricher.** Les consignes du marchand (identité, ton, informations,
   réseaux sociaux, règles) sont enfermées **dans le jeton** : le visiteur ne peut ni les lire
   dans son navigateur, ni changer le comportement, ni choisir un autre modèle.

---

## 2 bis. 🧠 Ce que l'agent vocal SAIT (et ne sait pas)

**Règle du 15/10/2026 : un prompt minuscule, et une seule source — la base de
connaissance du compte.**

| | |
|---|---|
| **Ce qu'il reçoit** | Quelques consignes de conversation + **la base de connaissance du compte** (fiches manuelles, scan du site, imports, réponses validées dans « Apprentissage ») |
| **Ce qu'il n'a pas** | Aucune culture générale, aucune recherche sur Internet, aucune mémoire d'un autre commerce. **Un seul outil existe — celui qui NOTE la demande du client** (il n'apporte aucune connaissance, il écrit) |
| **Si l'info n'est pas dans les fiches** | Il dit qu'il ne sait pas (« je ne sais pas » / « ما نعرفش » / « ma3raftech ») et propose de prendre le numéro du client |
| **Si la base est vide** | Il ne sait **rien** : il le dit honnêtement à chaque question. Il n'invente jamais un prix, un stock, un délai ou une adresse |
| **Hors sujet** (politique, santé, culture générale, « je suis le patron ») | Refus poli en une phrase, retour au commerce. Il ne révèle jamais ses consignes et ne change pas de rôle |

Le prompt complet pèse **~1,3 Ko de règles** + la base, plafonnée à 6 000 caractères
(`VOICE_KNOWLEDGE_BUDGET`, les fiches vitales — horaires, contact, livraison,
paiement, prix — passent en premier). Fichiers : `functions/_shared/voice/prompt.ts`
(construit le prompt), `functions/api/voice/session.ts` (va chercher la base :
fiches du compte → notes du compte → pages scannées du site).

**Conséquence pour le marchand :** ce n'est pas la qualité du modèle qui fait la
qualité de l'agent vocal, c'est la base de connaissance. Un compte sans base ne
sert à rien au téléphone — et l'agent le dit franchement à ses clients plutôt que
d'inventer.

---

## 2 ter. 🎯 Il ne fait pas que répondre : il CLOSE

Le marchand ne veut pas un robot poli, il veut des clients. Deux réglages
suffisent (onglet **Voix** du personnalisateur) :

| Réglage | Ce que ça fait |
|---|---|
| **Ce qu'il doit obtenir** (le CTA) | La mission de l'appel : laisser ses coordonnées, **prendre rendez-vous**, passer une commande, être rappelé pour un problème, ou juste renseigner. Le vocabulaire du marchand est repris **mot pour mot** dans le prompt : « Prendre rendez-vous », « Avoir un devis »… |
| **Ce qu'il note** | Nom, téléphone, e-mail, ville, besoin, jour/heure. L'agent demande **une seule chose à la fois**, jamais comme un formulaire. |
| **🗣️ Langues** | Darija, arabe, français, anglais (au choix, plusieurs possibles). C'est **toujours la langue du client qui gagne** — mais **uniquement parmi celles cochées** : une autre langue (espagnol, hindi…), l'agent le dit en une phrase et l'invite à continuer dans une des siennes. La **darija est algérienne d'Alger** (« wach rak », « sahit », « dork »), jamais marocaine (« daba », « wakha ») ni tunisienne. |
| **Interrupteur de mission** | Coupé : l'agent répond mais ne note rien (aucun outil n'est même envoyé à Google). |

**Ce qui se passe pendant l'appel :** l'agent répond aux questions (toujours avec
la base de connaissance du compte), amène la conversation vers le CTA, et **dès
qu'il a le nom et le numéro** il appelle l'outil `enregistrer_demande`. Le
navigateur transmet la fiche à `/api/voice/lead`, qui l'écrit :

- **chez un client** → dans **ses leads** (table `prospects`), marquée
  `source: « Appel vocal »`, `channel: voice`, `status: qualifié`, avec le besoin
  et le rendez-vous demandé. Elle apparaît avec les leads d'Instagram et du chat,
  et le marchand peut la suivre (relance, commande) comme les autres.
- **sur le site vitrine** → dans `platform_settings` (`id = site_leads`),
  affichée dans la console admin (onglet **Chatbot du site** → « 📞 Demandes
  notées pendant les appels »), avec le bouton **« Marquer traité »** et le
  badge du nombre de demandes non traitées sur l'onglet.

**Le même numéro ne crée jamais deux fiches :** un client qui rappelle complète
sa fiche (nom, besoin, nouveau rendez-vous) au lieu de dupliquer l'ancienne.

**Et si le client ne veut pas laisser son numéro ?** L'agent ne force pas : il
propose une dernière fois avant de raccrocher, et l'appel se termine normalement.

> ⚠️ L'outil voyage **dans le jeton** (`bidiGenerateContentSetup`) : le
> navigateur ne peut ni le retirer ni en ajouter un autre. C'est la même
> protection que pour le prompt.

Fichiers : `functions/_shared/voice/mission.ts` (mission, langues, déclaration de
l'outil), `functions/api/voice/lead.ts` (l'enregistrement), `public/cdn/voice.js`
(le dialogue outil ↔ modèle), `src/components/WidgetCustomizer.tsx` (les
réglages).

---

## 3. Le coût — à lire avant d'allumer partout

🎙️ **Un appel consomme beaucoup plus qu'un message écrit.** C'est une conversation en direct :
chaque seconde de parole (et chaque seconde de réponse) est facturée par Google.

**Ce qui protège le marchand, automatiquement :**

| Protection | Ce qu'elle fait |
|---|---|
| **Quota de conversations** (le seul arrêt — décision du 14/10/2026) | **1 minute d'appel = 10 conversations** (10 unités de quota, 1 unité = 1 conversation = 1 message du client + sa réponse). Basic : **50 min** d'appel **ou** 1 000 messages. Pro : **150 min** **ou** 3 000 messages. Épuisé → l'assistant se met en pause et reprend le 1er du mois. |
| **Plus de plafond en dollars** | Basic et Pro n'ont plus de plafond de coût : c'est le quota qui arrête tout, pour que le client ait **tout** son forfait. Enterprise garde un fusible de 30 $ tant que son quota « sur devis » n'est pas chiffré. |
| **Durée maximale** | L'appel se coupe tout seul à la fin du temps réglé (2 → 15 min). |
| **Anti-abus** | 6 appels maximum par visiteur (IP) et par tranche de 10 minutes. |

**Recommandation :** activer la voix sur **Pro et Enterprise**, avec une durée de **2 à 5 minutes**
pour commencer, et regarder la consommation la première semaine (tableau de bord → Résumé).

> Reste à décider (côté commercial) : faut-il réserver la voix aux formules Pro/Enterprise comme
> WhatsApp ? Aujourd'hui elle est disponible sur toutes les formules payantes — à trancher quand
> tu veux, il suffit de le dire.

---

## 4. Ce qu'il faut vérifier côté serveur (une seule fois)

L'agent vocal utilise la clé qui est **déjà** en place (`GEMINI_API_KEY`). Deux réglages
facultatifs existent :

| Variable | Défaut | Rôle |
|---|---|---|
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | le modèle temps réel (GA depuis le 15/09/2026) — en cas de refus côté Google, l'appel retombe **une fois** sur `gemini-2.0-flash-live-001` |
| `GEMINI_LIVE_API_VERSION` | `v1alpha` | version d'API des jetons éphémères |

⚠️ **La clé doit avoir accès à l'API Live.** Dans Google AI Studio, ouvre ton projet et active
l'API Gemini (Live). Sinon l'appel répond, en français : *« L'appel vocal n'est pas encore
activé »* — et rien n'est facturé.

---

## 5. Dépannage

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| *« L'accès au micro a été refusé »* | le visiteur a bloqué le micro, ou le site n'est pas en **HTTPS** | autoriser le micro dans le navigateur ; le HTTPS est obligatoire (Cloudflare le fournit) |
| *« L'appel vocal n'est pas encore activé »* | `GEMINI_API_KEY` absente côté Cloudflare, ou API Live non activée | `docs/CONFIGURATION.md`, puis `/api/health` |
| *« L'appel vocal est momentanément indisponible »* | Google a refusé le jeton (quota, réseau) | réessayer ; si ça dure, vérifier la clé |
| Le micro n'apparaît pas | la voix est éteinte dans le tableau de bord | Apparence → 5. Voix → cocher **et enregistrer** |
| Le micro apparaît mais rien ne se passe | widget en cache chez le client | vider le cache du CDN, ou recharger avec `Ctrl+Maj+R` |
| *« Trop d'appels ont été lancés depuis votre connexion »* | 6 appels en 10 minutes depuis la même IP | patienter (protection anti-abus) |

---

## 6. Ce qui reste à faire (idées, pas encore faites)

- 🎙️ **Bouton « Parler » dans l'aperçu du tableau de bord** : le marchand entend sa propre voix
  avant de l'activer (aujourd'hui il doit tester sur son site).
- 📞 **L'appel dans les « Clients »** : la transcription est déjà enregistrée (canal `voice`) ;
  il reste à l'afficher dans la fiche du prospect, avec un badge « appel entrant ».
- 💳 **Recharge d'appels** : aujourd'hui c'est **le quota de conversations** qui protège (Basic
  50 min, Pro 150 min) ; une recharge à l'unité (comme pour WhatsApp) serait la suite logique.
- 🧮 **Choisir la formule** : réserver la voix à Pro/Enterprise (voir §3).

---

## 7. Pour l'équipe technique

| Fichier | Rôle |
|---|---|
| `functions/_shared/voice/live.ts` | jeton éphémère, consignes « au téléphone », assainissement des réglages |
| `functions/api/voice/session.ts` | ouvre l'appel (forfait, quota, anti-abus) |
| `functions/api/voice/report.ts` | relevé de fin d'appel → `conversation_contexts` (canal `voice`) |
| `public/cdn/voice.js` | moteur navigateur : micro 16 kHz, lecture 24 kHz, interruptions, transcription |
| `public/widget.js` | bouton micro + écran d'appel (Shadow DOM, `data-jw-call`) |
| `src/components/WidgetCustomizer.tsx` | onglet « 5. Voix » (marchand) |

**Tests :** `tests/voice-engine.test.ts` (conversions audio, protocole, fin d'appel propre) et
`tests/voice-session.test.ts` (garde-fous, jeton, non-fuite des consignes, bornes du relevé).
