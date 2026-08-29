import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Store, 
  Package, 
  Truck, 
  Code2, 
  Check, 
  Copy, 
  ArrowRight, 
  ArrowLeft,
  MessageSquare,
  Globe,
  Bot,
  Briefcase,
  GraduationCap,
  Building2,
  Stethoscope
} from 'lucide-react';

interface AssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ActivityType = 'services' | 'ecommerce' | 'formation' | 'cabinet' | 'autre';

export const AssistantModal: React.FC<AssistantModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<number>(1);
  const [activityType, setActivityType] = useState<ActivityType>('services');
  const [businessName, setBusinessName] = useState('Nexus Digital');
  const [offerDetails, setOfferDetails] = useState('Création de sites, Audit SEO, Accompagnement B2B');
  const [coverageZone, setCoverageZone] = useState('Sur site et à distance (Toutes zones)');
  const [currency, setCurrency] = useState('USD ($) / EUR (€) / Devise locale');
  const [languageMode, setLanguageMode] = useState<'bilingual' | 'darija' | 'fr'>('bilingual');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const generatedId = `ast_${businessName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.floor(1000 + Math.random() * 9000)}`;
  const widgetCode = `<script 
  src="https://jawebflow.app/cdn/widget.js" 
  data-assistant="${generatedId}" 
  data-business="${businessName}" 
  data-sector="${activityType}"
  data-lang="${languageMode}" 
  async>
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      id="assistant-generator-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xl overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-neutral-950/90 border border-white/15 backdrop-blur-2xl rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl shadow-purple-950/50 my-4 sm:my-8 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-1.5 sm:p-2 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer border border-white/10"
        >
          <X className="w-4 sm:w-5 h-4 sm:h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-4 sm:mb-6 pr-8">
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-purple-300 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Configurateur Chatbot IA Algérie 🇩🇿</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-neutral-100 font-display">
            Créer l'assistant de mon site web
          </h3>
          <p className="text-[11px] sm:text-xs text-neutral-400 mt-1">
            Étape {step} sur 3 — {step === 1 ? '01. Activité & Données' : step === 2 ? '02. Ton & Règles' : '03. Installation en 1 ligne'}
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-6 sm:mb-8">
          <div className={`h-1.5 rounded-full ${step >= 1 ? 'bg-gradient-to-r from-purple-500 to-indigo-500' : 'bg-neutral-800'}`}></div>
          <div className={`h-1.5 rounded-full ${step >= 2 ? 'bg-gradient-to-r from-purple-500 to-indigo-500' : 'bg-neutral-800'}`}></div>
          <div className={`h-1.5 rounded-full ${step >= 3 ? 'bg-gradient-to-r from-purple-500 to-indigo-500' : 'bg-neutral-800'}`}></div>
        </div>

        {/* Step 1: Rassemblez */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Type d'activité de votre entreprise
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActivityType('services');
                    setBusinessName('Nexus Digital');
                    setOfferDetails('Création de sites web, audit SEO, devis proforma sous 2h');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activityType === 'services'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <Briefcase className="w-4 h-4 mb-1 text-purple-400" />
                  <span className="font-semibold text-xs block">Services & Agence</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivityType('ecommerce');
                    setBusinessName('Maison Lila');
                    setOfferDetails('Cosmétiques bio, Pack Soin, livraison express');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activityType === 'ecommerce'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <Store className="w-4 h-4 mb-1 text-purple-400" />
                  <span className="font-semibold text-xs block">E-commerce</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivityType('formation');
                    setBusinessName('Horizon Academy');
                    setOfferDetails('Formations professionnelles, sessions en ligne et présentiel');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activityType === 'formation'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 mb-1 text-purple-400" />
                  <span className="font-semibold text-xs block">Formation</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivityType('cabinet');
                    setBusinessName('Cabinet Al-Amel');
                    setOfferDetails('Consultations sur rendez-vous, bilans personnalisés');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activityType === 'cabinet'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <Building2 className="w-4 h-4 mb-1 text-purple-400" />
                  <span className="font-semibold text-xs block">Cabinet / Santé</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Nom de votre entreprise ou marque
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ex: Nexus Digital, Clinique El-Djazair, Horizon Pro..."
                  className="w-full bg-neutral-900/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Offres principales, prestations ou produits
              </label>
              <div className="relative">
                <Package className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={offerDetails}
                  onChange={(e) => setOfferDetails(e.target.value)}
                  placeholder="Ex: Forfaits mensuels, Devis, Rendez-vous, Tarifs et conditions..."
                  className="w-full bg-neutral-900/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Zone d'intervention & Disponibilité
              </label>
              <div className="relative">
                <Truck className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={coverageZone}
                  onChange={(e) => setCoverageZone(e.target.value)}
                  placeholder="Ex: National & International, Déplacement sur site, En ligne..."
                  className="w-full bg-neutral-900/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-md"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Générez */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Langues & Dialectes de réponse
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLanguageMode('bilingual')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    languageMode === 'bilingual'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md shadow-purple-500/20'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <span className="font-semibold text-xs block">FR + Darija</span>
                  <span className="text-[11px] opacity-75 mt-0.5 block">Automatique selon le client</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguageMode('darija')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    languageMode === 'darija'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md shadow-purple-500/20'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <span className="font-semibold text-xs block">Darija</span>
                  <span className="text-[11px] opacity-75 mt-0.5 block">Ton convivial & naturel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguageMode('fr')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    languageMode === 'fr'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-200 shadow-md shadow-purple-500/20'
                      : 'bg-neutral-900/40 border-white/10 text-neutral-300 hover:border-white/20'
                  }`}
                >
                  <span className="font-semibold text-xs block">Français</span>
                  <span className="text-[11px] opacity-75 mt-0.5 block">Ton professionnel soigné</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-white/10 space-y-2 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <Bot className="w-4 h-4 text-purple-400" />
                <span>Règles de sécurité & précision appliquées :</span>
              </div>
              <ul className="text-xs text-neutral-300 space-y-1.5 list-disc pl-4">
                <li>Vérification stricte dans vos fiches tarifaires & conditions réelles.</li>
                <li>Prise en compte de vos zones desservies, délais d'intervention et prises de rendez-vous.</li>
                <li>Transmission automatique des demandes de devis vers votre messagerie ou WhatsApp.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 3: Installez */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs flex items-start gap-2.5 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-purple-300 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Votre assistant est prêt !</strong> Votre identifiant unique a été calibré pour {businessName}.
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                <span>Code à copier sur votre site web (WordPress, Shopify, Webflow, Custom) :</span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-purple-300 hover:text-purple-200 font-medium cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-purple-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copié !' : 'Copier'}</span>
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-neutral-950/80 border border-white/10 text-xs font-mono text-purple-300 overflow-x-auto">
                <code>{widgetCode}</code>
              </pre>
            </div>

            <div className="p-3 rounded-xl bg-neutral-900/50 border border-white/10 text-xs text-neutral-400">
              💡 <strong>Intégration universelle :</strong> Fonctionne immédiatement sur tout site web (WordPress, Shopify, Webflow, HTML/React). La liaison directe WhatsApp & réseaux sociaux sera activée très prochainement.
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="mt-8 pt-5 border-t border-white/10 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Précédent</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
            >
              <span>Continuer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-purple-600/30"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Terminer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
