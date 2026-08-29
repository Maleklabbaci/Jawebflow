import React, { useState } from 'react';
import { 
  FileText, 
  Cpu, 
  Code2, 
  Copy, 
  Check, 
  ArrowRight, 
  Sparkles, 
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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sampleScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      number: '01',
      title: 'Rassemblez',
      description: 'Ajoutez vos textes et documents : services, tarifs, offres, FAQ ou catalogues.',
      icon: FileText,
      detail: 'Import direct de plaquettes PDF, fiches prestations, grilles tarifaires, zones de livraison ou conditions de collaboration.',
    },
    {
      number: '02',
      title: 'Générez',
      description: 'Un identifiant individuel et un script de widget sont préparés pour votre entreprise.',
      icon: Cpu,
      detail: 'Votre assistant assimile votre domaine d\'expertise, vos modalités de travail et le style de réponse adapté à vos clients.',
    },
    {
      number: '03',
      title: 'Installez',
      description: 'Collez une ligne de code sur votre site web et laissez l\'assistant convertir vos visiteurs.',
      icon: Code2,
      detail: 'Compatible avec tout site web (WordPress, Webflow, Shopify, Wix, Next.js, HTML sur-mesure) et connexion WhatsApp / réseaux sociaux prochainement.',
    },
  ];

  return (
    <section 
      id="parcours-section"
      className="relative py-12 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto w-full overflow-hidden"
    >
      {/* Section Eyebrow & Titles */}
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
        <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-neutral-950/50 border border-purple-500/30 text-[11px] sm:text-xs font-semibold text-purple-300 mb-3 sm:mb-4 backdrop-blur-xl shadow-lg shadow-purple-950/30">
          <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Le parcours</span>
        </div>

        <h2 
          id="parcours-title"
          className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-100 font-display mb-4 sm:mb-6 leading-tight break-words"
        >
          Trois étapes simples. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            Votre chatbot en ligne en 2 minutes.
          </span>
        </h2>

        <p 
          id="parcours-desc"
          className="text-sm sm:text-base md:text-lg text-neutral-200/90 leading-relaxed max-w-2xl mx-auto drop-shadow-sm"
        >
          Une configuration rapide et intuitive, pensée pour laisser place à l’essentiel : des réponses certifiées, immédiates et sans hallucination pour vos clients.
        </p>
      </div>

      {/* 3 Step Cards Grid - Ultra-translucent Frosted Glass */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isSelected = activeStep === idx + 1;
          const tiltClass = idx === 0 
            ? 'hover:-translate-y-2 hover:-rotate-[0.8deg]' 
            : idx === 1 
              ? 'hover:-translate-y-2 hover:scale-[1.015]' 
              : 'hover:-translate-y-2 hover:rotate-[0.8deg]';

          return (
            <div
              key={step.number}
              id={`step-card-${step.number}`}
              onClick={() => setActiveStep(idx + 1)}
              className={`relative rounded-2xl sm:rounded-3xl p-5 sm:p-8 card-hover-tilt-glow ${tiltClass} overflow-hidden group cursor-pointer ${
                isSelected
                  ? 'bg-neutral-950/50 border-2 border-purple-500/70 shadow-2xl shadow-purple-950/50'
                  : 'bg-neutral-950/30 border border-white/15'
              } backdrop-blur-2xl flex flex-col justify-between`}
            >
              {/* Specular light overlay */}
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <span className="text-2xl sm:text-3xl font-extrabold font-display text-purple-300/90 group-hover:text-purple-200 transition-colors">
                    {step.number}
                  </span>
                  <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition-all duration-300 ${
                    isSelected ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-md shadow-purple-500/20' : 'bg-neutral-900/50 text-neutral-400 border border-white/10 group-hover:text-purple-300 group-hover:border-purple-500/40 group-hover:scale-110'
                  }`}>
                    <Icon className="w-4 sm:w-5 h-4 sm:h-5" />
                  </div>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-neutral-100 font-display mb-2 sm:mb-3 group-hover:text-purple-200 transition-colors">
                  {step.title}
                </h3>

                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-3 sm:mb-4">
                  {step.description}
                </p>
              </div>

              <div className="relative z-10 pt-3 sm:pt-4 border-t border-white/10 text-[11px] sm:text-xs text-neutral-400 group-hover:text-neutral-300 transition-colors">
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Snippet Box for Step 3 Preview - Frosted Glass */}
      <div className="rounded-2xl sm:rounded-3xl bg-neutral-950/35 border border-white/15 p-5 sm:p-6 backdrop-blur-2xl shadow-2xl shadow-purple-950/30 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="font-mono text-neutral-200 font-medium">Script d'intégration universel</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/60 hover:bg-purple-950/40 text-neutral-200 hover:text-purple-200 border border-white/10 transition-colors text-xs font-medium backdrop-blur-md cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-purple-300">Copié !</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                <span>Copier le script</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 rounded-xl bg-neutral-950/60 border border-white/10 text-xs font-mono text-purple-200 overflow-x-auto backdrop-blur-md">
          <code>{sampleScript}</code>
        </pre>

        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-white/10">
          <span className="text-xs text-neutral-400">
            Installation en moins de 2 minutes sur n'importe quel site ou boutique.
          </span>
          <button
            onClick={onOpenAssistantModal}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 border border-purple-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer backdrop-blur-md shadow-md"
          >
            <span>Créer pour mon site web</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
