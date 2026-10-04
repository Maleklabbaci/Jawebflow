import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  CheckCheck, 
  RotateCcw, 
  Globe, 
  Briefcase,
  ShoppingBag,
  GraduationCap,
  MessageSquare,
  X,
  Minus,
  Lock,
  Code2,
  Copy,
  Check,
  ArrowRight,
  Phone,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { renderMessageContent } from '../utils/renderMessageContent';
import { ChatMessage } from '../types';

interface InteractiveChatMockupProps {
  onOpenKnowledgeDetails?: () => void;
  onOpenAssistantModal?: () => void;
}

type BusinessType = 'ecommerce' | 'services' | 'formation';

interface SuggestionQA {
  label: string;
  text: string;
  answer: string;
}

interface SectorConfig {
  id: BusinessType;
  assistantId: string;
  businessName: string;
  url: string;
  badge: string;
  avatarText: string;
  sectorName: string;
  siteHeroTitle: string;
  siteHeroDesc: string;
  siteItem1: { title: string; desc: string; price: string };
  siteItem2: { title: string; desc: string; price: string };
  initialMessages: ChatMessage[];
  quickQuestions: SuggestionQA[];
  presetAnswers: Record<string, string>;
  fallbackAnswer: string;
}

const SECTOR_CONFIGS: Record<BusinessType, SectorConfig> = {
  ecommerce: {
    id: 'ecommerce',
    assistantId: 'demo_ecommerce',
    businessName: 'Maison Lila Cosmétiques',
    url: 'https://maisonlila.dz',
    badge: 'Boutique E-commerce',
    avatarText: 'ML',
    sectorName: 'Soins naturels & Cosmétiques',
    siteHeroTitle: 'Soins naturels & bio d’Algérie',
    siteHeroDesc: 'Cosmétiques certifiés 100% purs et pressés à froid, livrés sous 24/48h dans les 58 wilayas.',
    siteItem1: { title: 'Pack Soin Bio Complet', desc: 'Huile d’argan, eau de rose & karité', price: '3 800 DA' },
    siteItem2: { title: 'Sérum Éclat Hydratant', desc: 'Formule enrichie vitamine C & acide hyaluronique', price: '2 400 DA' },
    initialMessages: [
      {
        id: '1',
        sender: 'assistant',
        text: 'Bonjour ! 👋 Bienvenue chez Maison Lila. Comment puis-je vous renseigner sur nos soins ou votre livraison ?',
        timestamp: '14:20',
        isAiVerified: true,
      }
    ],
    quickQuestions: [
      { 
        label: '🚚 Délais & Wilayas', 
        text: 'Chhal waqt pour la livraison et quelles sont les wilayas desservies ?',
        answer: 'Nous livrons dans les 58 wilayas ! Livraison en 24h sur Alger, Blida, Boumerdès et Tipaza (400 DA), et 48h à 72h pour les autres wilayas (600 DA). Le livreur vous contacte 1h avant.'
      },
      { 
        label: '💳 Modes de paiement', 
        text: 'Quels sont les modes de paiement acceptés ?',
        answer: 'Vous pouvez payer en espèces à la livraison (Cash on Delivery) après vérification de votre colis, ou par virement instantané BaridiMob avec reçu de confirmation.'
      },
      { 
        label: '🌿 Ingrédients pack bio', 
        text: 'Le pack soin est-il adapté aux peaux sensibles ?',
        answer: 'Oui, notre Pack Soin Bio est formulé à base d\'huile d\'argan pure certifiée, sans parabènes, sulfates ni parfum synthétique, idéal pour les peaux sensibles et réactives.'
      },
      { 
        label: '📦 Suivi de commande', 
        text: 'Comment puis-je suivre l\'acheminement de mon colis ?',
        answer: 'Dès expédition de votre colis, vous recevez un SMS contenant votre numéro de suivi et le numéro direct de l\'agence de livraison assignée à votre wilaya.'
      }
    ],
    presetAnswers: {
      prix: 'Le Pack Soin Bio complet est à 3 800 DA et le Sérum Éclat est à 2 400 DA. Livraison offerte dès 7 000 DA d\'achats.',
      livraison: 'Livraison sous 24h sur Alger & environs, 48h à 72h pour les 54 autres wilayas avec paiement sécurisé à la réception.',
      baridimob: 'Nous acceptons les règlements par BaridiMob. Notre RIP vous est transmis dès validation de votre commande.'
    },
    fallbackAnswer: 'Bonjour ! Maison Lila propose des cosmétiques 100% naturels livrés partout en Algérie. Souhaitez-vous passer commande ou obtenir un renseignement précis ?'
  },
  services: {
    id: 'services',
    assistantId: 'demo_services',
    businessName: 'Nexus Conseil & Web',
    url: 'https://nexus-conseil.dz',
    badge: 'Services B2B & Conseil',
    avatarText: 'NX',
    sectorName: 'Agence Digitale & Conseil',
    siteHeroTitle: 'Transformation & Performance Digitale',
    siteHeroDesc: 'Audits techniques, référencement SEO et développement web pour les PME et grands comptes en Algérie.',
    siteItem1: { title: 'Audit SEO & Performance', desc: 'Rapport complet 360° sous 48h', price: 'Sur devis' },
    siteItem2: { title: 'Forfait Accompagnement', desc: 'Suivi technique & croissance mensuelle', price: 'Dès 25 000 DA/m' },
    initialMessages: [
      {
        id: '1',
        sender: 'assistant',
        text: 'Bonjour ! 👋 Bienvenue chez Nexus Conseil. Comment pouvons-nous vous accompagner dans votre projet ?',
        timestamp: '11:15',
        isAiVerified: true,
      }
    ],
    quickQuestions: [
      { 
        label: '⏱️ Délais d\'audit web', 
        text: 'Quel est le délai pour recevoir un audit complet de notre site ?',
        answer: 'L\'audit complet (SEO, UX, sécurité et performances) est réalisé et livré sous 48h ouvrées avec rapport détaillé et devis proforma certifié.'
      },
      { 
        label: '💼 Forfaits mensuels', 
        text: 'Quels sont vos forfaits d\'accompagnement mensuel ?',
        answer: 'Nos forfaits débutent à 25 000 DA/mois : ils comprennent le suivi technique en continu, l\'optimisation SEO et deux réunions de cadrage mensuelles avec votre chef de projet.'
      },
      { 
        label: '📍 Déplacements & Wilayas', 
        text: 'Intervenez-vous en présentiel ou à distance ?',
        answer: 'Nous intervenons sur l\'ensemble des 58 wilayas à distance, et en présentiel à Alger, Oran et Constantine pour les réunions de cadrage et ateliers techniques.'
      },
      { 
        label: '📄 Facturation proforma', 
        text: 'Émettez-vous des factures proforma certifiées ?',
        answer: 'Oui, nous fournissons systématiquement des factures proforma et factures conformes (avec NIF, NIS, RC et RIB bancaire) pour les paiements par virement ou chèque.'
      }
    ],
    presetAnswers: {
      prix: 'Nos forfaits d\'accompagnement débutent à 25 000 DA/mois. Les audits ponctuels sont livrés sous 48h avec devis sur-mesure.',
      devis: 'Nous préparons votre devis proforma sous 24h ouvrées. Vous pouvez nous laisser votre numéro pour un cadrage rapide.',
      contact: 'Notre équipe est joignable du dimanche au jeudi de 8h30 à 17h00. Laissez-nous vos coordonnées pour être rappelé.'
    },
    fallbackAnswer: 'Merci pour votre question ! Nexus Conseil accompagne les entreprises dans leurs audits et développements sur-mesure. Souhaitez-vous un devis ou un rappel ?'
  },
  formation: {
    id: 'formation',
    assistantId: 'demo_formation',
    businessName: 'Horizon Academy',
    url: 'https://horizon-academy.dz',
    badge: 'Formation Professionnelle',
    avatarText: 'HA',
    sectorName: 'Institut de Formation Continue',
    siteHeroTitle: 'Formations Certifiantes d’Excellence',
    siteHeroDesc: 'Développez vos compétences en Management, Marketing & Gestion avec des formateurs experts du marché.',
    siteItem1: { title: 'Management & Leadership', desc: 'Cursus certifiant 30 heures', price: '38 000 DA' },
    siteItem2: { title: 'Marketing Digital & Growth', desc: 'Pratique concrète sur cas réels', price: '32 000 DA' },
    initialMessages: [
      {
        id: '1',
        sender: 'assistant',
        text: 'Bonjour ! 👋 Bienvenue à Horizon Academy. Quelle formation certifiante vous intéresse ?',
        timestamp: '09:30',
        isAiVerified: true,
      }
    ],
    quickQuestions: [
      { 
        label: '📅 Prochaine cohorte', 
        text: 'Quand débute la prochaine session de formation ?',
        answer: 'La prochaine session démarre le 15 du mois prochain. Les inscriptions sont ouvertes dès aujourd\'hui en groupe limité à 15 participants.'
      },
      { 
        label: '💳 Facilités de paiement', 
        text: 'Peut-on échelonner le paiement de la formation ?',
        answer: 'Oui, nous proposons un paiement échelonné en 2 ou 3 mensualités sans frais supplémentaires par BaridiMob, virement bancaire ou en espèces.'
      },
      { 
        label: '🎓 Certificat délivré', 
        text: 'La formation donne-t-elle droit à une attestation officielle ?',
        answer: 'Oui, après validation du projet pratique final, vous recevez une attestation et un certificat de réussite professionnel reconnu.'
      },
      { 
        label: '💻 Cours du soir & weekend', 
        text: 'Proposez-vous des formules adaptées aux salariés ?',
        answer: 'Oui, 2 formules sont disponibles : Cours du soir (18h30-21h en direct en ligne) ou Session Weekend le samedi (9h-16h30) avec accès illimité aux replays.'
      }
    ],
    presetAnswers: {
      prix: 'Le cursus complet de 30 heures est à 38 000 DA avec facilités de règlement en 2 ou 3 fois sans frais.',
      certificat: 'Un certificat professionnel officiel vous est remis à l\'issue de la validation de votre projet pratique.',
      inscription: 'L\'inscription s\'effectue en 2 minutes avec une pièce d\'identité et le premier versement d\'acompte.'
    },
    fallbackAnswer: 'Bonjour ! Horizon Academy forme chaque mois des dizaines de cadres et étudiants. Souhaitez-vous recevoir le programme détaillé au format PDF ?'
  }
};

export const InteractiveChatMockup: React.FC<InteractiveChatMockupProps> = ({
  onOpenAssistantModal
}) => {
  const [selectedSector, setSelectedSector] = useState<BusinessType>('ecommerce');
  const config = SECTOR_CONFIGS[selectedSector];

  const [widgetOpen, setWidgetOpen] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(config.initialMessages);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLeadPrompt, setShowLeadPrompt] = useState(false);
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSuccess, setLeadSuccess] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Switch sector preset
  const handleSelectSector = (type: BusinessType) => {
    setSelectedSector(type);
    setMessages(SECTOR_CONFIGS[type].initialMessages);
    setInputText('');
    setIsTyping(false);
    setShowLeadPrompt(false);
    setLeadPhone('');
    setLeadSuccess(false);
    setWidgetOpen(true);
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, showLeadPrompt]);

  const triggerInstantAnswer = (userText: string, botText: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: botText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiVerified: true,
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 280);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    // Check matching quick questions for instant zero-latency feedback
    const matchedQuick = config.quickQuestions.find(
      q => q.text.toLowerCase() === text.toLowerCase() || q.label.toLowerCase() === text.toLowerCase()
    );
    if (matchedQuick) {
      triggerInstantAnswer(matchedQuick.text, matchedQuick.answer);
      if (!textToSend) setInputText('');
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    // Check preset keywords
    const lower = text.toLowerCase();
    let keywordAnswer = '';
    if (lower.includes('prix') || lower.includes('combien') || lower.includes('chhal') || lower.includes('tarif')) {
      keywordAnswer = config.presetAnswers.prix;
      setShowLeadPrompt(true);
    } else if (lower.includes('livraison') || lower.includes('delai') || lower.includes('délai') || lower.includes('wilaya')) {
      keywordAnswer = config.presetAnswers.livraison || config.quickQuestions[0].answer;
    } else if (lower.includes('baridimob') || lower.includes('ccp') || lower.includes('paiement') || lower.includes('payer')) {
      keywordAnswer = config.presetAnswers.baridimob || config.quickQuestions[1].answer;
    } else if (lower.includes('contact') || lower.includes('telephone') || lower.includes('téléphone') || lower.includes('devis')) {
      keywordAnswer = config.presetAnswers.contact || config.presetAnswers.devis || 'Vous pouvez nous laisser votre numéro de téléphone afin qu\'un conseiller prenne contact avec vous.';
      setShowLeadPrompt(true);
    }

    if (keywordAnswer) {
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: keywordAnswer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isAiVerified: true,
        };
        setMessages(prev => [...prev, botMsg]);
        setIsTyping(false);
      }, 350);
      return;
    }

    // Call real /api/chat
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: config.assistantId,
          businessName: config.businessName,
          websiteUrl: config.url,
          message: text
        })
      });

      let reply = '';
      if (response.ok) {
        const data = await response.json();
        reply = data.text || data.message || data.response || '';
      }

      if (!reply) {
        reply = config.fallbackAnswer;
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiVerified: true,
      };

      setMessages(prev => [...prev, botMsg]);
    } catch {
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: config.fallbackAnswer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiVerified: true,
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadPhone.trim()) return;
    setLeadSuccess(true);
    setShowLeadPrompt(false);
    const confirmationMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'assistant',
      text: `✅ Coordonnées bien enregistrées (${leadPhone}) ! Notre équipe vous recontacte dans les plus brefs délais.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAiVerified: true,
    };
    setMessages(prev => [...prev, confirmationMsg]);
  };

  return (
    <section 
      id="demo-section"
      className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12 w-full flex flex-col items-center"
    >
      {/* Section Header */}
      <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
        <span className="lux-eyebrow">
          <Globe className="h-3.5 w-3.5 text-purple-300" />
          Démo en direct — sans inscription
        </span>

        <h2 className="lux-h2 mt-5">
          Écrivez comme vos clients écrivent. <br className="hidden sm:inline" />
          <span className="lux-accent">Regardez ce qu’ils reçoivent.</span>
        </h2>
        <p className="lux-lead mx-auto mt-4 max-w-2xl">
          Choisissez votre secteur, posez une question en français ou en darija,
          et voyez exactement ce que verrait un visiteur sur votre site.
        </p>
      </div>

      {/* Sector Switcher Controls */}
      <div className="mb-6 grid w-full max-w-xl grid-cols-3 gap-1 rounded-[14px] border border-white/[0.09] bg-white/[0.03] p-1 backdrop-blur-xl">
        {([
          { id: 'ecommerce' as const, label: 'E-commerce', icon: ShoppingBag },
          { id: 'services' as const, label: 'Services & Agence', icon: Briefcase },
          { id: 'formation' as const, label: 'Formation Pro', icon: GraduationCap },
        ]).map((sector) => {
          const SectorIcon = sector.icon;
          const isActive = selectedSector === sector.id;
          return (
            <button
              key={sector.id}
              onClick={() => handleSelectSector(sector.id)}
              aria-pressed={isActive}
              className={`flex cursor-pointer items-center justify-center gap-1.5 truncate rounded-[10px] px-3 py-2 text-[0.76rem] font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-purple-600/90 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                  : 'text-neutral-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <SectorIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{sector.label}</span>
            </button>
          );
        })}
      </div>

      {/* Realistic Simulated Browser Window */}
      <div className="lux-card relative flex w-full flex-col overflow-hidden">
        
        {/* Browser Top Navigation Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-black/30 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/15"></span>
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/15"></span>
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/15"></span>
          </div>

          <div className="mx-auto flex flex-1 max-w-md items-center justify-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-neutral-300">
            <Lock className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className="truncate text-[11px] sm:text-xs">{config.url}</span>
          </div>

          <div className="hidden items-center gap-2 text-[11px] text-neutral-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span>Widget actif</span>
          </div>
        </div>

        {/* Simulated Web Page Content Area with Live Floating Widget */}
        <div className="relative min-h-[480px] sm:min-h-[530px] p-5 sm:p-8 bg-gradient-to-b from-neutral-900/40 to-neutral-950/90 flex flex-col justify-between overflow-hidden">
          
          {/* Simulated Website Background Elements */}
          <div className="pointer-events-none max-w-xl select-none space-y-4 text-left opacity-95">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-[0.72rem] font-medium text-purple-200">
              <span>{config.sectorName}</span>
            </div>

            <h3 className="lux-h3 text-[1.25rem] sm:text-[1.8rem]">
              {config.siteHeroTitle}
            </h3>

            <p className="lux-sub max-w-md text-[0.8rem] sm:text-[0.86rem]">
              {config.siteHeroDesc}
            </p>

            {/* Product/Service Cards on the Simulated Site */}
            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <div className="text-[0.78rem] font-semibold text-white">{config.siteItem1.title}</div>
                <div className="mt-0.5 text-[0.7rem] font-light text-neutral-400">{config.siteItem1.desc}</div>
                <div className="mt-2 text-[0.78rem] font-semibold text-purple-300">{config.siteItem1.price}</div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <div className="text-[0.78rem] font-semibold text-white">{config.siteItem2.title}</div>
                <div className="mt-0.5 text-[0.7rem] font-light text-neutral-400">{config.siteItem2.desc}</div>
                <div className="mt-2 text-[0.78rem] font-semibold text-purple-300">{config.siteItem2.price}</div>
              </div>
            </div>
          </div>

          {/* REAL EMBEDDED WIDGET (Positioned at bottom-right inside the simulated client site) */}
          <div className="absolute bottom-2 right-2 sm:bottom-6 sm:right-6 z-30 flex flex-col items-end max-w-[calc(100%-1rem)] sm:max-w-[390px] pointer-events-none">
            
            {/* Widget Modal Window */}
            {widgetOpen ? (
              <div 
                id="real-embedded-widget-window"
                className="pointer-events-auto flex h-[430px] max-h-[calc(100%-1rem)] w-[calc(100vw-3rem)] max-w-full flex-col overflow-hidden rounded-[22px] border border-purple-400/25 bg-[#0b0912] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl animate-in zoom-in-95 duration-200 sm:w-[360px]"
              >
                {/* Widget Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.03] p-3 text-white sm:p-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative shrink-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-purple-500 to-purple-700 text-[0.7rem] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                        {config.avatarText}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0912] bg-emerald-400"></span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="flex items-center gap-1.5 truncate text-[0.75rem] font-semibold text-white">
                        <span className="truncate">{config.businessName}</span>
                      </h4>
                      <p className="truncate text-[0.62rem] font-light text-emerald-400">
                        En ligne • réponse immédiate
                      </p>
                    </div>
                  </div>

                  <div className="ml-1 flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMessages(config.initialMessages)}
                      title="Réinitialiser la discussion"
                      aria-label="Réinitialiser la discussion"
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/[0.05] text-neutral-400 transition-colors hover:bg-white/[0.12] hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWidgetOpen(false)}
                      title="Réduire"
                      aria-label="Réduire la discussion"
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/[0.05] text-neutral-400 transition-colors hover:bg-white/[0.12] hover:text-white"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Messages Body */}
                <div 
                  ref={chatScrollRef}
                  className="flex-1 space-y-2.5 overflow-y-auto bg-[#08070e] p-3 sm:p-3.5 overscroll-contain"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
                >
                  {messages.map((m) => {
                    const isAssistant = m.sender === 'assistant';
                    return (
                      <div 
                        key={m.id}
                        className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                      >
                        <div 
                          className={`max-w-[90%] break-words rounded-2xl px-3.5 py-2 text-[0.76rem] font-light leading-relaxed ${
                            isAssistant
                              ? 'rounded-tl-sm border border-white/[0.07] bg-white/[0.045] text-neutral-100'
                              : 'rounded-tr-sm bg-purple-600 font-normal text-white'
                          }`}
                        >
                          {renderMessageContent(m.text, 'dark')}
                        </div>
                        <div className={`mt-0.5 flex items-center gap-1 px-1 text-[0.58rem] ${
                          isAssistant ? 'text-neutral-500' : 'text-purple-300'
                        }`}>
                          <span>{m.timestamp}</span>
                          {!isAssistant && <CheckCheck className="h-3 w-3 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}

                  {/* Lead Capture Interactive Prompt */}
                  {showLeadPrompt && !leadSuccess && (
                    <form onSubmit={handleLeadSubmit} className="animate-in fade-in space-y-2 rounded-2xl border border-purple-400/25 bg-purple-500/[0.07] p-3">
                      <div className="flex items-center gap-1.5 text-[0.68rem] font-medium text-purple-100">
                        <Phone className="h-3 w-3 shrink-0 text-purple-300" />
                        <span>Laissez votre numéro : on vous rappelle</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="tel"
                          value={leadPhone}
                          onChange={(e) => setLeadPhone(e.target.value)}
                          placeholder="Ex : 0550 12 34 56"
                          className="lux-input min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5 text-[0.72rem]"
                        />
                        <button
                          type="submit"
                          className="btn btn-sm btn-primary shrink-0 px-3 py-2 text-[0.7rem]"
                        >
                          Valider
                        </button>
                      </div>
                    </form>
                  )}

                  {isTyping && (
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-neutral-900 border border-white/10 w-14">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  )}
                </div>

                {/* Suggestion Chips */}
                <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-white/[0.07] bg-white/[0.02] px-2.5 py-2 overscroll-x-contain" style={{ scrollbarWidth: 'none' }}>
                  {config.quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(q.text)}
                      className="lux-chip shrink-0 px-2.5 py-1 text-[0.65rem]"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Input Footer */}
                <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] bg-white/[0.03] p-2.5">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Écrivez votre question…"
                    aria-label="Votre question pour la démo"
                    className="lux-input min-w-0 flex-1 rounded-[10px] px-3 py-1.5 text-[0.74rem]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim()}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Envoyer"
                    aria-label="Envoyer le message"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              /* Minimized Floating Launcher Button */
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWidgetOpen(true)}
                  className="flex max-w-[calc(100vw-6rem)] cursor-pointer items-center gap-2 rounded-xl border border-white/[0.12] bg-[#0b0912]/95 px-3 py-2 text-[0.72rem] text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors hover:border-purple-400/40 sm:max-w-xs sm:px-3.5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400"></span>
                  <span className="truncate">Une question ? Discutons en direct 👋</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWidgetOpen(true)}
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-purple-500 to-purple-700 p-3 text-white shadow-[0_18px_40px_-22px_rgba(124,58,237,1)] transition-transform hover:scale-[1.04] sm:p-3.5"
                  aria-label="Ouvrir le chat"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Barre d'action simple : pas de code affiché au visiteur */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] bg-black/25 p-4 text-xs sm:flex-row">
          <p className="lux-sub text-center text-[0.78rem] sm:text-left">
            Voilà exactement ce que verront vos visiteurs — et vous, vous recevez leurs coordonnées.
          </p>

          <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-end">
            {onOpenAssistantModal && (
              <button
                onClick={onOpenAssistantModal}
                className="btn btn-sm btn-primary shrink-0"
              >
                <span>Créer mon assistant</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

