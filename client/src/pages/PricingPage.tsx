import React, { useState } from 'react';
import { 
  Check, 
  Sparkles, 
  ShieldCheck, 
  HelpCircle, 
  ArrowRight, 
  Zap, 
  Building2, 
  FileText,
  CreditCard
} from 'lucide-react';

interface PricingPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      name: 'Plan Basic',
      subtitle: 'Idéal pour intégrer votre premier assistant sur votre site web',
      priceUsdMonthly: 29,
      priceDzdMonthly: 6850,
      priceUsdYearly: 23,
      priceDzdYearly: 5480,
      badge: '100% Web (Disponible)',
      isPopular: false,
      features: [
        'Widget Web universel (compatible tout site : Shopify, WordPress, Webflow, custom...)',
        'Jusqu’à 1 000 conversations par mois',
        'Support de la base de connaissances (FAQ, catalogue produits, consignes)',
        'Compréhension naturelle multilingue (Français, Darija, Anglais)'
      ],
      ctaText: 'Choisir le Plan Basic',
    },
    {
      name: 'Plan Pro / Business',
      subtitle: 'Pour commerces & entreprises voulant le Web + accès prioritaire aux réseaux',
      priceUsdMonthly: 79,
      priceDzdMonthly: 18700,
      priceUsdYearly: 63,
      priceDzdYearly: 14960,
      badge: 'Le plus populaire',
      isPopular: true,
      features: [
        'Widget Web illimité pour tout site web',
        'Accès anticipé WhatsApp & Réseaux sociaux (Prochainement)',
        'Jusqu’à 5 000 conversations par mois',
        'Détection automatique des leads & coordonnées clients (Nom, téléphone, ville/adresse)',
        'Support prioritaire et IA optimisée pour la conversion'
      ],
      ctaText: 'Choisir le Plan Pro',
    },
    {
      name: 'Plan Enterprise',
      subtitle: 'Pour grandes structures, réseaux & architectures sur-mesure',
      priceUsdMonthly: 199,
      priceDzdMonthly: 47100,
      priceUsdYearly: 159,
      priceDzdYearly: 37680,
      badge: 'Sur-mesure & API',
      isPopular: false,
      features: [
        'Widget Web complet pour l\'ensemble de vos sites',
        'Tous les canaux inclus (Web actif + WhatsApp/Réseaux dès disponibilité)',
        'Conversations illimitées / volume élevé',
        'Intégrations sur mesure (CRM, outils de gestion et Google Sheets)',
        'Accompagnement dédié et configuration sur site'
      ],
      ctaText: 'Demander Enterprise',
    }
  ];

  const faqs = [
    {
      q: 'Comment s’effectue le règlement des forfaits ?',
      a: 'Le règlement peut être effectué par Carte bancaire, virement, ou selon vos préférences de facturation d’entreprise avec devis et reçu conforme.'
    },
    {
      q: 'Fournissez-vous une facture d’entreprise conforme ?',
      a: 'Oui, absolument. Nous délivrons pour chaque compte professionnel une facture proforma puis définitive mentionnant toutes les coordonnées légales et fiscales complètes.'
    },
    {
      q: 'Quand seront disponibles WhatsApp et les réseaux sociaux ?',
      a: 'L\'intégration pour tous les sites web est 100% opérationnelle dès aujourd\'hui. Les modules WhatsApp Business et messageries réseaux sociaux sont en phase de déploiement final et seront automatiquement activés pour les abonnés Pro et Enterprise.'
    },
    {
      q: 'Puis-je commencer en Basic et basculer en Pro ultérieurement ?',
      a: 'Oui, vous pouvez faire évoluer votre formule à tout moment en un clic pour augmenter votre volume et activer les nouveaux canaux dès leur sortie.'
    },
    {
      q: 'L’installation du widget web nécessite-t-elle des compétences en code ?',
      a: 'Non, c’est une seule ligne de code fournie prête à coller sur votre site (Shopify, WordPress, Webflow, React, HTML). Notre équipe technique peut également vous l’intégrer gratuitement.'
    }
  ];

  return (
    <div className="pt-28 pb-20 px-4 sm:px-6 max-w-6xl mx-auto space-y-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span>Formules transparentes & Facturation flexible</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100">
          Choisissez la formule adaptée à <br />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            vos canaux et vos objectifs.
          </span>
        </h1>
        <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          Intégrez votre assistant dès aujourd'hui sur votre site web (WordPress, Shopify, Webflow ou personnalisé). Canaux WhatsApp et Réseaux sociaux disponibles très prochainement.
        </p>

        {/* Billing Switch */}
        <div className="pt-4 flex items-center justify-center gap-3">
          <div className="p-1 rounded-2xl bg-neutral-950/50 border border-white/10 backdrop-blur-xl flex items-center">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Facturation mensuelle
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <span>Facturation annuelle</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-300 text-purple-950 font-bold">
                -20%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan, idx) => {
          const isYearly = billingCycle === 'yearly';
          const priceUsd = isYearly ? plan.priceUsdYearly : plan.priceUsdMonthly;
          const priceDzd = isYearly ? plan.priceDzdYearly : plan.priceDzdMonthly;

          const tiltClass = idx === 0 
            ? 'hover:-translate-y-3 hover:-rotate-[1deg]' 
            : idx === 1 
              ? 'hover:-translate-y-4 hover:scale-[1.02]' 
              : 'hover:-translate-y-3 hover:rotate-[1deg]';

          return (
            <div 
              key={idx}
              className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between backdrop-blur-2xl card-hover-tilt-glow ${tiltClass} overflow-hidden group cursor-default ${
                plan.isPopular
                  ? 'bg-gradient-to-b from-purple-950/50 via-neutral-950/70 to-indigo-950/50 border-2 border-purple-500/60 shadow-2xl shadow-purple-950/50 md:-translate-y-2'
                  : 'bg-neutral-950/40 border border-white/10'
              }`}
            >
              {/* Specular light gleam on hover */}
              <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/15 to-white/10" />

              {plan.isPopular && (
                <div className="relative z-10 -mt-2 mb-2 self-center px-3.5 py-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[11px] font-bold tracking-wide uppercase shadow-lg shadow-purple-600/40 whitespace-nowrap group-hover:shadow-[0_0_15px_rgba(168,85,247,0.6)] transition-all">
                  {plan.badge}
                </div>
              )}

              <div className="relative z-10 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-neutral-100 font-display group-hover:text-purple-200 transition-colors">{plan.name}</h3>
                  <p className="text-xs text-neutral-300 mt-1 min-h-[32px]">{plan.subtitle}</p>
                </div>

                <div className="pt-2 pb-4 border-b border-white/10 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white font-display group-hover:scale-105 transition-transform origin-left inline-block">
                      {priceUsd} $
                    </span>
                    <span className="text-xs text-neutral-400">/ mois</span>
                  </div>
                  
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-semibold group-hover:bg-purple-500/25 group-hover:border-purple-400/50 transition-colors">
                    <span>~{priceDzd.toLocaleString('fr-FR')} DZD / mois</span>
                  </div>

                  {isYearly && (
                    <span className="text-[11px] text-purple-300/80 mt-1 block">
                      Facturé annuellement (-20% de remise)
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">Ce qu'il y a dans le pack :</span>
                  {plan.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5 text-xs text-neutral-300 leading-relaxed">
                      <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5 group-hover:text-purple-300 transition-colors" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative z-10 pt-8">
                <button
                  onClick={onOpenAssistantModal}
                  className={`w-full py-3.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    plan.isPopular
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/40 hover:shadow-purple-500/60'
                      : 'bg-neutral-900/60 hover:bg-neutral-800 text-neutral-200 border border-white/10 hover:border-purple-500/50'
                  }`}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise Proforma Callout */}
      <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-1.5 flex flex-col sm:flex-row items-center justify-between gap-6 group overflow-hidden relative">
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 flex-shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-neutral-100 font-display group-hover:text-purple-200 transition-colors">Besoin d'un bon de commande ou d'une convention annuelle ?</h4>
            <p className="text-xs sm:text-sm text-neutral-300 mt-0.5">
              Nous établissons des devis proforma officiels et des contrats de service adaptés aux procédures de votre entreprise.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('contact')}
          className="relative z-10 w-full sm:w-auto px-5 py-3 rounded-2xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 border border-white/10 hover:border-purple-400/40 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
        >
          Demander une proforma
        </button>
      </div>

      {/* FAQ Section */}
      <div className="space-y-6 pt-4">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold text-neutral-100 font-display">Questions fréquentes sur les tarifs</h3>
          <p className="text-xs sm:text-sm text-neutral-400">Tout ce que vous devez savoir avant de commencer.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {faqs.map((faq, idx) => (
            <div 
              key={idx}
              className="p-6 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2 hover:border-purple-500/30 transition-colors"
            >
              <h4 className="text-sm font-semibold text-neutral-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs text-neutral-300 leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
