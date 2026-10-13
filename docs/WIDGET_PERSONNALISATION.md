# 🎨 Personnalisation du widget (bulle de discussion)

Ce que le marchand règle dans son tableau de bord **change vraiment** le widget
servi sur son site. Avant, l'aperçu changeait mais le vrai widget gardait ses
réglages d'origine — c'est corrigé, et un test le vérifie à chaque livraison
(`tests/widget-snippet.test.ts`).

## Comment un réglage arrive au visiteur

| Étage | Rôle | Délai |
|---|---|---|
| **Le code collé** (`<script data-…>`) | Donne la bonne apparence dès la première milliseconde (pas de « saut » visuel au chargement). | Instantané |
| **`/api/widget-config`** | Relit la config du marchand à chaque visite : le marchand change une couleur, **il n'a rien à recoller** sur son site. | ~1 requête |
| **L'aperçu du tableau de bord** | Construit par la **même fabrique** (`src/lib/widget-snippet.ts`) que le code collé : l'aperçu ne peut plus mentir. | Instantané |

## Ce que le marchand peut régler

| Réglage | Valeurs | Attribut |
|---|---|---|
| Nom affiché (en-tête) | texte libre | `data-business-name` |
| Couleur principale / secondaire (dégradé) | 6 palettes + code couleur libre | `data-primary-color`, `data-secondary-color` |
| Position | bas-droite · bas-gauche | `data-position` |
| Forme de la bulle | cercle · squircle · compact | `data-shape` |
| Taille de la bulle | discret (48 px) · standard (56 px) · confort (64 px) | `data-size` |
| Thème | clair · sombre | `data-theme` |
| Icône | 7 icônes fournies **ou** son propre logo | `data-icon`, `data-avatar-url` |
| Phrase d'accroche (« teaser ») | texte libre, éteignable | `data-teaser` (vide = éteint) |
| Message d'accueil du chat | texte libre | `data-welcome` |
| Titre / sous-titre de l'en-tête | texte libre | `data-header-title`, `data-header-subtitle` |
| Pastille « en ligne » | affichée · masquée | `data-badge` |
| Mention « Développé par JawebFlow » | affichée · masquée | `data-branding` |
| Bouton d'appel vocal | allumé · éteint | `data-voice`, `data-voice-greeting` |
| Contact humain de secours (WhatsApp) | numéro international | `data-whatsapp` |
| **Mode du widget** | les deux · **le bot qui appelle** (aucun chat) · écrit seulement | `data-mode` |
| **Bulle qui pulse** | oui · non | `data-pulse` |
| **Accroche retardée** | tout de suite · 3 · 5 · 10 s | `data-teaser-delay` |
| **Ouverture automatique** | jamais · 5 · 10 · 20 s | `data-auto-open` |
| **Message du bot qui parle le premier** | texte libre | `data-proactive` |
| **Libellé du bouton d'appel** | texte libre | `data-call-cta` |
| **CSS libre** | son propre CSS (max 4 000 caractères) | *config serveur* (`customCss`) |

### 🎯 Le mode « le bot qui appelle »

Pour un garage, un cabinet, un restaurant : le visiteur **n'écrit pas**, il
**appelle**. Le marchand passe le widget en mode `voice` :

- la bulle affiche un micro et **pulse** ;
- au clic, l'appel démarre immédiatement (aucun chat à remplir) ;
- l'accroche par défaut devient l'invitation à appeler ;
- si la voix n'est pas prête côté serveur, le visiteur voit un message clair,
  jamais une erreur technique.

### 🎣 Capter l'attention (sans agresser)

1. **La bulle pulse** — une onde continue autour du bouton.
2. **L'accroche arrive après X secondes** — le visiteur a d'abord vu la page.
3. **Le chat s'ouvre tout seul après X secondes** (si le marchand l'a demandé).
4. **Le bot parle le premier** — « Vous cherchez un prix ? Je peux vous appeler. »
5. **Le bouton d'appel est toujours visible** sous les messages, avec son libellé.

Tout est éteint ou neutre par défaut : rien ne s'impose tant que le marchand ne
l'a pas activé.

### 🎨 Le CSS libre

Le CSS du marchand est injecté **dans le shadow DOM du widget** : il peut tout
changer (ombres, animations, polices) sans jamais toucher au reste de son site,
et sans casser la page. Limité à 4 000 caractères.

## Comportement (écrit **et** vocal)

Le comportement n'est pas « branché à la moitié » : les deux canaux partagent la
même consigne système (`functions/_shared/prompt.ts`).

- ton, langue (darija DZ, darija TN, français, arabe, anglais), longueur des réponses ;
- règles du marchand (`behavior.customRules`) — **priorité maximale** ;
- base de connaissances, FAQ, tarifs, notes, informations officielles ;
- recherche produits du site, mémoire de la conversation, capture de contacts ;
- pour l'appel : l'assistant est en plus briefé « au téléphone » et commence
  l'appel par la phrase d'ouverture réglée par le marchand.

## Agent vocal : ce que le marchand choisit

| Réglage | Où | Valeurs |
|---|---|---|
| Allumer / éteindre l'appel | Personnalisation → onglet Voix | éteint par défaut |
| La voix | onglet Voix (6 voix : Puck, Kore, Aoede, Zephyr, Charon, Fenrir) | décrite en clair à l'écran (« Enjouée », « Posée », « Grave »…) |
| Phrase d'ouverture | onglet Voix | texte libre, prononcée exactement |
| Durée maximale d'un appel | onglet Voix | 3 · 5 · 10 · 15 min (plafond absolu 15 min) |

Le modèle temps réel est **Gemini 3.8 Live** (`gemini-3.8-live`), surchargeable
par `GEMINI_LIVE_MODEL` — voir `docs/AGENT_VOCAL.md`.

## 🧠 Ce que l'agent vocal sait (rappel)

Le mode « le bot qui appelle » n'invente rien : au téléphone, l'agent ne connaît que
la **base de connaissance du compte**. Sans base, il répond « je ne sais pas » et
propose de prendre le numéro du client. Voir `docs/AGENT_VOCAL.md` §2 bis.

## Limites (volontaires)

- Pas d'injection de HTML/CSS/JS libre **dans** le widget : une page cliente ne
  doit jamais pouvoir exécuter du code à la place du marchand.
- La fenêtre de chat garde sa taille (380 × 540 px, adaptée au mobile) : c'est ce
  qui la rend lisible partout.
- Un seul widget par assistant ; plusieurs emplacements = plusieurs fois la même
  ligne de code, les statistiques restent celles de l'assistant.
