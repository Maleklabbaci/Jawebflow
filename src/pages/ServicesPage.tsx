import React, { useState } from 'react';
import {
  Briefcase,
  Store,
  GraduationCap,
  Building2,
  MessageCircle,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Layers,
  Home,
  Utensils,
  Wrench,
  Car,
  Scale,
  PlusCircle,
  Sparkles
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
      desc: 'Qualifiez vos prospects et envoyez vos devis sans attendre, même quand vous êtes en rendez-vous.',
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
      desc: 'Rassurez vos acheteurs, calculez la livraison et récupérez les paniers hésitants.',
      features: [
        'Frais de livraison à domicile & point relais, par wilaya',
        'Confirmation des stocks et des variantes en temps réel',
        'Commande guidée, paiement à la livraison ou en ligne',
        'Suivi de colis et réponses aux questions de retour'
      ],
      badge: 'Commerce & Retail',
      exampleQuestion: '« Chhal la livraison à domicile et est-ce que la taille M est dispo ? »'
    },
    {
      icon: GraduationCap,
      title: 'Écoles, Formations & Instituts',
      desc: 'Remplissez vos sessions : inscriptions, programmes et facilités de paiement expliqués 24h/24.',
      features: [
        'Programmes, dates de sessions et prérequis',
        'Modalités en présentiel, en ligne ou en replay',
        'Certifications reconnues et attestations délivrées',
        'Facilités de paiement en plusieurs tranches'
      ],
      badge: 'Éducation & Pro',
      exampleQuestion: '« Quelle est la date de la prochaine session et le certificat est-il reconnu ? »'
    },
    {
      icon: Building2,
      title: 'Cabinets, Cliniques & Santé',
      desc: 'Un accueil patient irréprochable dès la première visite, sans jamais saturer votre secrétariat.',
      features: [
        'Orientation vers les spécialités et praticiens',
        'Horaires, adresses et accès aux locaux',
        'Consignes de consultation et pièces à apporter',
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
      headline: 'Filtrage des biens, budget et visites',
      userPrompt: '« Avez-vous des appartements F4 avec box de garage dans le centre-ville ? »',
      botResponse: '« Oui, nous avons actuellement 2 biens disponibles correspondant à vos critères à partir de 22 000 000 DA. Souhaitez-vous recevoir la brochure PDF ou planifier une visite avec notre conseiller ? »',
      capabilities: ['Filtrage par quartier & budget', 'Envoi immédiat des fiches techniques', 'Prise de rendez-vous de visite']
    },
    {
      id: 'resto',
      name: 'Restauration & Hôtellerie',
      icon: Utensils,
      tag: 'Restaurants & Hôtels',
      headline: 'Réservation de tables, menus et événements',
      userPrompt: '« Avez-vous des options sans gluten et est-ce possible de réserver pour 8 personnes ce soir ? »',
      botResponse: '« Absolument ! Notre carte propose 4 plats certifiés sans gluten. Pour 8 personnes à 20h00, il nous reste une table en terrasse. Puis-je avoir votre nom et votre numéro pour valider la réservation ? »',
      capabilities: ['Carte des menus & allergènes', 'Réservations instantanées de tables', 'Devis pour événements privés']
    },
    {
      id: 'btp',
      name: 'Artisanat, BTP & Travaux',
      icon: Wrench,
      tag: 'Entrepreneurs & Artisans',
      headline: 'Estimation de métrage, devis et garanties',
      userPrompt: '« Quel est le prix au m² pour la rénovation de sol et vos délais d\'intervention ? »',
      botResponse: '« Nos tarifs de pose débutent à 1 800 DA/m² selon le revêtement choisi. Nous pouvons effectuer un relevé gratuit sur place sous 48h. Dans quelle commune se situe votre chantier ? »',
      capabilities: ['Calcul des superficies et métrages', 'Explication des garanties décennales', 'Prise de rendez-vous de chantier']
    },
    {
      id: 'auto',
      name: 'Automobile & Garages',
      icon: Car,
      tag: 'Concessions & Centres Auto',
      headline: 'Révision, pièces et devis atelier',
      userPrompt: '« Combien coûte la vidange complète pour un SUV et quand avez-vous un créneau ? »',
      botResponse: '« Le forfait révision + vidange synthétique avec diagnostic 30 points est à 14 500 DA. Nous avons un créneau dès demain à 09h30 ou 14h00. Lequel vous convient ? »',
      capabilities: ['Vérification des disponibilités atelier', 'Tarifs des forfaits vidange & révision', 'Orientation vers les pièces compatibles']
    },
    {
      id: 'legal',
      name: 'Avocats, Notaires & Juridique',
      icon: Scale,
      tag: 'Professions Réglementées',
      headline: 'Prise de contact confidentielle et pièces à fournir',
      userPrompt: '« Quels documents dois-je fournir pour une constitution de société SARL ? »',
      botResponse: '« Pour une SARL, vous devrez fournir : les statuts rédigés, une copie des pièces d\'identité des associés, l\'attestation de blocage de capital et le bail du siège. Souhaitez-vous convenir d\'un premier rendez-vous de conseil ? »',
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
    <div className="mx-auto max-w-[1440px] space-y-16 px-6 pb-20 pt-28 sm:px-10 lg:px-16">
      {/* Header */}
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <span className="lux-eyebrow">
          <Sparkles className="h-3.5 w-3.5 text-purple-300" />
          Adapté à 100% des métiers
        </span>
        <h1 className="lux-h1">
          Votre métier a ses questions. <br />
          <span className="lux-accent">Votre assistant a les réponses.</span>
        </h1>
        <p className="lux-lead mx-auto max-w-2xl">
          Les catégories ci-dessous ne sont que des exemples : le moteur s’adapte à
          <strong className="font-medium text-purple-200"> n’importe quelle activité</strong> à partir de
          vos fiches de prix, vos PDF ou vos consignes.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 pt-1 sm:flex-row sm:items-center">
          <button onClick={onOpenAssistantModal} className="btn btn-primary">
            <span>Créer mon assistant</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={() => onNavigate('demo')} className="btn btn-glass">
            <span>Tester la démo</span>
          </button>
        </div>
      </div>

      {/* 4 Main Archetypes / Examples */}
      <div className="space-y-5">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="lux-h3 flex items-center gap-2.5">
            <span>Exemples de configurations populaires</span>
            <span className="rounded-full border border-purple-400/25 bg-purple-500/12 px-2.5 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-purple-200">4 modèles types</span>
          </h2>
          <span className="lux-note text-[0.78rem]">100% personnalisable avec vos données</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sectors.map((sec) => {
            const Icon = sec.icon;
            return (
              <div key={sec.title} className="lux-card lux-card-hover lux-card-beam group flex flex-col justify-between p-6 sm:p-8">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="lux-tag">{sec.badge}</span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="lux-h3 text-[1.1rem] sm:text-[1.2rem]">{sec.title}</h3>
                    <p className="lux-sub text-[0.86rem]">{sec.desc}</p>
                  </div>

                  <ul className="space-y-2.5 pt-1">
                    {sec.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[0.82rem] font-light leading-relaxed text-neutral-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                  <span className="mb-1 block text-[0.66rem] font-medium uppercase tracking-[0.14em] text-purple-200/80">
                    Exemple de question gérée
                  </span>
                  <p className="text-[0.82rem] font-light italic leading-relaxed text-neutral-300">{sec.exampleQuestion}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Autres métiers : toujours visibles (c’est la preuve la plus forte) */}
      <div className="lux-card p-6 sm:p-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="space-y-3">
            <span className="lux-eyebrow">
              <Layers className="h-3.5 w-3.5 text-purple-300" />
              D’autres métiers en action
            </span>
            <h2 className="lux-h3 text-[1.25rem] sm:text-[1.6rem]">
              Vos concurrents ont les mêmes questions que vous.
            </h2>
            <p className="lux-sub max-w-xl text-[0.86rem]">
              Immobilier, restauration, BTP, automobile ou juridique : voici la réponse exacte que
              chaque métier peut offrir à ses clients dès aujourd’hui.
            </p>
          </div>

          <button onClick={onOpenAssistantModal} className="btn btn-primary btn-sm self-start md:self-auto">
            <span>Créer pour mon activité</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Industry Tabs */}
        <div className="mt-7 flex flex-wrap gap-2 border-b border-white/[0.07] pb-4">
          {extendedExamples.map((item) => {
            const TabIcon = item.icon;
            const isActive = selectedIndustryTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedIndustryTab(item.id)}
                aria-selected={isActive}
                className={`lux-tab ${isActive ? 'lux-tab-active' : ''}`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Industry Showcase Card */}
        <div className="mt-7 grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
                <CurrentIcon className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="block text-[0.62rem] font-medium uppercase tracking-[0.14em] text-purple-200/80">
                  {currentExample.tag}
                </span>
                <h3 className="lux-h3 text-[1.02rem]">{currentExample.headline}</h3>
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="block text-[0.7rem] font-medium uppercase tracking-[0.14em] text-neutral-500">
                Ce que gère l’assistant
              </span>
              {currentExample.capabilities.map((cap, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[0.82rem] font-light text-neutral-200">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-purple-300" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Chat Dialogue Preview */}
          <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/25 p-4 sm:p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5 text-[0.68rem] text-neutral-500">
              <span className="flex items-center gap-1.5 font-medium text-purple-200">
                <MessageCircle className="h-3.5 w-3.5" />
                <span>Conversation réelle, sur votre site</span>
              </span>
              <span>24h/24 · réponse instantanée</span>
            </div>

            {/* Visitor Message */}
            <div className="flex items-start justify-end gap-2.5">
              <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-purple-600 px-4 py-2.5 text-[0.8rem] font-light text-white">
                {currentExample.userPrompt}
              </div>
            </div>

            {/* Assistant Bot Message */}
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-purple-400/25 bg-white/[0.04] text-purple-200">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="max-w-[88%] rounded-2xl rounded-tl-none border border-white/[0.08] bg-white/[0.045] px-4 py-2.5 text-[0.8rem] font-light leading-relaxed text-neutral-100">
                {currentExample.botResponse}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Universal "Votre activité sur mesure" Banner */}
      <div className="lux-card flex flex-col items-center justify-between gap-6 p-7 sm:p-10 md:flex-row">
        <div className="space-y-3">
          <span className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-purple-200">
            <PlusCircle className="h-4 w-4 text-purple-300" />
            Votre domaine n’apparaît pas ici ?
          </span>
          <h3 className="lux-h3 text-[1.3rem] sm:text-[1.7rem]">
            JawebFlow fonctionne pour 100% des entreprises et des créateurs.
          </h3>
          <p className="lux-sub max-w-2xl text-[0.88rem]">
            Fournissez simplement un fichier Word, PDF, Excel ou quelques lignes de texte.
            L’assistant absorbe vos tarifs, vos conditions et vos méthodes en moins de 60 secondes.
          </p>
        </div>

        <button onClick={onOpenAssistantModal} className="btn btn-primary shrink-0">
          <span>Créer mon assistant sur mesure</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Toggle : spécifications & intégrations (détails utiles, pas vitaux) */}
      <div className="flex flex-col items-center justify-center">
        <button
          onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
          aria-expanded={showAdvancedDetails}
          className="btn btn-glass"
        >
          <span>{showAdvancedDetails ? 'Masquer les intégrations & garanties' : 'Voir les intégrations & garanties'}</span>
          <ArrowRight className={`h-4 w-4 transition-transform duration-300 ${showAdvancedDetails ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {showAdvancedDetails && (
        <div className="animate-in fade-in slide-in-from-top-4 space-y-8 duration-300">
          {/* Integrations Section */}
          <div className="lux-card space-y-6 p-7 text-center sm:p-10">
            <div className="space-y-3">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-purple-200">Compatibilité universelle</span>
              <h2 className="lux-h3 text-[1.4rem] sm:text-[2rem]">
                S’intègre sur n’importe quel site web en 60 secondes
              </h2>
              <p className="lux-sub mx-auto max-w-xl text-[0.88rem]">
                Pas besoin de développeur : une seule ligne de code suffit pour afficher la bulle sur
                votre site. Les modules WhatsApp et réseaux sociaux arrivent ensuite.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {integrations.map((item) => (
                <div
                  key={item.name}
                  className={`rounded-2xl border p-3.5 text-center transition-colors ${
                    item.isLive
                      ? 'border-white/[0.08] bg-white/[0.03] hover:border-purple-400/30'
                      : 'border-purple-400/25 bg-purple-500/[0.08]'
                  }`}
                >
                  <div className="mb-1.5 text-[0.78rem] font-medium text-neutral-200">{item.name}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] ${
                    item.isLive
                      ? 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                      : 'border border-purple-400/30 bg-purple-500/15 text-purple-200'
                  }`}>
                    {item.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Reliability Banner */}
          <div className="lux-card flex flex-col items-center justify-between gap-6 p-7 sm:p-9 md:flex-row">
            <div className="space-y-3">
              <span className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-purple-200">
                <ShieldCheck className="h-4 w-4 text-purple-300" />
                Zéro hallucination, données maîtrisées
              </span>
              <h3 className="lux-h3 text-[1.15rem] sm:text-[1.4rem]">
                L’assistant ne répond qu’avec vos règles précises.
              </h3>
              <p className="lux-sub max-w-xl text-[0.86rem]">
                Vos tarifs, vos délais et vos conditions sont protégés. Si une information n’est pas
                dans votre base de connaissances, l’assistant transmet poliment la demande à votre équipe.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
              <button onClick={() => onNavigate('demo')} className="btn btn-glass">
                Tester la démo
              </button>
              <button onClick={onOpenAssistantModal} className="btn btn-primary">
                <span>Créer mon assistant</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
