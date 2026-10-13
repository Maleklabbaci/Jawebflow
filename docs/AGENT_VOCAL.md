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

## 3. Le coût — à lire avant d'allumer partout

🎙️ **Un appel consomme beaucoup plus qu'un message écrit.** C'est une conversation en direct :
chaque seconde de parole (et chaque seconde de réponse) est facturée par Google.

**Ce qui protège le marchand, automatiquement :**

| Protection | Ce qu'elle fait |
|---|---|
| **Quota de conversations** (le seul arrêt — décision du 13/10/2026) | **1 minute d'appel = 10 conversations** (50 unités de quota, 5 unités = 1 conversation). Basic : 100 min d'appel **ou** 5 000 messages. Pro : 500 min **ou** 25 000 messages. Épuisé → l'assistant se met en pause et reprend le 1er du mois. |
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
  100 min, Pro 500 min) ; une recharge à l'unité (comme pour WhatsApp) serait la suite logique.
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
