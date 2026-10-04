import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ArrowRight, Sparkles } from 'lucide-react';

interface FaqSectionProps {
  onOpenAssistantModal: () => void;
  onNavigate?: (page: string) => void;
}

/**
 * Les questions qu'un client se pose juste AVANT de dire oui.
 * Chaque réponse lève une objection précise (prix, délai, risques, données).
 */
const FAQ_ITEMS = [
  {
    q: 'En combien de temps mon assistant est-il en ligne ?',
    a: "En 5 minutes environ : vous créez votre espace, vous ajoutez vos informations (texte, PDF, Excel ou lien de votre site), puis vous collez une seule ligne de code sur votre site. Si vous préférez, notre équipe installe tout pour vous.",
  },
  {
    q: 'Que se passe-t-il s’il ne connaît pas la réponse ?',
    a: "Il ne répond jamais au hasard. Il indique poliment au visiteur qu'il transmet la question et vous recevez sa demande — avec son contact si le client l'a laissé. Vous gardez donc toujours la main, sans risque pour votre image.",
  },
  {
    q: 'Est-ce qu’il comprend vraiment la darija ?',
    a: "Oui. Il comprend et répond en darija écrite en lettres latines (Arabizi), en caractères arabes, en français et en anglais. Il s'adapte automatiquement à la langue utilisée par le visiteur.",
  },
  {
    q: 'Faut-il appeler un développeur ou changer de site ?',
    a: "Non. Il fonctionne sur WordPress, WooCommerce, Shopify, Wix, Webflow, React, Next.js ou un site sur mesure, avec une ligne de code à coller une seule fois. Aucun ralentissement de votre site.",
  },
  {
    q: 'Puis-je arrêter quand je veux ?',
    a: "Oui, aucun engagement de durée. Vous pouvez changer de formule ou arrêter à tout moment, et vous gardez l'ensemble de vos informations.",
  },
  {
    q: 'Mes informations et celles de mes clients sont-elles protégées ?',
    a: "Vos données servent uniquement à répondre à vos visiteurs. Vos coordonnées clients restent dans votre espace, et nous ne les revendons jamais. Le détail est disponible dans notre politique de confidentialité.",
  },
  {
    q: 'Combien ça coûte réellement ?',
    a: "Vous commencez gratuitement pour tester. Ensuite, la formule Basic démarre à 6 850 DA (~29 $) par mois, la Pro à 18 700 DA (~79 $) par mois pour les volumes plus élevés et l'accès anticipé aux canaux réseaux sociaux. Facture d'entreprise conforme disponible sur demande.",
  },
  {
    q: 'Et si je veux un devis ou une facture pour ma société ?',
    a: "Nous établissons un devis proforma et une facture conforme (NIF, NIS, RC, RIB) adaptés aux procédures de votre entreprise. Il suffit de nous écrire depuis la page Contact.",
  },
];

export const FaqSection: React.FC<FaqSectionProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq-section" className="relative mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-24">
      <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
        <span className="lux-eyebrow">
          <HelpCircle className="h-3.5 w-3.5 text-purple-300" />
          Questions fréquentes
        </span>
        <h2 className="lux-h2 mt-5">
          Vous hésitez encore ? <span className="lux-accent">Voici les vraies réponses.</span>
        </h2>
        <p className="lux-lead mt-4">
          Tout ce qu’on nous demande avant de commencer — sans jargon et sans petite ligne cachée.
        </p>
      </div>

      <div className="space-y-2.5">
        {FAQ_ITEMS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={item.q} className={`lux-card transition-colors duration-300 ${isOpen ? 'border-purple-400/25' : ''}`}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                aria-expanded={isOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span className={`text-[0.88rem] font-semibold leading-snug transition-colors sm:text-[0.95rem] ${isOpen ? 'text-white' : 'text-neutral-200'}`}>
                  {item.q}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-purple-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <div className="lux-divider mb-4" />
                  <p className="lux-sub text-[0.84rem] sm:text-[0.88rem]">{item.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <p className="lux-note flex items-center gap-2 text-[0.84rem]">
          <Sparkles className="h-3.5 w-3.5 text-purple-300" />
          Il reste une question ? Écrivez-nous, on répond sous 2 heures ouvrées.
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <button onClick={onOpenAssistantModal} className="btn btn-primary">
            <span>Commencer gratuitement</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          {onNavigate && (
            <button onClick={() => onNavigate('contact')} className="btn btn-glass">
              <span>Parler à l’équipe</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
