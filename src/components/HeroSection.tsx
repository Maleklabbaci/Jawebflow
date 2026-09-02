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
        {/* Eyebrow Badge */}
        <div 
          id="hero-badge"
          className="flex flex-wrap sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/80 border border-purple-500/30 text-xs font-medium text-purple-200 mb-5 backdrop-blur-xl"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="font-semibold text-white">JawebFlow · Assistant conversationnel pour entreprises 🇩🇿</span>
          <span className="text-neutral-500 hidden sm:inline">•</span>
          <span className="text-neutral-300">Français & Darija 24h/24</span>
        </div>

        {/* Main Headline */}
        <h1 
          id="hero-title"
          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white font-display leading-[1.12] mb-5 drop-shadow-sm"
        >
          Le chatbot conversationnel <br />
          <span className="text-purple-300">
            conçu pour vos clients.
          </span>
        </h1>

        {/* Subtitle */}
        <p 
          id="hero-subtitle"
          className="text-sm sm:text-base md:text-lg text-neutral-300 leading-relaxed mb-8 max-w-xl font-normal"
        >
          Automatisez votre accueil client, vos réponses aux devis, la prise de commandes et la qualification des prospects avec un assistant qui répond couramment en Français et en Darija algérienne.
        </p>

        {/* Primary Actions */}
        <div 
          id="hero-cta-group"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto mb-8"
        >
          <button
            id="hero-primary-cta"
            onClick={onOpenAssistantModal}
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm sm:text-base shadow-lg shadow-purple-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Créer mon assistant</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            id="hero-secondary-cta"
            onClick={onScrollToParcours}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 text-neutral-200 hover:text-white font-medium text-sm sm:text-base border border-white/15 backdrop-blur-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Voir les fonctionnalités</span>
          </button>
        </div>

        {/* Business Types Badges */}
        <div className="space-y-3 w-full">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span className="text-purple-200 font-semibold shrink-0">Pour tous secteurs :</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900/60 border border-white/10 text-neutral-200">Sites Vitrines</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900/60 border border-white/10 text-neutral-200">E-commerce & Retail</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900/60 border border-white/10 text-neutral-200">Services & Agences</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900/60 border border-white/10 text-neutral-200">Cabinets & Santé</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-900/60 border border-white/10 text-neutral-200">Formation</span>
          </div>

          <div 
            id="channels-section"
            className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-neutral-300 pt-1"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200">
              <Globe className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span className="font-semibold text-white">Widget Web universel</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">Prêt à intégrer</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/50 border border-white/10 text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              <span>1 ligne de code (WordPress, Shopify, Wix, HTML)</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/50 border border-white/10 text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Capture automatique de prospects</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
