import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Heart } from 'lucide-react';

interface CtaSectionProps {
  onOpenAssistantModal: () => void;
  onNavigate?: (page: string) => void;
}

export const CtaSection: React.FC<CtaSectionProps> = ({ onOpenAssistantModal, onNavigate }) => {
  return (
    <section 
      id="cta-section"
      className="relative py-14 sm:py-28 px-4 sm:px-6 max-w-5xl mx-auto text-center w-full overflow-hidden"
    >
      {/* Container with High-End Glass & Subtle Purple Glow */}
      <div className="relative rounded-2xl sm:rounded-3xl bg-neutral-950/35 border border-white/15 p-6 sm:p-12 md:p-14 backdrop-blur-2xl shadow-2xl shadow-purple-950/40 overflow-hidden">
        {/* Ambient Top Light Beam */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400 to-transparent"></div>
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 sm:w-80 h-72 sm:h-80 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Section Tag */}
        <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[11px] sm:text-xs font-semibold text-purple-300 mb-4 sm:mb-6 backdrop-blur-xl">
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Prêt à commencer</span>
        </div>

        {/* Heading */}
        <h2 
          id="cta-title"
          className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-100 font-display mb-4 sm:mb-6 leading-tight max-w-3xl mx-auto break-words"
        >
          Donnez à votre business <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            une réponse qui lui ressemble.
          </span>
        </h2>

        <p className="text-sm sm:text-base md:text-lg text-neutral-200/90 max-w-xl mx-auto mb-6 sm:mb-10 leading-relaxed font-normal drop-shadow-sm">
          Vos clients méritent des réponses précises et instantanées à toute heure, dans leur langue et selon vos règles.
        </p>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <button
            id="cta-action-btn"
            onClick={onOpenAssistantModal}
            className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-bold text-sm sm:text-base shadow-xl shadow-purple-600/35 hover:shadow-purple-600/50 hover:scale-[1.02] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-200 shrink-0" />
            <span>Créer mon assistant</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Security & Reliability micro-labels */}
        <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-white/10 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[11px] sm:text-xs text-neutral-300">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400 shrink-0" />
            Calibré pour tout site web & business
          </span>
          <span className="hidden sm:inline">•</span>
          <span>Support multilingue</span>
          <span className="hidden sm:inline">•</span>
          <span>Intégration en 1 ligne</span>
        </div>
      </div>

      {/* Footer Branding & Legal Links */}
      <footer className="mt-12 sm:mt-20 pt-6 sm:pt-8 pb-10 sm:pb-12 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-400 gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <img 
            src="https://i.ibb.co/zVGSpyTS/jawebflow.png" 
            alt="Logo" 
            className="h-5 sm:h-6 w-auto object-contain brightness-0 invert opacity-80"
            referrerPolicy="no-referrer"
          />
          <span>·</span>
          <span className="text-[11px] sm:text-xs font-medium text-neutral-300">1er Chatbot IA en Algérie 🇩🇿 pour sites web & entreprises</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-neutral-400 text-[11px]">
          {onNavigate ? (
            <>
              <button 
                onClick={() => onNavigate('privacy')} 
                className="hover:text-purple-300 transition-colors cursor-pointer underline underline-offset-4"
              >
                Confidentialité
              </button>
              <button 
                onClick={() => onNavigate('terms')} 
                className="hover:text-purple-300 transition-colors cursor-pointer underline underline-offset-4"
              >
                Conditions
              </button>
              <button 
                onClick={() => onNavigate('data-deletion')} 
                className="hover:text-purple-300 transition-colors cursor-pointer underline underline-offset-4"
              >
                Suppression des données
              </button>
            </>
          ) : (
            <>
              <a href="/privacy" className="hover:text-purple-300 transition-colors">Confidentialité</a>
              <a href="/terms" className="hover:text-purple-300 transition-colors">Conditions</a>
              <a href="/data-deletion" className="hover:text-purple-300 transition-colors">Suppression des données</a>
            </>
          )}
        </div>
      </footer>
    </section>
  );
};
