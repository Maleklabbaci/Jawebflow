import React, { useState } from 'react';
import {
  FileText,
  Cpu,
  Code2,
  Copy,
  Check,
  ArrowRight,
  Layers,
  Terminal
} from 'lucide-react';

interface ProcessSectionProps {
  onOpenAssistantModal: () => void;
}

export const ProcessSection: React.FC<ProcessSectionProps> = ({ onOpenAssistantModal }) => {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);

  const sampleScript = `<script 
  src="https://jawebflow.dz/cdn/widget.js" 
  data-assistant-id="dz_maison_lila_8842" 
  data-lang="fr-dz" 
  async>
</script>`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sampleScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (ancien navigateur) : on ne laisse pas le
      // client croire que le code est copié.
      setCopied(false);
    }
  };

  const steps = [
    {
      number: '01',
      title: 'Vos informations',
      description: 'Ajoutez vos textes et documents : services, tarifs, offres, FAQ ou catalogues.',
      icon: FileText,
      detail: 'Vous les écrivez dans votre espace, ou nous les importons depuis votre site en un clic.',
    },
    {
      number: '02',
      title: 'Votre assistant',
      description: 'Il apprend votre activité et votre façon de parler à vos clients.',
      icon: Cpu,
      detail: 'Vos réponses restent les vôtres : l’assistant ne dit rien que vous ne lui avez pas appris.',
    },
    {
      number: '03',
      title: 'Votre site',
      description: 'La bulle apparaît : la discussion démarre et vous recevez les clients intéressés.',
      icon: Code2,
      detail: 'WordPress, Shopify, Wix ou site sur mesure : le code se colle une seule fois, sans ralentir votre site.',
    },
  ];

  return (
    <section
      id="parcours-section"
      className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-24"
    >
      {/* Section Eyebrow & Titles */}
      <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
        <span className="lux-eyebrow">
          <Layers className="h-3.5 w-3.5 text-purple-300" />
          Le parcours
        </span>

        <h2 id="parcours-title" className="lux-h2 mt-5">
          Trois étapes. <br className="hidden sm:inline" />
          <span className="lux-accent">Votre assistant en ligne aujourd’hui.</span>
        </h2>

        <p id="parcours-desc" className="lux-lead mx-auto mt-5 max-w-2xl">
          Une configuration rapide, pensée pour vous laisser l’essentiel : des réponses
          justes, immédiates et sans invention pour vos clients.
        </p>
      </div>

      {/* 3 Step Cards Grid */}
      <div className="mb-8 grid grid-cols-1 gap-3.5 sm:mb-12 sm:gap-4 md:grid-cols-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isSelected = activeStep === idx + 1;

          return (
            <div
              key={step.number}
              id={`step-card-${step.number}`}
              onClick={() => setActiveStep(idx + 1)}
              className={`lux-card lux-card-hover group flex cursor-pointer flex-col justify-between p-5 sm:p-7 ${
                isSelected ? 'border-purple-400/35 bg-purple-500/[0.06]' : ''
              }`}
            >
              <div className="relative z-10">
                <div className="mb-5 flex items-center justify-between">
                  <span className={`text-[1.35rem] font-extrabold tracking-[-0.03em] transition-colors sm:text-[1.6rem] ${
                    isSelected ? 'text-purple-200' : 'text-purple-300/60 group-hover:text-purple-200'
                  }`}>
                    {step.number}
                  </span>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300 ${
                    isSelected
                      ? 'border-purple-400/35 bg-purple-500/15 text-purple-200'
                      : 'border-white/10 bg-white/[0.04] text-neutral-400 group-hover:border-purple-400/30 group-hover:text-purple-200'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                <h3 className="lux-h3 text-[1rem] sm:text-[1.08rem]">{step.title}</h3>

                <p className="lux-sub mt-2 text-[0.84rem] sm:text-[0.88rem]">{step.description}</p>
              </div>

              <p className="lux-note relative z-10 mt-5 border-t border-white/[0.07] pt-4 text-[0.76rem] sm:text-[0.78rem]">
                {step.detail}
              </p>
            </div>
          );
        })}
      </div>

      {/* Live Snippet Box */}
      <div className="lux-card mx-auto max-w-3xl p-5 sm:p-7">
        <div className="mb-3 flex items-center justify-between gap-3 text-[0.72rem] text-neutral-400">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-purple-300" />
            <span className="font-medium text-neutral-200">Script d’intégration universel</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="btn btn-sm btn-glass"
            aria-label="Copier le script d’intégration"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-purple-300" />
                <span className="text-purple-200">Copié</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copier le script</span>
              </>
            )}
          </button>
        </div>

        <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/40 p-4 text-[0.72rem] leading-relaxed text-purple-200">
          <code>{sampleScript}</code>
        </pre>

        <div className="mt-5 flex flex-col items-center justify-between gap-4 border-t border-white/[0.07] pt-5 sm:flex-row">
          <p className="lux-note text-center text-[0.78rem] sm:text-left">
            Une seule ligne de code — installation en moins de 2 minutes, sur n’importe quel site ou boutique.
          </p>
          <button onClick={onOpenAssistantModal} className="btn btn-primary btn-sm w-full sm:w-auto">
            <span>Créer pour mon site</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
