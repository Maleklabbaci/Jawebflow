# « Parler à mon IA » — le chat où le marchand donne des ordres à son IA

Un bouton flottant (et l'entrée violette du menu, et un bouton sur l'Accueil) ouvre une fenêtre de
discussion. Le marchand écrit en français, en darija ou en arabe — ou dicte à la voix — et son IA
**exécute vraiment** :

| Il écrit… | Ce qui se passe réellement |
|---|---|
| « ajoute : coque spiderman iPhone 13 à 16, 1900 DA » | une fiche est écrite dans **Mes informations** |
| « la livraison est gratuite dès 5000 DA » | la fiche livraison est complétée (sans rien perdre) |
| « mon numéro est 0555…, on ferme le vendredi » | **informations officielles** mises à jour |
| « réponds court, en darija, et tutoie » | réglages de **Comportement** (langue, longueur, règles) |
| « quand on commente prix, réponds merci en public et envoie mes tarifs en privé » | une **automatisation Instagram** est créée (en pause) ; « oui active » la lance |
| « sous mon dernier reel, … » | l'IA liste les publications et vise la bonne |

Sous chaque réponse, des **cartes** montrent ce qui a été fait (la liste est établie par le serveur,
l'IA ne peut pas l'inventer) avec **Annuler**, **Activer maintenant** et **Voir**.

## Comment ça marche

```
navigateur ── POST /api/copilot {assistantId, messages[≤14]} ──► functions/api/copilot.ts
                                                                 │ 1. jeton Supabase → propriétaire de l'assistant ?
                                                                 │ 2. état de l'entreprise (fiches, règles, Instagram, automatisations)
                                                                 │ 3. boucle Gemini « appel d'outils » (≤ 5 tours, ≤ 12 actions)
                                                                 │      └─ chaque outil écrit pour de vrai (CopilotRunner)
navigateur ◄── { reply, actions[], state } ──────────────────────┘
   └─ applique `state` aux écrans (fiches, comportement, infos) et recharge Automatisations / Instagram si besoin
```

* **Sans mémoire côté serveur** : le navigateur renvoie les 14 derniers messages (historique gardé dans le
  navigateur, 50 messages max, propre à chaque compte). Ces échanges ne comptent **pas** dans les
  conversations des clients du marchand.
* **Annuler / Activer** = `POST /api/copilot {assistantId, op}` (sans IA, re-validé côté serveur).
  Annuler défait **un seul** changement (ex. la langue) sans toucher aux autres réglages.
* Les automatisations passent par le **même code** que l'écran « Automatisations »
  (`functions/_shared/ig-automation-store.ts` + `sanitizeAutomationInput`) : mêmes contrôles, mêmes limites.
  Elles sont créées **en pause** sauf demande explicite d'activation.

## Cohérence avec la sauvegarde automatique du tableau de bord

Le tableau de bord réécrit toute la fiche de l'assistant depuis son état (sauvegarde automatique). Pour
qu'elle n'écrase jamais ce que l'IA vient d'écrire en base :

1. avant chaque message, le tableau de bord **enregistre** ce qui est en attente (`ensureAssistantReady`) ;
   si l'enregistrement échoue, l'IA n'est pas appelée et le marchand le voit ;
2. pendant que l'IA travaille, la sauvegarde automatique est **suspendue** (reprise dès la fin) ;
3. la réponse contient `state` (nouvelles fiches / comportement / infos) que le tableau de bord applique
   à ses écrans.

## Fichiers

* `functions/api/copilot.ts` — point d'entrée, limites de débit, choix du modèle.
* `functions/_shared/copilot-usage.ts` — compteur de messages par jour (table `copilot_usage`).
* `functions/_shared/copilot-core.ts` — logique pure : outils proposés à l'IA, validation, consigne, état montré à l'IA.
* `functions/_shared/copilot-tools.ts` — les actions réelles (`CopilotRunner`) + annulations (`applyOp`).
* `functions/_shared/gemini-tools.ts` — boucle d'appel d'outils Gemini (signatures de réflexion renvoyées telles quelles).
* `functions/_shared/ig-automation-store.ts` — lecture/écriture des automatisations (partagé avec l'écran).
* `src/components/CopilotChat.tsx`, `src/lib/copilot-api.ts`, `src/lib/api-client.ts` — interface.

## Réglages (variables d'environnement Cloudflare, tous facultatifs)

* `GEMINI_API_KEY` — **obligatoire** (la même que pour le chat des clients). Sans elle : message « activation en cours ».
* `COPILOT_MODEL` — modèle à essayer en premier. Par défaut : `gemini-3.8-flash` (le plus capable pour exécuter des
  ordres), puis `gemini-3.1-flash-lite`, puis `gemini-3.5-flash-lite` (un modèle introuvable est mis de côté
  automatiquement). Mettre `gemini-3.1-flash-lite` pour réduire le coût (il comprend moins bien les demandes complexes).
* `COPILOT_DAILY_MAX` — messages par jour et par marchand (défaut **150**).
* `GEMINI_API_BASE` — adresse de l'API (relais ou essais locaux).

## Limites et coût

* **40 messages / 10 minutes** par marchand (en mémoire de l'instance : coupe les abus immédiats).
* **150 messages / jour** par marchand, durable : table `copilot_usage` (section 6 de
  `supabase/migration_ig_automations.sql`, facultative — sans elle, seule la limite des 10 minutes s'applique).
  La table garde aussi les tokens consommés par jour (suivi du coût). Une panne de l'IA ne consomme pas la limite.
* ≈ 2 appels à l'IA par message (≈ 2 000 mots de consigne + les outils, ≈ 5 000 tokens en entrée, quelques centaines
  en sortie). Avec `gemini-3.8-flash` (0,75 $ / 3,75 $ par million de tokens en 2026, le double en 2027) : ≈ **1 centime
  de dollar par message** ; avec `gemini-3.1-flash-lite` : ≈ 3× moins.
* Journal serveur `[copilot]` : modèle, tours, outils utilisés, tokens, durée — jamais le contenu des messages.

## Ce qui n'est PAS fait (volontairement)

* répondre à d'**anciens** commentaires déjà postés, écrire à un client précis ;
* réponses aux commentaires **rédigées par l'IA à chaque fois** : les automatisations utilisent les textes
  (et variantes) que l'IA rédige à la création, comme ManyChat ;
* aucune restriction par abonnement.

## Tests

`npm test` — `copilot-core` (logique pure), `copilot-tools` (actions réelles + annulations sur une fausse base),
`copilot-endpoint` (boucle complète avec un **faux Gemini** : protocole, signatures, pannes, quotas, sécurité),
`copilot-chat-ui` (fenêtre de chat), `copilot-dashboard` (chat dans le tableau de bord : écrans mis à jour,
sauvegarde automatique non écrasante).

⚠️ Le vrai Gemini n'a pas été appelé pendant le développement (aucune clé dans l'environnement de test) : le
format des requêtes suit la documentation officielle (function calling / thought signatures) et le serveur a été
essayé de bout en bout dans le runtime Cloudflare (wrangler) avec un faux Gemini. Premier essai réel conseillé :
« ajoute : test 100 DA » puis « Annuler ».
