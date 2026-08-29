import React, { useState } from 'react';
import { 
  Briefcase, 
  Store, 
  GraduationCap, 
  Building2, 
  Globe, 
  MessageCircle, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  Code2,
  FileCheck2,
  Home,
  Utensils,
  Wrench,
  Car,
  Scale,
  PlusCircle,
  HelpCircle
} from 'lucide-react';

interface ServicesPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const [selectedIndustryTab, setSelectedIndustryTab] = useState<string>('immo');
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  // Featured 4 Archetypes
  const sectors = [
    {
      icon: Briefcase,
      title: 'Services & Agences B2B',
      desc: 'Accélérez la qualification de vos prospects et la signature de vos contrats sans délai.',
      features: [
        'Transmission instantanée de devis et factures proforma',
        'Cadrage des besoins clients et cahiers des charges',
        'Prise de rendez-vous visio ou réunion sur site',
        'Réponses précises sur vos forfaits et méthodologies'
      ],
      badge: 'B2B & Conseil',
      exampleQuestion: '« Pouvez-vous nous transmettre une facture proforma pour 3 sites ? »'
    },
    {
      icon: Store,
      title: 'E-commerce & Boutiques',
      desc: 'Convertissez vos paniers abandonnés et rassurez vos acheteurs dans toutes leurs zones de livraison.',
      features: [
        'Calcul automatique des frais de livraison à domicile & point relais',
        'Confirmation des stocks et variantes de produits en temps réel',
        'Gestion des commandes avec paiement sécurisé ou à la livraison',
        'Suivi de colis temps réel et notifications de statut'
      ],
      badge: 'Commerce & Retail',
      exampleQuestion: '« Chhal la livraison à domicile et est-ce que la taille M est dispo ? »'
    },
    {
      icon: GraduationCap,
      title: 'Écoles, Formations & Instituts',
      desc: 'Automatisez les inscriptions et répondez aux questions pédagogiques 24h/24.',
      features: [
        'Présentation des programmes, dates de sessions et prérequis',
        'Détails sur les modalités présentielles et e-learning',
        'Informations sur les certifications reconnues et attestations',
        'Gestion des facilités de paiement en plusieurs tranches'
      ],
      badge: 'Éducation & Pro',
      exampleQuestion: '« Quelle est la date de la prochaine session et le certificat est-il reconnu ? »'
    },
    {
      icon: Building2,
      title: 'Cabinets, Cliniques & Santé',
      desc: 'Offrez un accueil patient professionnel et fluide dès leur première visite sur votre site.',
      features: [
        'Orientation vers les spécialités et praticiens qualifiés',
        'Horaires d’ouverture, adresses et accès aux locaux',
        'Prise de rendez-vous préalable et consignes de consultation',
        'Confidentialité stricte et réponses certifiées'
      ],
      badge: 'Santé & Libéral',
      exampleQuestion: '« Quels sont les documents nécessaires pour la première consultation ? »'
    }
  ];

  // Extended Industry Use-Cases to prove universality
  const extendedExamples = [
    {
      id: 'immo',
      name: 'Immobilier & Architecture',
      icon: Home,
      tag: 'Agences & Promoteurs',
      headline: 'Filtrage des biens, critères de budget et visites',
      userPrompt: '« Avez-vous des appartements F4 avec box de garage dans le centre-ville ? »',
      botResponse: '« Oui, nous avons actuellement 2 biens disponibles correspondant à vos critères à partir de 22 000 000 DA. Souhaitez-vous recevoir la brochure PDF ou planifier une visite avec notre conseiller ? »',
      capabilities: ['Filtrage par quartier & budget', 'Envoi immédiat des fiches techniques', 'Prise de rendez-vous de visite']
    },
    {
      id: 'resto',
      name: 'Restauration & Hôtellerie',
      icon: Utensils,
      tag: 'Restaurants & Hôtels',
      headline: 'Réservation de tables, menus du jour et événements',
      userPrompt: '« Avez-vous des options sans gluten et est-ce possible de réserver pour 8 personnes ce soir ? »',
      botResponse: '« Absolument ! Notre carte propose 4 plats certifiés sans gluten. Pour 8 personnes à 20h00, il nous reste une table en terrasse. Puis-je avoir votre nom et numéro pour valider la réservation ? »',
      capabilities: ['Carte des menus & allergènes', 'Réservations instantanées de tables', 'Devis pour événements privés']
    },
    {
      id: 'btp',
      name: 'Artisanat, BTP & Travaux',
      icon: Wrench,
      tag: 'Entrepreneurs & Artisans',
      headline: 'Estimation de métrage, devis travaux et garanties',
      userPrompt: '« Quel est le prix au m² pour la rénovation de sol et vos délais d\'intervention ? »',
      botResponse: '« Nos tarifs de pose débutent à 1 800 DA/m² selon le revêtement choisi. Nous pouvons effectuer un relevé gratuit sur place sous 48h. Dans quelle commune se situe votre chantier ? »',
      capabilities: ['Calcul des superficies et métrages', 'Explication des garanties décennales', 'Prise de rendez-vous de chantier']
    },
    {
      id: 'auto',
      name: 'Automobile & Garages',
      icon: Car,
      tag: 'Concessions & Centres Auto',
      headline: 'Prise de rendez-vous révision, pièces et devis atelier',
      userPrompt: '« Combien coûte la vidange complète pour un SUV et quand avez-vous un créneau ? »',
      botResponse: '« Le forfait révision + vidange synthétique avec diagnostic 30 points est à 14 500 DA. Nous avons un créneau disponible dès demain à 09h30 ou 14h00. Lequel vous convient ? »',
      capabilities: ['Vérification des disponibilités atelier', 'Tarifs des forfaits vidange & révision', 'Orientation vers les pièces compatibles']
    },
    {
      id: 'legal',
      name: 'Avocats, Notaires & Juridique',
      icon: Scale,
      tag: 'Professions Réglementées',
      headline: 'Prise de contact confidentielle et pièces nécessaires',
      userPrompt: '« Quels documents dois-je fournir pour une constitution de société SARL ? »',
      botResponse: '« Pour une SARL, vous devrez fournir : statuts rédigés, copie des pièces d\'identité des associés, attestation de blocage de capital et bail du siège. Souhaitez-vous convenir d\'un premier rendez-vous de conseil ? »',
      capabilities: ['Liste des pièces administratives', 'Modalités d\'honoraires transparentes', 'Prise de rendez-vous confidentiel']
    }
  ];

  const currentExample = extendedExamples.find(e => e.id === selectedIndustryTab) || extendedExamples[0];
  const CurrentIcon = currentExample.icon;

  const integrations = [
    { name: 'WordPress / WooCommerce', tag: 'Disponible', isLive: true },
    { name: 'Shopify', tag: 'Disponible', isLive: true },
    { name: 'Webflow', tag: 'Disponible', isLive: true },
    { name: 'Wix & Squarespace', tag: 'Disponible', isLive: true },
    { name: 'React / Next.js / HTML', tag: 'Disponible', isLive: true },
    { name: 'WhatsApp & Réseaux', tag: 'Prochainement', isLive: false }
  ];

  return (
    <div className="pt-28 pb-20 px-4 sm:px-6 max-w-6xl mx-auto space-y-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Adapté à 100% des métiers et activités</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100">
          Un assistant intelligent conçu pour <br />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            n'importe quel domaine d'activité.
          </span>
        </h1>
        <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          Les 4 catégories ci-dessous ne sont que des exemples fréquents : <strong className="text-purple-300">notre moteur s'adapte à toute activité</strong> simplement en important vos fiches de prix, vos PDF ou vos consignes personnalisées.
        </p>
      </div>

      {/* 4 Main Archetypes / Examples */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold font-display text-neutral-100 flex items-center gap-2">
            <span>Exemples de configurations populaires</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-normal">4 modèles types</span>
          </h2>
          <span className="text-xs text-neutral-400 hidden sm:inline">100% personnalisable avec vos données</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sectors.map((sec, idx) => {
            const Icon = sec.icon;
            const tiltClass = idx % 2 === 0 
              ? 'hover:-translate-y-2 hover:-rotate-[0.8deg]' 
              : 'hover:-translate-y-2 hover:rotate-[0.8deg]';

            return (
              <div 
                key={idx}
                className={`relative p-6 sm:p-8 rounded-3xl bg-neutral-950/40 border border-white/10 backdrop-blur-2xl card-hover-tilt-glow ${tiltClass} space-y-5 shadow-xl shadow-purple-950/20 group flex flex-col justify-between overflow-hidden cursor-default`}
              >
                {/* Specular glass gleam overlay on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-transparent via-purple-500/10 to-white/10" />

                <div className="relative z-10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all duration-300">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 group-hover:bg-purple-500/25 group-hover:border-purple-400/50 transition-colors">
                      {sec.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-neutral-100 font-display mb-2 group-hover:text-purple-200 transition-colors">{sec.title}</h3>
                    <p className="text-sm text-neutral-300 leading-relaxed">{sec.desc}</p>
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-white/10">
                    {sec.features.map((feat, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5 group-hover:text-purple-300 transition-colors" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative z-10 p-3 rounded-xl bg-neutral-900/60 border border-white/10 text-xs text-neutral-300 italic group-hover:border-purple-500/30 transition-colors">
                  <span className="text-purple-300 font-semibold not-italic block mb-0.5">Exemple de requête gérée :</span>
                  {sec.exampleQuestion}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accordion / Toggle for detailed advanced content */}
      <div className="flex flex-col items-center justify-center pt-2">
        <button
          onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
          className="group relative flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 border border-purple-500/40 hover:border-purple-500/70 text-purple-300 hover:text-purple-200 font-bold text-xs sm:text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer overflow-hidden"
        >
          <span>{showAdvancedDetails ? "Masquer les détails & intégrations" : "Afficher les spécifications, cas d'usage & intégrations"}</span>
          <ArrowRight className={`w-4 h-4 transition-transform ${showAdvancedDetails ? "rotate-90" : "group-hover:translate-x-0.5"}`} />
        </button>
      </div>

      {showAdvancedDetails && (
        <div className="space-y-16 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* EXTENDED INDUSTRY EXAMPLES & INTERACTIVE SIMULATOR */}
          <div className="p-6 sm:p-10 rounded-3xl bg-neutral-950/50 border border-purple-500/30 backdrop-blur-2xl space-y-8 shadow-2xl shadow-purple-950/30">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-semibold mb-2">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>D'autres métiers en action</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-100 font-display">
                  Découvrez d'autres exemples concrets
                </h2>
                <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mt-1">
                  Immobilier, BTP, Restauration, Automobile ou Juridique : voici comment l'assistant répond avec précision selon chaque métier.
                </p>
              </div>

              <button
                onClick={onOpenAssistantModal}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer self-start md:self-auto"
              >
                <span>Créer pour mon activité</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Industry Tabs */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/10">
              {extendedExamples.map((item) => {
                const TabIcon = item.icon;
                const isActive = selectedIndustryTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedIndustryTab(item.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40 border border-purple-400 font-semibold'
                        : 'bg-neutral-900/60 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10'
                    }`}
                  >
                    <TabIcon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Industry Showcase Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <CurrentIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-purple-300 font-semibold uppercase tracking-wider block">
                      {currentExample.tag}
                    </span>
                    <h3 className="text-lg font-bold text-neutral-100 font-display">
                      {currentExample.headline}
                    </h3>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-neutral-400 font-semibold block">Ce que gère l'assistant :</span>
                  {currentExample.capabilities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-neutral-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Chat Dialogue Preview */}
              <div className="lg:col-span-7 bg-neutral-900/80 border border-white/15 rounded-2xl p-4 sm:p-5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-white/10 pb-2">
                  <span className="flex items-center gap-1.5 text-purple-300 font-semibold">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Simulation de conversation réelle</span>
                  </span>
                  <span>24h/24 · Réponse &lt; 1s</span>
                </div>

                {/* Visitor Message */}
                <div className="flex items-start gap-2.5 justify-end">
                  <div className="bg-purple-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-xs max-w-[85%] shadow-md">
                    {currentExample.userPrompt}
                  </div>
                </div>

                {/* Assistant Bot Message */}
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-neutral-800/90 border border-white/10 text-neutral-100 rounded-2xl rounded-tl-none px-4 py-2.5 text-xs max-w-[88%] shadow-md leading-relaxed">
                    {currentExample.botResponse}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Universal "Votre activité sur mesure" Banner */}
          <div className="p-8 rounded-3xl bg-neutral-950/40 border border-white/15 backdrop-blur-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <PlusCircle className="w-4 h-4 text-purple-400" />
                <span>Votre domaine n'apparaît pas ici ?</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-display text-neutral-100">
                JawebFlow fonctionne pour 100% des entreprises et créateurs.
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
                Fournissez simplement votre fichier Word, PDF, Excel ou quelques lignes de texte. L'assistant absorbe vos tarifs, conditions et méthodes en moins de 60 secondes.
              </p>
            </div>

            <button
              onClick={onOpenAssistantModal}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-xl shadow-purple-600/30 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <span>Créer mon assistant sur mesure</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Integrations Section */}
          <div className="p-8 sm:p-10 rounded-3xl bg-neutral-950/40 border border-white/10 backdrop-blur-2xl text-center space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Compatibilité universelle</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-neutral-100 font-display">
                S'intègre sur n'importe quel site web en 60 secondes
              </h2>
              <p className="text-sm text-neutral-300 max-w-xl mx-auto">
                Pas besoin de développeur : une simple ligne de code suffit pour afficher le widget sur votre site web. Modules WhatsApp et réseaux sociaux en cours de déploiement.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {integrations.map((item, idx) => (
                <div 
                  key={idx}
                  className={`p-3.5 rounded-2xl border backdrop-blur-md text-center transition-colors ${
                    item.isLive 
                      ? 'bg-neutral-900/50 border-white/10 hover:border-purple-500/30' 
                      : 'bg-purple-950/20 border-purple-500/30'
                  }`}
                >
                  <div className="font-semibold text-xs text-neutral-200 mb-1">{item.name}</div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    item.isLive
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  }`}>
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Reliability Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/40 via-neutral-950/40 to-indigo-950/40 border border-purple-500/30 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Zéro Hallucination & Données Contrôlées</span>
              </div>
              <h3 className="text-xl font-bold text-neutral-100 font-display">
                L'assistant ne répond qu'avec vos règles précises.
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300 max-w-xl">
                Vos tarifs, vos délais et vos conditions sont protégés. Si une information n'est pas dans votre base de connaissances, l'assistant redirige poliment vers votre équipe.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={() => onNavigate('demo')}
                className="px-5 py-3 rounded-2xl bg-neutral-900/70 hover:bg-neutral-800/80 text-neutral-200 border border-white/10 text-xs font-semibold transition-all cursor-pointer text-center"
              >
                Tester la Démo
              </button>
              <button
                onClick={onOpenAssistantModal}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Créer mon assistant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

