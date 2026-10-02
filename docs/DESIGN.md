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
