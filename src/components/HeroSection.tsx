import React from 'react';
import { ArrowRight, Globe, MessageCircle, Instagram } from 'lucide-react';

interface HeroSectionProps {
  onOpenAssistantModal: () => void;
  onScrollToParcours: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenAssistantModal,
  onScrollToParcours,
}) => {
  return (
    <section 
      id="hero-section"
      className="relative pt-24 sm:pt-36 md:pt-40 pb-10 sm:pb-20 px-6 sm:px-10 lg:px-16 max-w-[1440px] mx-auto flex flex-col md:flex-row items-center md:items-start justify-start w-full overflow-hidden"
    >
      <div className="w-full md:max-w-2xl md:mr-auto flex flex-col items-start text-left">
        {/* Petit repère de confiance, sans surenchère */}
        <div 
          id="hero-badge"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-neutral-300 mb-6 backdrop-blur-xl"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Assistant de discussion pour les entreprises algériennes</span>
        </div>

        {/* Main Headline */}
        <h1 
          id="hero-title"
          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white font-display leading-[1.12] mb-5 drop-shadow-sm"
        >
          Répondez à vos clients <br />
          <span className="text-neutral-400">
            même quand vous êtes fermé.
          </span>
        </h1>

        {/* Subtitle */}
        <p 
          id="hero-subtitle"
          className="text-sm sm:text-base md:text-lg text-neutral-300 leading-relaxed mb-8 max-w-xl font-normal"
        >
          Une bulle de discussion sur votre site qui répond en français et en darija :
          prix, livraison, horaires, disponibilité. Et qui vous transmet le numéro
          des clients intéressés.
        </p>

        {/* Primary Actions */}
        <div 
          id="hero-cta-group"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto mb-8"
        >
          <button
            id="hero-primary-cta"
            onClick={onOpenAssistantModal}
            className="w-full sm:w-auto px-6 py-3.5 rounded-lg bg-white hover:bg-neutral-200 text-neutral-900 font-semibold text-sm sm:text-base transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Créer mon assistant</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            id="hero-secondary-cta"
            onClick={onScrollToParcours}
            className="w-full sm:w-auto px-6 py-3.5 rounded-lg border border-white/15 text-neutral-300 hover:text-white hover:border-white/30 font-medium text-sm sm:text-base transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Comment ça marche</span>
          </button>
        </div>

        {/* Trois points concrets, sans jargon */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-400">
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-neutral-500" />
            Sur votre site, en 5 minutes
          </span>
          <span className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-neutral-500" />
            Français & darija
          </span>
          <span className="flex items-center gap-2">
            <Instagram className="w-4 h-4 text-neutral-500" />
            Aussi sur Instagram
          </span>
        </div>
      </div>
    </section>
  );
};
