import React, { useState } from 'react';
import {
  Check,
  X,
  ShieldCheck,
  HelpCircle,
  ArrowRight,
  Zap,
  FileText,
  Lock,
  RefreshCw,
  Info
} from 'lucide-react';
import { PaymentPlanId } from '../types';
import { PLAN_TRUTH, conversationsLabel, QUOTA_EXPLAINER } from '../lib/plans';

interface PricingPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showFaq, setShowFaq] = useState(false);

  // ⚠️ Chaque ligne ci-dessous correspond à quelque chose que le code fait
  // réellement (voir src/lib/plans.ts → PLAN_TRUTH). Ne jamais y ajouter une
  // promesse non implémentée : WhatsApp, par exemple, est annoncé comme
  // « en préparation », jamais comme inclus.
  const plans = [
    {
      id: 'free' as PaymentPlanId,
      name: 'Découverte',
      subtitle: 'Pour tout préparer et voir l’outil de l’intérieur, sans dépenser un dinar.',
      priceUsdMonthly: 0,
      priceDzdMonthly: 0,
      priceUsdYearly: 0,
      priceDzdYearly: 0,
      badge: 'Gratuit',
      isPopular: false,
      features: [
        'Tout le tableau de bord : informations, apparence, tests, statistiques',
        'Installation de la bulle sur votre site',
        'Connexion Instagram possible',
        'Vous voyez exactement ce que verront vos visiteurs',
      ],
      notIncluded: [
        'Réponses automatiques de l’IA',
        'Coordonnées des clients enregistrées',
        'Import automatique de votre site',
      ],
      ctaText: 'Commencer gratuitement',
      action: 'signup' as const,
    },
    {
      id: 'basic' as PaymentPlanId,
      name: 'Basic',
      subtitle: 'Pour arrêter de perdre les demandes qui arrivent en dehors de vos horaires.',
      priceUsdMonthly: 29,
      priceDzdMonthly: 6850,
      priceUsdYearly: 23,
      priceDzdYearly: 5480,
      badge: '100% Web',
      isPopular: false,
      features: [
        `Jusqu’à ${conversationsLabel('basic')} conversations par mois`,
        `Bulle de discussion sur votre site (WordPress, Shopify, Wix, Webflow, sur mesure)`,
        'Vos informations : prix, horaires, livraison, FAQ, catalogues',
        `${PLAN_TRUTH.basic.scans} imports / analyses de votre site par mois`,
        'Coordonnées des clients intéressés enregistrées automatiquement (nom, téléphone, ville)',
        'Français, darija et anglais compris automatiquement',
        'Connexion Instagram : réponses dans vos DM',
        'Facture d’entreprise conforme (NIF, NIS, RC) sur demande',
      ],
      notIncluded: ['WhatsApp (en préparation)'],
      ctaText: 'Choisir Basic',
      action: 'checkout' as const,
    },
    {
      id: 'pro' as PaymentPlanId,
      name: 'Pro / Business',
      subtitle: 'Pour vendre plus : cinq fois le volume, et tout ce que Basic contient déjà.',
      priceUsdMonthly: 79,
      priceDzdMonthly: 18700,
      priceUsdYearly: 63,
      priceDzdYearly: 14960,
      badge: 'Le plus choisi',
      isPopular: true,
      features: [
        `Jusqu’à ${conversationsLabel('pro')} conversations par mois (5× Basic)`,
        `Tous vos sites et tous vos assistants, sans supplément`,
        `Connexion Instagram : réponses dans vos DM`,
        `Coordonnées des clients intéressés enregistrées automatiquement`,
        `${PLAN_TRUTH.pro.scans} imports / analyses de votre site par mois (2× Basic)`,
        'Marge de volume plus large avant la pause automatique de fin de forfait',
        'Assistance prioritaire',
        'Nouveaux canaux en avant-première (WhatsApp en préparation)',
      ],
      notIncluded: [],
      ctaText: 'Choisir Pro',
      action: 'checkout' as const,
    },
    {
      id: 'enterprise' as PaymentPlanId,
      name: 'Enterprise',
      subtitle: 'Pour les réseaux, les franchises et les besoins particuliers.',
      priceUsdMonthly: 199,
      priceDzdMonthly: 47100,
      priceUsdYearly: 159,
      priceDzdYearly: 37680,
      badge: 'Sur-mesure & API',
      isPopular: false,
      features: [
        'Volume très élevé : au-delà de 5 000 conversations par mois',
        `${PLAN_TRUTH.enterprise.scans} imports / analyses de votre site par mois`,
        'Tous vos sites, tous vos assistants, plusieurs langues',
        'Intégrations sur mesure (CRM, outils de gestion, Google Sheets)',
        'Accompagnement dédié et configuration sur site',
        'Devis proforma et convention annuelle adaptés à vos procédures',
      ],
      notIncluded: ['WhatsApp (en préparation)'],
      ctaText: 'Demander une étude',
      action: 'contact' as const,
    }
  ];

  const guarantees = [
    { icon: Lock, text: 'Sans engagement de durée' },
    { icon: RefreshCw, text: 'Changez ou arrêtez en un clic' },
    { icon: ShieldCheck, text: 'Vos données restent les vôtres' },
  ];

  const faqs = [
    {
      q: 'Comment se règle l’abonnement ?',
      a: 'Par carte bancaire, virement ou selon les procédures de facturation de votre entreprise, avec devis proforma et facture conforme (NIF, NIS, RC, RIB) si vous le souhaitez.'
    },
    {
      q: 'Le plan gratuit répond-il vraiment à mes clients ?',
      a: 'Non, et c’est volontaire : le plan Découverte sert à tout préparer (informations, apparence, tests, installation) sans payer. Les réponses automatiques de l’IA s’activent dès que vous passez sur Basic, Pro ou Enterprise. Un visiteur qui écrit reçoit alors un message l’informant que l’assistant n’est pas encore activé — jamais une erreur technique.'
    },
    {
      q: 'Comment se compte une « conversation » ?',
      a: QUOTA_EXPLAINER + ' Le quota se remet à zéro le 1er de chaque mois.'
    },
    {
      q: 'Que se passe-t-il si j’atteins la limite du mois ?',
      a: 'L’assistant se met en pause automatiquement et le visiteur reçoit un message courtois. Aucune facture surprise : vous êtes prévenu dans votre tableau de bord, et tout reprend le 1er du mois suivant. Vous pouvez aussi passer à la formule supérieure en un clic.'
    },
    {
      q: 'Instagram et WhatsApp sont-ils inclus ?',
      a: 'Instagram est disponible dès la formule Basic : vous connectez votre compte et l’assistant répond dans vos DM avec vos informations. WhatsApp Business est encore en préparation : les abonnés Pro et Enterprise seront activés dès sa sortie, sans changement de prix.'
    },
    {
      q: 'Puis-je commencer en Basic et passer en Pro ensuite ?',
      a: 'Oui, à tout moment et en un clic, sans perdre vos informations ni votre historique.'
    },
    {
      q: 'Faut-il des compétences techniques pour installer le widget ?',
      a: 'Non : une seule ligne de code fournie, prête à coller (Shopify, WordPress, Webflow, React, HTML). Notre équipe peut aussi le faire pour vous.'
    }
  ];

  const startPlan = (plan: typeof plans[number]) => {
    if (plan.action === 'signup') {
      onOpenAssistantModal();
      return;
    }
    if (plan.action === 'contact') {
      onNavigate('contact');
      return;
    }
    window.history.pushState({}, '', `/checkout?plan=${plan.id}&cycle=${billingCycle}`);
    onNavigate('checkout');
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-14 px-6 pb-20 pt-28 sm:px-10 lg:px-16">
      {/* Header */}
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <span className="lux-eyebrow">
          <Zap className="h-3.5 w-3.5 text-purple-300" />
          Tarifs clairs, sans petite ligne cachée
        </span>
        <h1 className="lux-h1">
          Un assistant qui travaille jour et nuit <br />
          <span className="lux-accent">pour moins de 250 DA par jour.</span>
        </h1>
        <p className="lux-lead mx-auto max-w-2xl">
          Commencez gratuitement, puis payez seulement quand votre assistant vous rapporte
          des clients. Sans engagement : vous changez de formule ou vous arrêtez quand vous voulez.
        </p>

        {/* Billing Switch */}
        <div className="flex justify-center pt-3">
          <div className="lux-switch">
            <button
              onClick={() => setBillingCycle('monthly')}
              aria-pressed={billingCycle === 'monthly'}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              aria-pressed={billingCycle === 'yearly'}
            >
              <span className="flex items-center gap-2">
                Annuel
                <span className="rounded-md bg-purple-200 px-1.5 py-0.5 text-[0.6rem] font-bold text-purple-950">
                  -20%
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isYearly = billingCycle === 'yearly';
          const priceUsd = isYearly ? plan.priceUsdYearly : plan.priceUsdMonthly;
          const priceDzd = isYearly ? plan.priceDzdYearly : plan.priceDzdMonthly;

          return (
            <div
              key={plan.id}
              className={`lux-card flex flex-col justify-between p-6 transition-colors sm:p-7 ${
                plan.isPopular ? 'border-purple-400/35 bg-purple-500/[0.07]' : 'lux-card-hover'
              }`}
            >
              <div>
                {plan.isPopular ? (
                  <div className="mb-4 self-start rounded-full border border-purple-400/35 bg-purple-500/15 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-purple-100">
                    {plan.badge}
                  </div>
                ) : (
                  <div className="mb-4 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    {plan.badge}
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <h3 className="lux-h3 text-[1.15rem]">{plan.name}</h3>
                    <p className="lux-sub mt-1.5 min-h-[42px] text-[0.8rem]">{plan.subtitle}</p>
                  </div>

                  <div className="space-y-1.5 border-b border-white/[0.07] pb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[2rem] font-extrabold tracking-[-0.04em] text-white">
                        {priceUsd} $
                      </span>
                      <span className="text-[0.72rem] font-light text-neutral-500">/ mois</span>
                    </div>

                    <div className="text-[0.76rem] font-light text-purple-200">
                      {priceDzd === 0 ? 'Gratuit — pour toujours' : `≈ ${priceDzd.toLocaleString('fr-FR')} DZD / mois`}
                    </div>

                    {isYearly && priceUsd > 0 && (
                      <span className="block text-[0.7rem] font-light text-neutral-500">
                        Facturé annuellement (-20% de remise)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="block text-[0.66rem] font-medium uppercase tracking-[0.14em] text-neutral-500">
                      Ce que vous obtenez
                    </span>
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2.5 text-[0.8rem] font-light leading-relaxed text-neutral-300">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  {plan.notIncluded.length > 0 && (
                    <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
                      <span className="block text-[0.66rem] font-medium uppercase tracking-[0.14em] text-neutral-600">
                        Non inclus
                      </span>
                      {plan.notIncluded.map((item) => (
                        <div key={item} className="flex items-start gap-2.5 text-[0.78rem] font-light leading-relaxed text-neutral-500">
                          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-7">
                <button
                  onClick={() => startPlan(plan)}
                  className={`btn btn-block ${plan.isPopular || plan.action === 'checkout' ? 'btn-primary' : 'btn-glass'}`}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comment le compteur marche vraiment : la transparence évite les litiges */}
      <div className="lux-card flex items-start gap-3.5 p-5 sm:p-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
        <div className="space-y-1.5">
          <h2 className="text-[0.86rem] font-semibold text-white">Comment se compte une conversation ?</h2>
          <p className="lux-sub text-[0.82rem]">{QUOTA_EXPLAINER}</p>
          <p className="lux-note text-[0.76rem]">
            Le compteur se remet à zéro le 1er de chaque mois. Quand la limite est atteinte, l’assistant
            se met en pause proprement et reprend tout seul le mois suivant — sans facture surprise.
          </p>
        </div>
      </div>

      {/* Réassurance juste sous les prix */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[0.78rem] font-light text-neutral-400">
        {guarantees.map((g) => (
          <span key={g.text} className="flex items-center gap-2">
            <g.icon className="h-3.5 w-3.5 text-purple-300/80" />
            {g.text}
          </span>
        ))}
      </div>

      {/* Enterprise Proforma Callout */}
      <div className="lux-card lux-card-hover flex flex-col items-center justify-between gap-6 p-7 sm:flex-row sm:p-9">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="lux-h3 text-[1rem] sm:text-[1.15rem]">
              Besoin d’un bon de commande ou d’une convention annuelle ?
            </h2>
            <p className="lux-sub mt-1 text-[0.84rem]">
              Nous établissons des devis proforma officiels et des contrats adaptés aux procédures de votre entreprise.
            </p>
          </div>
        </div>
        <button onClick={() => onNavigate('contact')} className="btn btn-glass w-full whitespace-nowrap sm:w-auto">
          Demander une proforma
        </button>
      </div>

      {/* FAQ Accordion Toggle */}
      <div className="flex flex-col items-center justify-center">
        <button
          onClick={() => setShowFaq(!showFaq)}
          aria-expanded={showFaq}
          className="btn btn-glass"
        >
          <span>{showFaq ? 'Masquer les questions fréquentes' : 'Afficher les questions fréquentes (FAQ)'}</span>
          <ArrowRight className={`h-4 w-4 transition-transform duration-300 ${showFaq ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {showFaq && (
        <div className="animate-in fade-in slide-in-from-top-4 space-y-6 pt-2 duration-300">
          <div className="space-y-3 text-center">
            <h2 className="lux-h3 text-[1.3rem] sm:text-[1.7rem]">Questions fréquentes sur les tarifs</h2>
            <p className="lux-sub text-[0.86rem]">Tout ce que vous devez savoir avant de commencer.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.q} className="lux-card p-6">
                <h3 className="flex items-start gap-2 text-[0.88rem] font-semibold text-neutral-100">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
                  <span>{faq.q}</span>
                </h3>
                <p className="lux-sub mt-2.5 whitespace-pre-line pl-6 text-[0.82rem]">{faq.a}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <p className="lux-note text-[0.82rem]">
              Une question sur un volume précis ou un besoin particulier ? Nous vous répondons sous 2 heures ouvrées.
            </p>
            <button onClick={() => onNavigate('contact')} className="btn btn-primary">
              <span>Parler à l’équipe</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
