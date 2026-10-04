import React from 'react';
import { ArrowRight, Globe, MessageCircle, Instagram } from 'lucide-react';
import { HeroInkReveal } from './HeroInkReveal';

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
      className="relative w-full overflow-hidden bg-white md:flex md:min-h-[clamp(620px,56vw,900px)] md:items-center md:rounded-b-[40px]"
    >
      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 pb-8 pt-24 sm:px-10 sm:pt-32 md:px-10 md:pb-16 md:pt-24 lg:px-16">
        <div className="flex w-full flex-col items-start text-left md:max-w-xl lg:max-w-[600px]">
          <div
            id="hero-badge"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs text-purple-800"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            <span>Assistant de discussion pour les entreprises algériennes</span>
          </div>

          <h1
            id="hero-title"
            className="mb-5 text-3xl font-bold leading-[1.12] tracking-tight text-purple-950 sm:text-5xl lg:text-5xl xl:text-6xl 2xl:text-7xl"
          >
            Répondez à vos clients <br />
            <span className="text-purple-600">même quand vous êtes fermé.</span>
          </h1>

          <p
            id="hero-subtitle"
            className="mb-8 max-w-xl text-sm font-normal leading-relaxed text-purple-950/70 sm:text-base md:text-lg"
          >
            Une bulle de discussion sur votre site qui répond en français et en darija :
            prix, livraison, horaires, disponibilité. Et qui vous transmet le numéro
            des clients intéressés.
          </p>

          <div
            id="hero-cta-group"
            className="mb-8 flex w-full flex-col items-stretch gap-3.5 sm:w-auto sm:flex-row sm:items-center"
          >
            <button
              id="hero-primary-cta"
              onClick={onOpenAssistantModal}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-purple-700 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-purple-800 sm:w-auto sm:text-base"
            >
              <span>Créer mon assistant</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>

            <button
              id="hero-secondary-cta"
              onClick={onScrollToParcours}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-purple-200 px-6 py-3.5 text-sm font-medium text-purple-800 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-950 sm:w-auto sm:text-base"
            >
              <span>Comment ça marche</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-purple-900/75">
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-purple-500" />
              Sur votre site, en 5 minutes
            </span>
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-purple-500" />
              Français & darija
            </span>
            <span className="flex items-center gap-2">
              <Instagram className="h-4 w-4 text-purple-500" />
              Aussi sur Instagram
            </span>
          </div>
        </div>
      </div>

      <HeroInkReveal />
    </section>
  );
};
