import React from 'react';
import { CheckCircle2, Languages, Sparkles, ShieldCheck, Database, Check, FileText, UploadCloud, Cpu, MessageSquare, FileSpreadsheet, FileCode, Layers, HelpCircle, Lock, RefreshCw } from 'lucide-react';

export const KnowledgeBaseSection: React.FC = () => {

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
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">1. Vous décrivez votre activité</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Vos fiches de services, catalogues de produits, tableaux Excel ou foires aux questions habituelles.
          </p>
        </div>

        <div className="relative p-4 sm:p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-2 hover:scale-[1.015] space-y-2 sm:space-y-3 group overflow-hidden cursor-default">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />
          <div className="relative z-10 w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <Cpu className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">2. Votre assistant retient vos informations</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Elle assimile vos conditions, vos délais et s'exprime avec précision en Français, Darija et plusieurs langues.
          </p>
        </div>

        <div className="relative p-4 sm:p-5 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl card-hover-tilt-glow hover:-translate-y-2 hover:rotate-[0.8deg] space-y-2 sm:space-y-3 group overflow-hidden cursor-default">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />
          <div className="relative z-10 w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
            <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <h3 className="relative z-10 text-sm sm:text-base font-bold text-neutral-100 group-hover:text-purple-200 transition-colors">3. Il répond à vos clients</h3>
          <p className="relative z-10 text-xs text-neutral-300 leading-relaxed">
            Sur votre site web ou boutique en ligne, l'assistant renseigne vos prospects sans jamais inventer d'information.
          </p>
        </div>
      </div>

      {/* Trois garanties simples, sans détail technique */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { icon: Lock, title: 'Vos informations restent les vôtres', text: 'Elles servent uniquement à répondre à vos visiteurs.' },
          { icon: RefreshCw, title: 'Tout se met à jour en un clic', text: 'Vous changez un prix : votre assistant suit immédiatement.' },
          { icon: MessageSquare, title: "Il n'invente rien", text: "S'il ne sait pas, il vous transmet la question au lieu de répondre au hasard." },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
            <item.icon className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-semibold text-neutral-100">{item.title}</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
