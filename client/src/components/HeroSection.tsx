import React from 'react';
import { Sparkles, ArrowRight, Globe, MessageCircle, Instagram, ShieldCheck, Zap } from 'lucide-react';

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
      className="relative pt-24 sm:pt-36 md:pt-40 pb-10 sm:pb-20 px-4 sm:px-6 max-w-6xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-start w-full overflow-hidden"
    >
      {/* 
        Hero Content Aligned to the Left on desktop, balanced on mobile:
        - Keeps the background visual clear and centered
        - Uses sleek translucent frosted glass accents & vibrant purple highlights
      */}
      <div className="w-full md:max-w-2xl md:mr-auto flex flex-col items-start text-left">
        {/* Eyebrow Badge */}
        <div 
          id="hero-badge"
          className="flex flex-wrap sm:inline-flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-4 py-1.5 rounded-full bg-neutral-950/50 border border-purple-500/30 text-[11px] sm:text-xs font-medium text-purple-300 mb-4 sm:mb-6 backdrop-blur-xl shadow-lg shadow-purple-950/30"
        >
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-white">JawebFlow · 1er Chatbot IA en Algérie 🇩🇿</span>
          <span className="text-neutral-500 hidden sm:inline">|</span>
          <span className="text-neutral-300">Français & Darija 24h/24</span>
        </div>

        {/* Main Headline */}
        <h1 
          id="hero-title"
          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-100 font-display leading-[1.15] mb-4 sm:mb-6 drop-shadow-md break-words"
        >
          Le premier chatbot IA <br />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            conçu pour l'Algérie.
          </span>
        </h1>

        {/* Subtitle */}
        <p 
          id="hero-subtitle"
          className="text-sm sm:text-base md:text-lg text-neutral-200/90 leading-relaxed mb-6 sm:mb-8 font-normal max-w-xl drop-shadow-sm"
        >
          Automatisez votre service client, vos ventes, vos devis et la qualification de vos prospects avec un assistant intelligent qui maîtrise parfaitement le Français et la Darija algérienne 24h/24.
        </p>

        {/* Primary Actions */}
        <div 
          id="hero-cta-group"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto mb-6 sm:mb-8"
        >
          <button
            id="hero-primary-cta"
            onClick={onOpenAssistantModal}
            className="w-full sm:w-auto px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-semibold text-sm sm:text-base shadow-xl shadow-purple-600/35 hover:shadow-purple-600/50 hover:scale-[1.02] active:scale-[0.99] transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <Sparkles className="w-4 h-4 transition-transform group-hover:rotate-12 text-purple-200 shrink-0" />
            <span>Créer mon assistant</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 shrink-0" />
          </button>

          <button
            id="hero-secondary-cta"
            onClick={onScrollToParcours}
            className="w-full sm:w-auto px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-neutral-950/40 hover:bg-neutral-900/60 text-neutral-200 hover:text-white font-medium text-sm sm:text-base border border-white/15 backdrop-blur-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <span>Voir le parcours</span>
          </button>
        </div>

        {/* Business Types Badges & Omnichannel Badges */}
        <div className="space-y-2.5 sm:space-y-3 w-full">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-neutral-400">
            <span className="text-purple-300/90 font-semibold shrink-0">Adapté à 100% des métiers :</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-neutral-950/40 border border-white/10 text-neutral-200">Tout site web</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-neutral-950/40 border border-white/10 text-neutral-200">E-commerce & Retail</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-neutral-950/40 border border-white/10 text-neutral-200">Services & Agences</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-neutral-950/40 border border-white/10 text-neutral-200">Santé & Cabinets</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-neutral-950/40 border border-white/10 text-neutral-200">Immobilier, B2B & Projets sur mesure</span>
          </div>

          <div 
            id="channels-section"
            className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-[11px] sm:text-xs font-medium text-neutral-300 pt-1"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/40 backdrop-blur-xl text-purple-200">
              <Globe className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-purple-300 shrink-0" />
              <span className="font-semibold text-neutral-100">Tout site web</span>
              <span className="px-1 py-0.2 rounded text-[8px] sm:text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase font-bold">Disponible</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl opacity-85">
              <MessageCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-purple-300 shrink-0" />
              <span className="text-neutral-300">WhatsApp</span>
              <span className="px-1 py-0.2 rounded text-[8px] sm:text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-bold">Bientôt</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl opacity-85">
              <Instagram className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-pink-400 shrink-0" />
              <span className="text-neutral-300">Instagram</span>
              <span className="px-1 py-0.2 rounded text-[8px] sm:text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-bold">Bientôt</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
