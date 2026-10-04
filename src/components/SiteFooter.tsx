import React from 'react';
import { ArrowRight, Mail, Phone, Sparkles, MapPin } from 'lucide-react';

interface SiteFooterProps {
  onOpenAssistantModal?: () => void;
  onNavigate?: (page: string) => void;
  /**
   * Dernier appel à l'action dans le pied de page. Désactivé sur l'accueil :
   * la grande section « Offrez à votre entreprise… » juste au-dessus joue déjà
   * ce rôle, deux appels identiques collés l'un sous l'autre affaiblissent le message.
   */
  showCallToAction?: boolean;
}

/**
 * Pied de page commun à TOUTES les pages publiques.
 * Il porte les trois choses qu'un visiteur cherche en bas de page :
 * de quoi nous joindre, les pages utiles, et un dernier appel à l'action.
 */
export const SiteFooter: React.FC<SiteFooterProps> = ({ onOpenAssistantModal, onNavigate, showCallToAction = true }) => {
  const productLinks = [
    { label: 'Services', page: 'services' },
    { label: 'Tarifs', page: 'pricing' },
    { label: 'Démo en direct', page: 'demo' },
  ];

  const companyLinks = [
    { label: 'Nous contacter', page: 'contact' },
    { label: 'Confidentialité', page: 'privacy' },
    { label: 'Conditions', page: 'terms' },
    { label: 'Suppression des données', page: 'data-deletion' },
  ];

  const goTo = (page: string) => {
    if (onNavigate) onNavigate(page);
    else window.location.href = page === 'home' ? '/' : `/${page}`;
  };

  return (
    <footer className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-16 sm:px-10 sm:pt-24">
      {/* Dernier appel à l'action, discret mais toujours présent. */}
      {showCallToAction && (
        <div className="lux-card lux-card-beam relative mb-14 flex flex-col items-center gap-5 p-7 text-center sm:p-10">
          <div className="lux-orb left-1/2 top-0 h-52 w-52 -translate-x-1/2 bg-purple-600/25" />
          <div className="relative z-10 space-y-3">
            <span className="lux-eyebrow">
              <Sparkles className="h-3.5 w-3.5 text-purple-300" />
              Dernière étape
            </span>
            <h2 className="lux-h3 text-[1.35rem] sm:text-[1.8rem]">
              Vos clients écrivent maintenant. <br className="hidden sm:inline" />
              <span className="lux-accent">Répondez-leur avant qu’ils aillent ailleurs.</span>
            </h2>
            <p className="lux-sub mx-auto max-w-xl text-[0.86rem]">
              Votre assistant peut être en ligne dans 5 minutes. Sans engagement, sans carte bancaire,
              et vous gardez la main sur chaque information.
            </p>
          </div>
          <div className="relative z-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button onClick={onOpenAssistantModal} className="btn btn-primary">
              <span>Créer mon assistant</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => goTo('pricing')} className="btn btn-glass">
              <span>Voir les tarifs</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <img src="/logo.jpg" alt="JawebFlow" className="h-8 w-auto rounded-lg object-cover" />
            <span className="text-[0.95rem] font-bold tracking-[-0.02em] text-white">JawebFlow</span>
          </div>
          <p className="lux-sub mt-3 max-w-sm text-[0.84rem]">
            L’assistant conversationnel qui répond à vos clients en français et en darija,
            jour et nuit, sur votre site web.
          </p>
          <p className="lux-note mt-3 text-[0.76rem]">
            Conçu en Algérie 🇩🇿 · Facture d’entreprise conforme (NIF, NIS, RC)
          </p>

          <div className="mt-5 space-y-2 text-[0.8rem] font-light text-neutral-400">
            <a href="mailto:contact@jawebflow.dz" className="flex items-center gap-2 transition-colors hover:text-purple-200">
              <Mail className="h-3.5 w-3.5 text-purple-300/80" />
              contact@jawebflow.dz
            </a>
            <span className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-purple-300/80" />
              +213 (0) 550 00 00 00
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-purple-300/80" />
              Alger · Oran · Constantine — partout en Algérie
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-500">Le produit</h3>
          <ul className="mt-4 space-y-2.5">
            {productLinks.map((link) => (
              <li key={link.page}>
                <button
                  onClick={() => goTo(link.page)}
                  className="cursor-pointer text-[0.84rem] font-light text-neutral-400 transition-colors hover:text-purple-200"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-500">Entreprise</h3>
          <ul className="mt-4 space-y-2.5">
            {companyLinks.map((link) => (
              <li key={link.page}>
                <button
                  onClick={() => goTo(link.page)}
                  className="cursor-pointer text-[0.84rem] font-light text-neutral-400 transition-colors hover:text-purple-200"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-6 sm:flex-row">
        <p className="text-[0.72rem] font-light text-neutral-500">
          © {new Date().getFullYear()} JawebFlow — Assistant conversationnel pour sites web & entreprises en Algérie.
        </p>
        <button
          onClick={onOpenAssistantModal}
          className="cursor-pointer text-[0.78rem] font-medium text-purple-300 transition-colors hover:text-purple-200"
        >
          Créer mon assistant →
        </button>
      </div>
    </footer>
  );
};
