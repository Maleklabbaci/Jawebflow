# Le look de l'espace client

Inspiré des plateformes modernes (barre latérale en pastilles, fond lavande, cartes très arrondies).

| Élément | Règle |
|---|---|
| Barre latérale (288 px, visible dès 1024 px ; en dessous : tiroir) | logo en dégradé violet, encart de l'assistant, bouton « Parler à mon IA », entrées de 44 px avec icône + flèche ; l'entrée **active** est une grande pastille dégradée `#a23dff → #5a2cff` ; les chiffres (fiches, clients) sont posés sur l'icône |
| En-tête | blanc, titre léger, bouton « Enregistrer » en pastille dégradée |
| Page | « feuille » lavande `#eef1fb` aux grands angles arrondis (haut-gauche 44 px) |
| Cartes | blanches, 24 px d'arrondi, sans trait, ombre très légère ; `StatCard` (`src/components/dashboard/StatCard.tsx`) pour les chiffres |
| Boutons | principaux = pastille dégradée ; secondaires = pastille à contour doux ; les boutons « carte » pleine largeur ne changent pas |
| Champs | angles doux, contour lavande, halo violet au clic |

## Où c'est écrit

* Structure (barre latérale, en-tête, feuille) : `src/components/DashboardPlatform.tsx`.
* Style commun : bloc « ESPACE CLIENT » à la fin de `src/index.css`. **Tout y est limité à `.dash-theme`** (la racine du
  tableau de bord) : le site public n'est pas touché — un test (`tests/dashboard-shell.test.tsx`) refuse toute règle non limitée.
* Les anciens écrans reprennent le look **tout seuls** grâce à ces règles (une carte = `bg-white rounded-xl border`, un
  bouton principal = `bg-purple-600 px-… py-…`). Pour un nouvel écran, garder ces classes suffit.
* Pour exclure un champ du style commun (ex. la zone de texte du chat d'accueil, qui est dans sa propre carte) : classe `dash-bare`.
* Le dégradé sur un bouton rond ou d'un style particulier : classe `dash-gradient` (inactive quand le bouton est désactivé).

---

# Le look du site vitrine (landing + pages publiques)

Inspiré des interfaces IA haut de gamme : fond obsidienne `#08070f`, une seule
famille de caractères (**Poppins**), beaucoup d'air, et un violet de marque utilisé
avec parcimonie (liserés, halos, un mot mis en valeur par titre).

| Élément | Règle |
|---|---|
| Police | Poppins partout, y compris le code (`code`, `pre`, `.font-mono` → Poppins). Chargée dans `index.html` (300 → 800) |
| Titres | `.lux-h1` / `.lux-h2` / `.lux-h3` : 800, interlignage 1.06, `letter-spacing: -0.035em`, tailles fluides (`clamp`) |
| Mot mis en valeur | `.lux-accent` (dégradé violet clair → violet, en `background-clip: text`) |
| Sous-titres | `.lux-sub` / `.lux-lead` : **300 (Light)**, `line-height: 1.75`, couleur `--text-dim` |
| Micro-titre | `.lux-eyebrow` : capitales, 0.68 rem, `letter-spacing: 0.16em`, pastille à liseré violet |
| Boutons | `.btn` + `.btn-primary` / `.btn-glass` / `.btn-light` / `.btn-quiet`, tailles `.btn-sm` / `.btn-lg`. **Plats** : un dégradé violet profond, un liseré clair d'un pixel, une ombre douce, `-1px` au survol maximum — jamais d'effet 3D ni de gros `scale` |
| Cartes | `.lux-card` (verre 22px d'arrondi), `.lux-card-hover` (liseré violet + `-2px`), `.lux-card-beam` (filet lumineux en haut) |
| Champs | `.lux-label` + `.lux-input` (fond translucide, halo violet au focus, listes déroulantes natives lisibles sur fond sombre) |
| Onglets / pastilles | `.lux-tab` / `.lux-tab-active`, `.lux-chip`, `.lux-tag` |
| Alternateur de tarifs | `.lux-switch` (avec `aria-pressed`) |

## Où c'est écrit

* Jetons de couleur (`--ink`, `--brand`, `--line`, `--text-*`) et toutes les classes
  `lux-*` / `btn*` : `src/index.css`, **bloc « SITE VITRINE » placé juste avant** le bloc
  « ESPACE CLIENT » (le test `tests/dashboard-shell.test.tsx` analyse tout ce qui suit ce
  dernier : n'y rien ajouter après).
* Les utilitaires sont dans `@layer components` : une classe Tailwind (`text-[…]`,
  `px-…`, `mt-…`) posée sur le même élément **gagne toujours** sur le style du bloc.
* Sections de l'accueil : `HeroSection` (à ne jamais modifier), `InteractiveChatMockup`
  (démo), `TrustSection` (bénéfices + avant/après), `KnowledgeBaseSection`, `ProcessSection`,
  `FaqSection` (objections), `CtaSection` (dernier appel à l'action).
* Pied de page commun à toutes les pages : `src/components/SiteFooter.tsx`, monté dans
  `App.tsx` (l'appel à l'action y est masqué sur l'accueil pour ne pas doubler `CtaSection`).
* Filet de sécurité : `tests/landing-pages.test.tsx` rend chaque page publique et vérifie
  que les boutons, champs, FAQ, onglets et le widget flottant répondent vraiment.
