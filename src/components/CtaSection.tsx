import React from 'react';
import { ArrowRight, ShieldCheck, Clock, Lock, Sparkles } from 'lucide-react';

interface CtaSectionProps {
  onOpenAssistantModal: () => void;
  onNavigate?: (page: string) => void;
}

export const CtaSection: React.FC<CtaSectionProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const goTo = (page: string) => {
    if (onNavigate) onNavigate(page);
    else window.location.href = page === 'home' ? '/' : `/${page}`;
  };

  return (
    <section
      id="cta-section"
      className="relative mx-auto w-full max-w-5xl overflow-hidden px-4 pt-14 sm:px-6 sm:pt-24"
    >

      {/* Dernier moment de décision : on lève le dernier frein, puis on propose une seule action. */}
      <div className="lux-card lux-card-beam relative p-6 text-center sm:p-12 md:p-14">
        <div className="lux-orb left-1/2 top-0 h-64 w-64 -translate-x-1/2 bg-purple-600/25" />

        <div className="relative z-10">
          <span className="lux-eyebrow">
            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
            Dernière étape
          </span>

          <h2 id="cta-title" className="lux-h2 mt-5 break-words">
            Vos clients écrivent maintenant. <br className="hidden sm:inline" />
            <span className="lux-accent">Répondez-leur avant qu’ils aillent ailleurs.</span>
          </h2>

          <p className="lux-lead mx-auto mt-5 max-w-xl">
            Chaque jour sans réponse, ce sont des demandes qui partent chez un concurrent.
            Commencez aujourd’hui : votre assistant peut être en ligne dans 5 minutes.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            <button id="cta-action-btn" onClick={onOpenAssistantModal} className="btn btn-lg btn-primary">
              <span>Créer mon assistant</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => goTo('demo')} className="btn btn-lg btn-glass">
              <span>Voir la démo d’abord</span>
            </button>
          </div>

          <p className="lux-note mt-4 text-[0.8rem]">
            Sans engagement · Aucune carte demandée pour commencer · Vous gardez vos informations
          </p>

          {/* Réassurance finale en trois points */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 border-t border-white/[0.07] pt-7 text-[0.76rem] font-light text-neutral-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-300/80" />
              Pour tout type de site
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-purple-300/80" />
              En ligne en 5 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-purple-300/80" />
              Français & darija
            </span>
          </div>
        </div>
      </div>

    </section>
  );
};
