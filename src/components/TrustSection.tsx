import React from 'react';
import { Moon, TrendingUp, Lock, Wallet, Check, X, ArrowRight, ShieldCheck } from 'lucide-react';

interface TrustSectionProps {
  onOpenAssistantModal: () => void;
  onNavigate?: (page: string) => void;
}

/**
 * Section « ce que ça change » : elle répond à la seule question qui compte
 * pour un commerçant — « qu'est-ce que j'y gagne, et qu'est-ce que je risque ? ».
 * Aucun chiffre inventé : uniquement ce que le produit fait réellement.
 */
export const TrustSection: React.FC<TrustSectionProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const benefits = [
    {
      icon: Moon,
      title: 'Vous ne perdez plus une seule demande',
      text: "Un client qui écrit à 22h, un dimanche ou pendant vos heures de pointe reçoit sa réponse tout de suite. Vous n'avez plus à choisir entre travailler et vendre.",
    },
    {
      icon: TrendingUp,
      title: 'Vous ne répondez qu’aux clients prêts',
      text: "L’assistant pose les bonnes questions, rassure et récupère le nom, le téléphone et la ville. Vous rappelez uniquement les personnes qui veulent vraiment acheter.",
    },
    {
      icon: Lock,
      title: 'Vous gardez la main sur chaque mot',
      text: "Vos prix, vos délais, vos conditions. S’il ne sait pas, il ne devine pas : il vous transmet la question. Votre image reste impeccable.",
    },
    {
      icon: Wallet,
      title: 'Vous ne payez pas un salaire de plus',
      text: "Pas de recrutement, pas de formation, pas d’absence. Un abonnement clair, sans engagement, que vous arrêtez quand vous voulez.",
    },
  ];

  const comparison = [
    { without: 'Une demande client sans réponse à 22h', withIt: 'Une réponse immédiate, en français ou en darija' },
    { without: 'Vous répétez les mêmes prix 40 fois par jour', withIt: 'L’assistant répond, vous validez les ventes' },
    { without: 'Des devis « à suivre » qui ne reviennent jamais', withIt: 'Le contact du client dans votre espace, prêt à rappeler' },
    { without: 'Un formulaire de contact qui dort', withIt: 'Une conversation qui se termine par « je commande »' },
  ];

  return (
    <section id="benefices-section" className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-24">
      {/* En-tête de section */}
      <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
        <span className="lux-eyebrow">
          <ShieldCheck className="h-3.5 w-3.5 text-purple-300" />
          Ce que ça change pour vous
        </span>

        <h2 className="lux-h2 mt-5">
          Le vrai coût, ce n’est pas l’abonnement. <br className="hidden sm:inline" />
          <span className="lux-accent">Ce sont les clients qui partent sans réponse.</span>
        </h2>

        <p className="lux-lead mx-auto mt-5 max-w-2xl">
          Chaque message laissé sans réponse est une vente offerte à quelqu’un d’autre.
          JawebFlow répond dès la première seconde, jour et nuit, et vous transmet
          uniquement les contacts qui comptent.
        </p>
      </div>

      {/* Bénéfices concrets */}
      <div className="grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-2">
        {benefits.map((benefit) => (
          <div key={benefit.title} className="lux-card lux-card-hover lux-card-beam p-6 sm:p-7">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
              <benefit.icon className="h-4.5 w-4.5" />
            </div>
            <h3 className="lux-h3 text-[1.02rem] sm:text-[1.1rem]">{benefit.title}</h3>
            <p className="lux-sub mt-2 text-[0.86rem] sm:text-[0.9rem]">{benefit.text}</p>
          </div>
        ))}
      </div>

      {/* Avant / Après : la comparaison que tout le monde comprend */}
      <div className="lux-card mt-4 grid grid-cols-1 divide-y divide-white/[0.07] md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-500">
            <X className="h-3.5 w-3.5" />
            Sans JawebFlow
          </div>
          <ul className="space-y-3.5">
            {comparison.map((row) => (
              <li key={row.without} className="flex items-start gap-3 text-[0.84rem] font-light leading-relaxed text-neutral-500">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
                <span>{row.without}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative bg-purple-500/[0.05] p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-purple-200">
            <Check className="h-3.5 w-3.5" />
            Avec JawebFlow
          </div>
          <ul className="space-y-3.5">
            {comparison.map((row) => (
              <li key={row.withIt} className="flex items-start gap-3 text-[0.86rem] font-light leading-relaxed text-neutral-200">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
                <span>{row.withIt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Renversement du risque : la phrase qui débloque la décision */}
      <div className="mt-8 flex flex-col items-center gap-4 text-center sm:mt-10">
        <p className="lux-note max-w-2xl text-[0.86rem]">
          Sans engagement. Installation en 5 minutes. Vos informations restent les vôtres —
          et votre assistant ne dit jamais rien que vous ne lui avez pas appris.
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <button onClick={onOpenAssistantModal} className="btn btn-primary">
            <span>Créer mon assistant maintenant</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          {onNavigate && (
            <button onClick={() => onNavigate('pricing')} className="btn btn-glass">
              <span>Voir les tarifs</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
