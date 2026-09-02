import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Languages, 
  Sparkles, 
  ShieldCheck, 
  Database,
  Check,
  FileText,
  UploadCloud,
  Cpu,
  MessageSquare,
  FileSpreadsheet,
  FileCode,
  Layers,
  HelpCircle,
  Lock
} from 'lucide-react';

export const KnowledgeBaseSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'formats' | 'extractions' | 'darija' | 'securite'>('formats');

  return (
    <section 
      id="knowledge-section"
      className="relative py-12 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto w-full overflow-hidden"
    >
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-neutral-950/50 border border-purple-500/30 text-[11px] sm:text-xs font-semibold text-purple-300 mb-3 sm:mb-4 backdrop-blur-xl shadow-lg shadow-purple-950/30">
          <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Fonctionnement & Intégration</span>
        </div>

        <h2 
          id="knowledge-title"
          className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-100 font-display mb-3 sm:mb-4 leading-tight break-words"
        >
          Comment fonctionne la base de connaissances ? <br className="hidden sm:inline" />
          <span className="text-purple-300">
            Vos documents et consignes.
          </span>
        </h2>

        <p 
          id="knowledge-desc"
          className="text-sm sm:text-base md:text-lg text-neutral-300 leading-relaxed max-w-2xl mx-auto"
        >
          L’assistant ne possède aucune offre par défaut : vous y déposez simplement vos propres fichiers (catalogues, réponses types, conditions de vente) pour qu’il réponde selon vos règles exactes.
        </p>
      </div>

      {/* 3-Step Visual Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10">
        <div className="relative p-4 sm:p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-2 hover:-rotate-[0.8deg] space-y-2 sm:space-y-3 group overflow-hidden cursor-default">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />
          <div className="relative z-10 w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <UploadCloud className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">1. Vous importez vos documents</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Vos fiches de services, catalogues de produits, tableaux Excel ou foires aux questions habituelles.
          </p>
        </div>

        <div className="relative p-4 sm:p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-2 hover:scale-[1.015] space-y-2 sm:space-y-3 group overflow-hidden cursor-default">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />
          <div className="relative z-10 w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <Cpu className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">2. L'IA apprend vos consignes</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Elle assimile vos conditions, vos délais et s'exprime avec précision en Français, Darija et plusieurs langues.
          </p>
        </div>

        <div className="relative p-4 sm:p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-2 hover:rotate-[0.8deg] space-y-2 sm:space-y-3 group overflow-hidden cursor-default">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />
          <div className="relative z-10 w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">3. Réponses 24h/24</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Sur votre site web ou boutique en ligne, l'assistant renseigne vos prospects sans jamais inventer d'information.
          </p>
        </div>
      </div>

      {/* Interactive Vault Display */}
      <div className="rounded-2xl sm:rounded-3xl bg-neutral-950/35 border border-white/15 backdrop-blur-2xl p-4 sm:p-8 shadow-2xl shadow-purple-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-4 sm:mb-6 border-b border-white/10 pb-3 sm:pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-neutral-100">Détails de configuration de votre assistant</h3>
            <p className="text-[11px] sm:text-xs text-neutral-400">Découvrez comment vos données sont traitées et sécurisées :</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
          <button
            onClick={() => setActiveTab('formats')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs md:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'formats'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 font-semibold'
                : 'bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/60 hover:text-white backdrop-blur-md'
            }`}
          >
            <UploadCloud className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
            <span className="truncate">Formats acceptés</span>
          </button>

          <button
            onClick={() => setActiveTab('extractions')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs md:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'extractions'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 font-semibold'
                : 'bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/60 hover:text-white backdrop-blur-md'
            }`}
          >
            <Layers className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
            <span className="truncate">Données traitées</span>
          </button>

          <button
            onClick={() => setActiveTab('darija')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs md:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'darija'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 font-semibold'
                : 'bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/60 hover:text-white backdrop-blur-md'
            }`}
          >
            <Languages className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
            <span className="truncate">Darija & Langues</span>
          </button>

          <button
            onClick={() => setActiveTab('securite')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs md:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'securite'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 font-semibold'
                : 'bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/60 hover:text-white backdrop-blur-md'
            }`}
          >
            <ShieldCheck className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
            <span className="truncate">Sécurité & Fiabilité</span>
          </button>
        </div>

        {/* Tab 1: Formats & Fichiers */}
        {activeTab === 'formats' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-300">
            <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2 hover:border-purple-500/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <FileText className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Fichiers PDF & Word</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Brochures de présentation, conditions générales, règlements et fiches descriptives.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2 hover:border-purple-500/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Tableurs Excel & CSV</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Catalogues avec références, variantes de produits, barèmes tarifaires et zones de livraison.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2 hover:border-purple-500/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <HelpCircle className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">FAQ & Réponses types</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Questions récurrentes, horaires d'ouverture, coordonnées et consignes spécifiques.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2 hover:border-purple-500/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <FileCode className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Lien direct vers votre site</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Synchronisation automatique avec les pages de votre boutique ou site vitrine existant.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Ce que l'IA sait extraire */}
        {activeTab === 'extractions' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in duration-300">
            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-block">
                Informations Produits & Services
              </span>
              <h4 className="text-sm font-semibold text-neutral-100">Descriptions & Disponibilités</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                L'assistant explique les caractéristiques de ce que vous proposez et oriente le client vers la solution adaptée.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-block">
                Logistique & Couverture
              </span>
              <h4 className="text-sm font-semibold text-neutral-100">Délais & Zones desservies</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Il applique vos propres délais (24h, 48h, 72h) et informe vos clients selon leur localisation exacte.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-block">
                Règlement & Administratif
              </span>
              <h4 className="text-sm font-semibold text-neutral-100">Moyens de paiement & Documents</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Il indique les options que vous acceptez (virement bancaire, carte, paiement à la livraison) et informe sur les factures et devis.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Darija & Langues */}
        {activeTab === 'darija' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-3">
              <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Compréhension naturelle du langage de vos clients
              </h4>
              <p className="text-xs text-neutral-300">
                Vos clients s'expriment spontanément en Darija, en Français ou en Anglais, et l'assistant comprend chaque intention :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-md">
                  <span className="text-purple-300 font-medium block">"Wach kayen devis wela facture ?"</span>
                  <span className="text-neutral-400 mt-1 block">→ Il confirme vos documents disponibles selon vos consignes</span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-md">
                  <span className="text-purple-300 font-medium block">"Chhal waqt bach toussel la commande ?"</span>
                  <span className="text-neutral-400 mt-1 block">→ Il communique vos délais d'expédition enregistrés</span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-md">
                  <span className="text-purple-300 font-medium block">"Kifech ncommondi ?"</span>
                  <span className="text-neutral-400 mt-1 block">→ Il guide le client vers votre processus de commande</span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950/40 border border-white/10 backdrop-blur-md">
                  <span className="text-purple-300 font-medium block">"Takhadmou m3a ga3 les régions ?"</span>
                  <span className="text-neutral-400 mt-1 block">→ Il informe sur toutes les zones que votre entreprise dessert</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Sécurité & Fiabilité */}
        {activeTab === 'securite' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-300">
            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Zéro invention d'information</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Si une information ne figure pas dans vos documents, l'assistant redirige poliment vers votre équipe sans rien inventer.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <Lock className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Données privées & protégées</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Vos documents et données restent strictement confidentiels et ne sont jamais partagés avec des tiers.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-100">Mise à jour en 1 clic</h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Vous changez un tarif ou ajoutez un produit ? Mettez à jour votre document et l'IA s'adapte instantanément.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
