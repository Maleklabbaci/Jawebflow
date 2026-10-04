import React from 'react';

interface BackgroundVideoProps {
  /** Intensité des lueurs (1 = pleine, 0 = fond uni). */
  opacity?: number;
}

/**
 * Fond du site vitrine — version LÉGÈRE et TEMPORAIRE.
 *
 * Elle remplace l'ancienne animation « robot » (201 photos, soit ~10 Mo à
 * télécharger par chaque visiteur, même sur téléphone). Ici il n'y a AUCUN
 * fichier à télécharger et AUCUNE animation : uniquement des dégradés CSS
 * (voir `.site-bg-*` dans src/index.css). Résultat : rien à charger, rien à
 * calculer, donc léger sur un téléphone d'entrée de gamme et sur data mobile.
 *
 * Pour mettre le visuel définitif plus tard (image, vidéo, animation…), on
 * remplace uniquement le contenu de ce composant : App.tsx n'a pas à changer.
 * Les anciennes photos restent récupérables dans l'historique git
 * (ex. `git show 2a03885:public/robot_frames/frame_0001.jpg`).
 */
export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({ opacity = 1 }) => (
  <div
    id="site-background"
    aria-hidden="true"
    className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#08070f]"
  >
    <div className="absolute inset-0" style={{ opacity }}>
      {/* Grande lueur violette derrière le titre + reflet doux côté droit */}
      <div className="site-bg-glow" />
      {/* Lueur indigo en bas à droite */}
      <div className="site-bg-glow-low" />
      {/* Fine trame de points : donne du relief et évite les « marches » du dégradé */}
      <div className="site-bg-dots" />
    </div>

    {/* Fondus haut et bas : lisibilité de la barre de navigation et du pied de page */}
    <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-neutral-950/80 via-neutral-950/30 to-transparent" />
    <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-neutral-950/80 via-neutral-950/30 to-transparent" />
  </div>
);
