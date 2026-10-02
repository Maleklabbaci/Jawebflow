# « Parler à mon IA » — le chat où le marchand donne des ordres à son IA

## Où il se trouve

- **Accueil = le chat**, façon Gemini / Claude : « Bonjour {prénom} », « Quoi de neuf ? On ajoute quoi ? »,
  un grand champ de texte et des suggestions. Dès le premier message, la page devient une discussion
  (message par message) avec la zone de saisie en bas. Seules les urgences remontent au-dessus du titre
  (limite atteinte, plan qui expire) ; les étapes qui manquent sont de petites pastilles « Pour démarrer ».
- **Sur tous les autres écrans** : un bouton flottant (et l'entrée violette du menu) ouvre la même
  discussion dans une fenêtre. C'est **une seule et même discussion** (une seule instance du composant,
  dessinée dans la page d'accueil ou dans la fenêtre selon l'écran) : rien ne se perd quand on change d'onglet.
- L'ancien écran d'accueil (statut, chiffres, « À faire », usage) existe toujours sous **Résumé**
  (`/dashboard/summary`).

Le marchand écrit en français, en darija ou en arabe — ou dicte à la voix — et son IA **exécute vraiment** :

| Il écrit… | Ce qui se passe réellement |
|---|---|
| « ajoute : coque spiderman iPhone 13 à 16, 1900 DA » | une fiche est écrite dans **Mes informations** |
| « la livraison est gratuite dès 5000 DA » | la fiche livraison est complétée (sans rien perdre) |
| « mon numéro est 0555…, on ferme le vendredi » | **informations officielles** mises à jour |
| « réponds court, en darija, et tutoie » | réglages de **Comportement** (langue, longueur, règles) |
| « quand on commente prix, réponds merci en public et envoie mes tarifs en privé » | une **automatisation Instagram** est créée (en pause) ; « oui active » la lance |
| « sous mon dernier reel, … » | l'IA liste les publications et vise la bonne |
| « combien de messages cette semaine ? », « combien de leads aujourd'hui ? » | l'IA **lit les vrais chiffres** du compte (voir plus bas) et répond |
| « montre-moi les derniers leads », « le lead de Blida ? » | l'IA liste les leads (nom, téléphone, besoin, canal, date) |

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

## Les chiffres du compte (lecture seule)

Deux outils, `get_stats` et `list_leads`, lisent la base et renvoient des nombres **exacts** (le total vient
de l'en-tête `content-range`, pas d'un comptage approximatif). L'IA ne devine jamais un chiffre.
Rien n'est écrit, rien n'est journalisé.

| Chiffre | Ce que c'est exactement |
|---|---|
| messages | échanges avec des clients (`conversation_contexts`), hors scans de site web |
| conversations | discussions distinctes (`session_id`) |
| leads | fiches `prospects` avec un téléphone **ou** un email |
| visiteurs sans contact | les autres fiches `prospects` (suivi anonyme de la bulle) |
| questions en attente | `learning_questions` ouvertes |

Périodes : aujourd'hui, hier, 7 jours (par défaut), 30 jours, ce mois-ci, depuis le début — « aujourd'hui »
commence à minuit **à l'heure du marchand** (Algérie / Tunisie = UTC+1), pas à minuit UTC. Les noms,
téléphones et besoins des leads sont des données de clients : ils arrivent à l'IA entourés de `<donnees>`
(garde contre l'injection de consignes). Voir `functions/_shared/copilot-stats.ts` et `tests/copilot-stats.test.ts`.

## Cohérence avec la sauvegarde automatique du tableau de bord

Le tableau de bord réécrit toute la fiche de l'assistant depuis son état (sauvegarde automatique). Pour
qu'elle n'écrase jamais ce que l'IA vient d'écrire en base :

1. avant chaque message, le tableau de bord **enregistre** ce qui est en attente (`ensureAssistantReady`) ;
   si l'enregistrement échoue, l'IA n'est pas appelée et le marchand le voit ;
2. pendant que l'IA travaille, la sauvegarde automatique est **suspendue** (reprise dès la fin) ;
3. la réponse contient `state` (nouvelles fiches / comportement / infos) que le tableau de bord applique
   à ses écrans ;
4. si la réponse se perd en route (coupure de réseau, délai dépassé), le chat le signale (`onResync`) et le tableau
   de bord **relit la base** : ses écrans montrent ce qui a vraiment été enregistré, et la sauvegarde automatique
   suivante ne peut pas l'écraser.

## Fichiers

* `functions/api/copilot.ts` — point d'entrée, limites de débit, choix du modèle.
* `functions/_shared/copilot-usage.ts` — compteur de messages par jour (table `copilot_usage`).
* `functions/_shared/copilot-core.ts` — logique pure : outils proposés à l'IA, validation, consigne, état montré à l'IA.
* `functions/_shared/copilot-tools.ts` — les actions réelles (`CopilotRunner`) + annulations (`applyOp`).
* `functions/_shared/copilot-stats.ts` — lectures en base des chiffres et des leads (`get_stats`, `list_leads`).
* `functions/_shared/gemini-tools.ts` — boucle d'appel d'outils Gemini (signatures de réflexion renvoyées telles quelles).
* `functions/_shared/ig-automation-store.ts` — lecture/écriture des automatisations (partagé avec l'écran).
* `src/components/CopilotChat.tsx`, `src/lib/copilot-api.ts`, `src/lib/api-client.ts` — interface (`mode="page"` = Accueil façon Gemini / Claude, `mode="drawer"` = fenêtre flottante).

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
`copilot-e2e` (la phrase du marchand → l'automatisation créée → un vrai commentaire reçu par le webhook → la réponse
publique et le message privé partent ; en pause, il se tait),
`copilot-stats` (chiffres et leads : périodes à l'heure d'Alger, comptages exacts, lectures bornées au compte),
`copilot-chat-ui` (fenêtre de chat), `copilot-dashboard` (chat dans le tableau de bord : écrans mis à jour,
sauvegarde automatique non écrasante), `copilot-home` (Accueil façon Gemini / Claude : titre, suggestions,
même discussion partout, « Résumé » conservé).

⚠️ Le vrai Gemini n'a pas été appelé pendant le développement (aucune clé dans l'environnement de test) : le
format des requêtes suit la documentation officielle (function calling / thought signatures) et le serveur a été
essayé de bout en bout dans le runtime Cloudflare (wrangler) avec un faux Gemini. Premier essai réel conseillé :
« ajoute : test 100 DA » puis « Annuler ».
