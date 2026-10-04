import React from 'react';
import { Database, UploadCloud, Cpu, MessageSquare, Lock, RefreshCw } from 'lucide-react';

export const KnowledgeBaseSection: React.FC = () => {
  const steps = [
    {
      icon: UploadCloud,
      title: '1. Vous déposez vos informations',
      text: 'Fiches de services, catalogues, tableaux Excel, conditions de vente ou simples notes : tout ce que vous diriez à un client au comptoir.',
    },
    {
      icon: Cpu,
      title: '2. Votre assistant les retient',
      text: 'Il assimile vos tarifs, vos délais et votre façon de parler, puis répond avec précision en français, en darija et en anglais.',
    },
    {
      icon: MessageSquare,
      title: '3. Il répond à votre place',
      text: 'Sur votre site, il renseigne, rassure et recueille le contact des clients intéressés — sans jamais inventer une information.',
    },
  ];

  const guarantees = [
    { icon: Lock, title: 'Vos informations restent les vôtres', text: 'Elles servent uniquement à répondre à vos visiteurs. Aucune revente, aucun partage.' },
    { icon: RefreshCw, title: 'Tout se met à jour en un clic', text: 'Vous changez un prix ou une condition : votre assistant suit immédiatement.' },
    { icon: MessageSquare, title: 'Il n’invente jamais rien', text: 'S’il ne sait pas, il vous transmet la question au lieu de répondre au hasard.' },
  ];

  return (
    <section
      id="knowledge-section"
      className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-24"
    >
      {/* Section Header */}
      <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
        <span className="lux-eyebrow">
          <Database className="h-3.5 w-3.5 text-purple-300" />
          Fonctionnement & intégration
        </span>

        <h2 id="knowledge-title" className="lux-h2 mt-5">
          Votre savoir-faire, <br className="hidden sm:inline" />
          <span className="lux-accent">enfin disponible 24h/24.</span>
        </h2>

        <p id="knowledge-desc" className="lux-lead mx-auto mt-5 max-w-2xl">
          L’assistant ne possède aucune offre par défaut : vous y déposez vos propres
          documents et consignes, et il répond uniquement selon vos règles exactes.
        </p>
      </div>

      {/* 3-Step Visual Explanation */}
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="lux-card lux-card-hover lux-card-beam group p-5 sm:p-7">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200 transition-transform duration-300 group-hover:scale-[1.06]">
              <step.icon className="h-4.5 w-4.5" />
            </div>
            <h3 className="lux-h3 text-[1rem] sm:text-[1.05rem]">{step.title}</h3>
            <p className="lux-sub mt-2 text-[0.84rem] sm:text-[0.88rem]">{step.text}</p>
          </div>
        ))}
      </div>

      {/* Trois garanties simples, sans détail technique */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4">
        {guarantees.map((item) => (
          <div key={item.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6">
            <item.icon className="h-4 w-4 text-purple-300/80" />
            <h3 className="mt-3 text-[0.9rem] font-semibold tracking-[-0.01em] text-neutral-100">{item.title}</h3>
            <p className="lux-sub mt-1.5 text-[0.8rem] sm:text-[0.83rem]">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
