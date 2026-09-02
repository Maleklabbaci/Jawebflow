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
  const [copiedCode, setCopiedCode] = useState(false);
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

  const scriptCode = `<script src="https://jawebflow.dz/cdn/widget.js" data-assistant-id="${config.assistantId}" async></script>`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <section 
      id="demo-section"
      className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12 w-full flex flex-col items-center"
    >
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/80 border border-purple-500/30 text-xs font-semibold text-purple-200 mb-3 backdrop-blur-xl">
          <Globe className="w-3.5 h-3.5 text-purple-300" />
          <span>Aperçu de l'intégration sur votre site</span>
        </div>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white font-display mb-2">
          Le widget en conditions réelles.
        </h2>
        <p className="text-xs sm:text-sm text-neutral-300">
          Sélectionnez un secteur d'activité et testez les réponses instantanées en Français et en Darija algérienne.
        </p>
      </div>

      {/* Sector Switcher Controls */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-neutral-950/70 border border-white/10 backdrop-blur-xl mb-5 w-full max-w-xl">
        <button
          onClick={() => handleSelectSector('ecommerce')}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer truncate ${
            selectedSector === 'ecommerce'
              ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
              : 'text-neutral-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">E-commerce</span>
        </button>

        <button
          onClick={() => handleSelectSector('services')}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer truncate ${
            selectedSector === 'services'
              ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
              : 'text-neutral-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Services & Agence</span>
        </button>

        <button
          onClick={() => handleSelectSector('formation')}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer truncate ${
            selectedSector === 'formation'
              ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
              : 'text-neutral-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Formation Pro</span>
        </button>
      </div>

      {/* Realistic Simulated Browser Window */}
      <div className="relative w-full rounded-3xl bg-neutral-950/80 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-purple-950/40 overflow-hidden flex flex-col">
        
        {/* Browser Top Navigation Bar */}
        <div className="px-4 py-3 bg-neutral-900/90 border-b border-white/10 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>

          <div className="flex-1 max-w-md mx-auto bg-neutral-950/80 border border-white/10 rounded-xl px-3 py-1.5 flex items-center justify-center gap-2 text-neutral-300 text-xs font-mono">
            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs">{config.url}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-neutral-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Widget Actif</span>
          </div>
        </div>

        {/* Simulated Web Page Content Area with Live Floating Widget */}
        <div className="relative min-h-[480px] sm:min-h-[530px] p-5 sm:p-8 bg-gradient-to-b from-neutral-900/40 to-neutral-950/90 flex flex-col justify-between overflow-hidden">
          
          {/* Simulated Website Background Elements */}
          <div className="max-w-xl space-y-4 text-left pointer-events-none select-none opacity-90">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 font-medium">
              <span>{config.sectorName}</span>
            </div>

            <h3 className="text-xl sm:text-3xl font-bold text-white font-display leading-tight">
              {config.siteHeroTitle}
            </h3>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              {config.siteHeroDesc}
            </p>

            {/* Product/Service Cards on the Simulated Site */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-neutral-900/60 border border-white/10">
                <div className="text-xs font-semibold text-white">{config.siteItem1.title}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{config.siteItem1.desc}</div>
                <div className="text-xs font-bold text-purple-300 mt-2">{config.siteItem1.price}</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-900/60 border border-white/10">
                <div className="text-xs font-semibold text-white">{config.siteItem2.title}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{config.siteItem2.desc}</div>
                <div className="text-xs font-bold text-purple-300 mt-2">{config.siteItem2.price}</div>
              </div>
            </div>
          </div>

          {/* REAL EMBEDDED WIDGET (Positioned at bottom-right inside the simulated client site) */}
          <div className="absolute bottom-2 right-2 sm:bottom-6 sm:right-6 z-30 flex flex-col items-end max-w-[calc(100%-1rem)] sm:max-w-[390px] pointer-events-none">
            
            {/* Widget Modal Window */}
            {widgetOpen ? (
              <div 
                id="real-embedded-widget-window"
                className="w-[calc(100vw-3rem)] sm:w-[360px] max-w-full h-[430px] max-h-[calc(100%-1rem)] rounded-3xl bg-neutral-950 border border-purple-500/30 backdrop-blur-2xl shadow-2xl shadow-purple-950/60 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 pointer-events-auto"
              >
                {/* Widget Header */}
                <div className="p-3 sm:p-3.5 bg-neutral-900 border-b border-white/10 flex items-center justify-between text-white shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-md shadow-purple-600/30">
                        {config.avatarText}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-neutral-950"></span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-xs text-white flex items-center gap-1.5 truncate">
                        <span className="truncate">{config.businessName}</span>
                      </h4>
                      <p className="text-[10px] text-emerald-400 font-medium truncate">
                        En ligne • Réponse immédiate
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <button
                      type="button"
                      onClick={() => setMessages(config.initialMessages)}
                      title="Réinitialiser la discussion"
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWidgetOpen(false)}
                      title="Réduire"
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Messages Body */}
                <div 
                  ref={chatScrollRef}
                  className="flex-1 p-3 sm:p-3.5 overflow-y-auto space-y-2.5 bg-[#0a0c13] overscroll-contain"
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
                          className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm break-words ${
                            isAssistant
                              ? 'bg-neutral-900 text-neutral-100 border border-white/10 rounded-tl-sm'
                              : 'bg-purple-600 text-white rounded-tr-sm font-medium'
                          }`}
                        >
                          {renderMessageContent(m.text, 'dark')}
                        </div>
                        <div className={`text-[9px] mt-0.5 px-1 flex items-center gap-1 ${
                          isAssistant ? 'text-neutral-400' : 'text-purple-300'
                        }`}>
                          <span>{m.timestamp}</span>
                          {!isAssistant && <CheckCheck className="w-3 h-3 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}

                  {/* Lead Capture Interactive Prompt */}
                  {showLeadPrompt && !leadSuccess && (
                    <form onSubmit={handleLeadSubmit} className="p-3 rounded-2xl bg-neutral-900 border border-purple-500/30 space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-semibold text-purple-200 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-purple-400 shrink-0" />
                        <span>Recevoir votre devis / être rappelé :</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="tel"
                          value={leadPhone}
                          onChange={(e) => setLeadPhone(e.target.value)}
                          placeholder="Ex: 0550 12 34 56"
                          className="flex-1 bg-neutral-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
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
                <div className="px-2.5 py-2 bg-neutral-900 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto shrink-0 overscroll-x-contain" style={{ scrollbarWidth: 'none' }}>
                  {config.quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(q.text)}
                      className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-purple-600/30 text-neutral-300 hover:text-white border border-white/10 hover:border-purple-500/40 whitespace-nowrap transition-all shrink-0 cursor-pointer"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Input Footer */}
                <div className="p-2.5 bg-neutral-900 border-t border-white/10 flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Posez votre question…"
                    className="flex-1 min-w-0 bg-neutral-950 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim()}
                    className="w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="Envoyer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              /* Minimized Floating Launcher Button */
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setWidgetOpen(true)}
                  className="px-3 sm:px-3.5 py-2 rounded-2xl bg-neutral-950/90 border border-purple-500/40 text-xs text-white shadow-xl flex items-center gap-2 cursor-pointer hover:border-purple-400 transition-all max-w-[calc(100vw-6rem)] sm:max-w-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span className="truncate">Une question ? Discutons en direct 👋</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWidgetOpen(true)}
                  className="p-3 sm:p-3.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-xl shadow-purple-600/40 hover:scale-105 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  aria-label="Ouvrir le chat"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Bar Below Preview: Embed Snippet & Creator Trigger */}
        <div className="p-4 bg-neutral-900/95 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-neutral-300 w-full sm:w-auto">
            <Code2 className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="font-mono text-[11px] truncate max-w-[280px] sm:max-w-md text-neutral-400">
              {scriptCode}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleCopyScript}
              className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 font-medium"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Code copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Copier le script</span>
                </>
              )}
            </button>

            {onOpenAssistantModal && (
              <button
                onClick={onOpenAssistantModal}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/30 cursor-pointer shrink-0"
              >
                <span>Installer sur mon site</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
