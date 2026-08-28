import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Check, 
  CheckCheck, 
  ShieldCheck, 
  RotateCcw, 
  MessageCircle, 
  Globe, 
  Layers,
  Briefcase,
  ShoppingBag,
  GraduationCap
} from 'lucide-react';
import { ChatMessage } from '../types';

interface InteractiveChatMockupProps {
  onOpenKnowledgeDetails?: () => void;
}

type BusinessType = 'services' | 'ecommerce' | 'formation';

interface BusinessConfig {
  id: BusinessType;
  title: string;
  badge: string;
  avatar: string;
  sectorLabel: string;
  initialMessages: ChatMessage[];
  quickQuestions: { label: string; text: string }[];
}

const BUSINESS_PRESETS: Record<BusinessType, BusinessConfig> = {
  services: {
    id: 'services',
    title: 'Nexus Conseil & Web',
    badge: 'Agence & Services',
    avatar: 'NX',
    sectorLabel: 'Services B2B & Conseil Digital',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Salam, chhal waqt pour faire un audit de notre site web ?',
        timestamp: '11:15',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! Un audit complet (SEO, UX et performances) est réalisé sous 48h ouvrées avec un rapport PDF et une session de débriefing visio.',
        timestamp: '11:15',
        isAiVerified: true,
      },
      {
        id: '3',
        sender: 'user',
        text: 'Est-ce que vous faites aussi le devis avec facture proforma ?',
        timestamp: '11:16',
      },
      {
        id: '4',
        sender: 'assistant',
        text: 'Tout à fait. Toutes nos prestations sont éligibles à la facturation société avec devis proforma et coordonnées fiscales transmis sous 2h.',
        timestamp: '11:16',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📊 Tarifs forfaits ?', text: 'Quels sont vos forfaits d\'accompagnement mensuel ?' },
      { label: '📍 Zones d\'intervention', text: 'Intervenez-vous sur site et à distance ?' },
      { label: '⏱️ Délais d\'intervention', text: 'Quel est le délai pour démarrer un projet ?' },
      { label: '📑 Modalités paiement', text: 'Quelles sont les modalités d\'acompte et paiement ?' }
    ]
  },
  ecommerce: {
    id: 'ecommerce',
    title: 'Maison Lila',
    badge: 'E-commerce & Boutique',
    avatar: 'ML',
    sectorLabel: 'Boutique Soins & Cosmétiques',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Salam, chhal waqt la livraison w kifach ncommondi ?',
        timestamp: '14:20',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! La livraison s\'effectue sous 24h à 48h à domicile ou en point relais sécurisé. Quel soin souhaitez-vous découvrir ?',
        timestamp: '14:20',
        isAiVerified: true,
      },
      {
        id: '3',
        sender: 'user',
        text: 'Le prix du pack soin et le mode de paiement ?',
        timestamp: '14:21',
      },
      {
        id: '4',
        sender: 'assistant',
        text: 'Le Pack Soin complet est à 3 800 DA. Le paiement peut se faire à la livraison ou en ligne selon votre choix.',
        timestamp: '14:21',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📦 Délais d\'envoi', text: 'Chhal waqt pour recevoir ma commande ?' },
      { label: '💵 Mode de paiement', text: 'Quels sont les modes de paiement acceptés ?' },
      { label: '🌿 Pack Soin bio', text: 'Chnou houma les composants du pack soin ?' },
      { label: '📍 Suivi de colis', text: 'Comment puis-je suivre mon colis en temps réel ?' }
    ]
  },
  formation: {
    id: 'formation',
    title: 'Horizon Academy',
    badge: 'Formation & Institut',
    avatar: 'HA',
    sectorLabel: 'Institut de Formation Professionnelle',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Bonjour, la formation en Management est disponible en ligne ou présentiel ?',
        timestamp: '09:30',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! Nous proposons les 2 formats : sessions en présentiel en centre et sessions 100% en ligne avec formateurs certifiés.',
        timestamp: '09:30',
        isAiVerified: true,
      },
      {
        id: '3',
        sender: 'user',
        text: 'Kayen attestation ou certificat à la fin ?',
        timestamp: '09:31',
      },
      {
        id: '4',
        sender: 'assistant',
        text: 'Oui, chaque participant reçoit un certificat de réussite officiel avec attestation de validation et support de cours complet.',
        timestamp: '09:31',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📅 Prochaine session', text: 'Quand commence la prochaine session de formation ?' },
      { label: '💳 Tarifs & Facilité', text: 'Quel est le prix et y a-t-il un paiement en plusieurs tranches ?' },
      { label: '📍 Modalités cours', text: 'Quelles sont les modalités des cours du soir et weekend ?' },
      { label: '🎓 Prérequis', text: 'Quels sont les prérequis pour s\'inscrire ?' }
    ]
  }
};

export const InteractiveChatMockup: React.FC<InteractiveChatMockupProps> = ({ onOpenKnowledgeDetails }) => {
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessType>('services');
  const currentConfig = BUSINESS_PRESETS[selectedBusiness];

  const [messages, setMessages] = useState<ChatMessage[]>(currentConfig.initialMessages);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'web' | 'whatsapp'>('web');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Switch business preset
  const handleSelectBusiness = (type: BusinessType) => {
    setSelectedBusiness(type);
    setMessages(BUSINESS_PRESETS[type].initialMessages);
    setInputText('');
    setIsTyping(false);
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      let reply = `Je vérifie dans la base de connaissances certifiée de ${currentConfig.title} pour vous donner l'information exacte.`;
      const lower = text.toLowerCase();

      if (selectedBusiness === 'services') {
        if (lower.includes('tarif') || lower.includes('forfait') || lower.includes('prix') || lower.includes('chhal')) {
          reply = "Nos forfaits démarrent à partir de 45 000 DZD pour l'accompagnement mensuel de base. Nous fournissons une offre sur-mesure adaptée à votre cahier des charges.";
        } else if (lower.includes('zone') || lower.includes('région') || lower.includes('déplacement') || lower.includes('site') || lower.includes('ville')) {
          reply = "Nous intervenons dans toutes les zones et régions ! Nos consultants se déplacent sur site pour les réunions de cadrage et ateliers, ou travaillent en visioconférence sécurisée.";
        } else if (lower.includes('délai') || lower.includes('waqt') || lower.includes('démarrer')) {
          reply = "La prise en charge se fait sous 48h à 72h dès la validation du bon de commande. Un chef de projet dédié vous est immédiatement assigné.";
        } else if (lower.includes('modalité') || lower.includes('paiement') || lower.includes('acompte')) {
          reply = "Le règlement s'effectue par virement bancaire, chèque ou carte avec un acompte au lancement et le solde à la livraison validée.";
        } else {
          reply = `Selon la documentation de ${currentConfig.title}, notre équipe est disponible du lundi au samedi pour répondre à toutes vos demandes de devis et partenariats.`;
        }
      } else if (selectedBusiness === 'ecommerce') {
        if (lower.includes('délai') || lower.includes('waqt') || lower.includes('livraison') || lower.includes('zone')) {
          reply = "La livraison s'effectue rapidement sous 24h à 48h selon votre zone géographique, à domicile ou en point relais sécurisé.";
        } else if (lower.includes('paiement') || lower.includes('main') || lower.includes('carte')) {
          reply = "Oui bien sûr ! Le paiement se fait à la livraison ou en ligne selon vos préférences.";
        } else if (lower.includes('soin') || lower.includes('produit') || lower.includes('pack')) {
          reply = "Le Pack Soin Naturel comprend un sérum éclat et une crème réparatrice bio haute qualité.";
        } else {
          reply = `Toutes les commandes passées chez ${currentConfig.title} bénéficient du suivi en temps réel et d'un service client réactif.`;
        }
      } else {
        // Formation
        if (lower.includes('session') || lower.includes('date') || lower.includes('quand') || lower.includes('démarre')) {
          reply = "La prochaine session intensive démarre le mois prochain. Les inscriptions sont ouvertes et limitées à 12 personnes par groupe.";
        } else if (lower.includes('prix') || lower.includes('tarif') || lower.includes('tranche') || lower.includes('facilité')) {
          reply = "Le cycle complet de formation inclut une possibilité de règlement en plusieurs mensualités sans frais.";
        } else if (lower.includes('centre') || lower.includes('lieu') || lower.includes('adresse') || lower.includes('distance')) {
          reply = "Nos formations sont accessibles en présentiel dans nos centres partenaires ou 100% en ligne en direct avec formateurs.";
        } else {
          reply = "Tous nos programmes incluent les supports pédagogiques, l'accès à notre plateforme e-learning et un accompagnement individuel par les formateurs.";
        }
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiVerified: true,
      };

      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 650);
  };

  const handleReset = () => {
    setMessages(currentConfig.initialMessages);
  };

  return (
    <section 
      id="demo-section"
      className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full flex flex-col items-start"
    >
      {/* Container aligned to the left, compact & ultra-translucent frosted glass */}
      <div className="w-full max-w-2xl">
        {/* Knowledge Context Badges Bar */}
        <div 
          id="mockup-knowledge-pills"
          className="flex flex-wrap items-center justify-start gap-2 mb-4"
        >
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-950/40 border border-purple-500/30 text-xs text-purple-300 backdrop-blur-xl shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="font-semibold text-[11px]">Base certifiée</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-950/40 border border-white/10 text-xs text-neutral-300 backdrop-blur-xl">
            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-[11px]">Toutes régions</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-950/40 border border-white/10 text-xs text-neutral-300 backdrop-blur-xl">
            <Globe className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
            <span className="text-[11px]">Multilingue</span>
          </div>
        </div>

        {/* Business Type Quick Switcher Bar */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-neutral-950/40 border border-white/10 backdrop-blur-xl mb-3 w-full">
          <button
            onClick={() => handleSelectBusiness('services')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'services'
                ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-900/50'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Services & Agences</span>
          </button>

          <button
            onClick={() => handleSelectBusiness('ecommerce')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'ecommerce'
                ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-900/50'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Boutique & E-com</span>
          </button>

          <button
            onClick={() => handleSelectBusiness('formation')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'formation'
                ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-900/50'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Formation & Pro</span>
          </button>
        </div>

        {/* Main Petite Mockup Card with Invisible Frosted Glass Effect */}
        <div 
          id="interactive-chat-card"
          className="relative w-full rounded-2xl sm:rounded-3xl bg-neutral-950/40 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-purple-950/40 overflow-hidden transition-all duration-300 flex flex-col"
        >
          {/* Glass Header */}
          <div className="px-4 py-3 bg-neutral-950/60 border-b border-white/10 flex items-center justify-between gap-2.5 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {/* Store / Business Avatar */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-900/60 to-indigo-900/60 border border-purple-500/30 flex items-center justify-center text-purple-200 font-bold font-display text-sm shadow-inner">
                  {currentConfig.avatar}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-purple-400 rounded-full border-2 border-neutral-950"></span>
              </div>

              {/* Business Details */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <h3 className="text-sm font-semibold text-neutral-100 font-display truncate">{currentConfig.title}</h3>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {currentConfig.badge}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 truncate">
                  <span className="text-purple-300 flex items-center gap-1 font-medium truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0"></span>
                    En direct sur le site
                  </span>
                </div>
              </div>
            </div>

            {/* Channel Selector & Reset */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center bg-neutral-950/50 rounded-xl p-0.5 border border-white/10 text-[11px] backdrop-blur-md">
                <button
                  onClick={() => setActiveChannel('web')}
                  className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                    activeChannel === 'web' ? 'bg-purple-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Globe className="w-3 h-3 shrink-0" />
                  <span>Web</span>
                </button>
                <button
                  onClick={() => setActiveChannel('whatsapp')}
                  className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                    activeChannel === 'whatsapp' ? 'bg-purple-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MessageCircle className="w-3 h-3 shrink-0" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <button
                onClick={handleReset}
                title="Réinitialiser la conversation"
                className="p-1.5 rounded-xl bg-neutral-900/40 hover:bg-neutral-800/60 text-neutral-400 hover:text-white border border-white/10 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Conversation Body */}
          <div 
            ref={chatScrollRef}
            className="p-4 sm:p-5 space-y-3.5 h-[320px] max-h-[320px] min-h-[320px] overflow-y-auto overflow-x-hidden w-full overscroll-contain"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.map((msg) => {
              const isAssistant = msg.sender === 'assistant';
              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} animate-in fade-in duration-200`}
                >
                  <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[80%]`}>
                    {isAssistant && (
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold border border-purple-500/30 shrink-0">
                        ✦
                      </div>
                    )}

                    <div 
                      className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-md backdrop-blur-md break-words [overflow-wrap:anywhere] ${
                        isAssistant
                          ? 'bg-neutral-900/70 text-neutral-100 border border-white/10 rounded-bl-sm'
                          : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-sm font-medium shadow-purple-600/20'
                      }`}
                    >
                      {isAssistant && (
                        <div className="flex items-center gap-1 text-[10px] text-purple-300 font-medium mb-1">
                          <span>✦</span>
                          <span>Réponse vérifiée entreprise</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      
                      <div className={`text-[9px] mt-1 flex items-center justify-end gap-1 ${
                        isAssistant ? 'text-neutral-400' : 'text-purple-200/80'
                      }`}>
                        <span>{msg.timestamp || '11:15'}</span>
                        {!isAssistant && <CheckCheck className="w-3 h-3 text-purple-200 shrink-0" />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-start gap-2 max-w-[85%] animate-pulse">
                <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold shrink-0">
                  ✦
                </div>
                <div className="rounded-2xl bg-neutral-900/70 border border-white/10 px-3.5 py-2 text-xs text-neutral-300 flex items-center gap-1.5 backdrop-blur-md">
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  <span className="ml-1 text-[10px] truncate">Vérification des données {currentConfig.title}…</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2.5 bg-neutral-950/50 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar backdrop-blur-md shrink-0 w-full">
            <span className="text-[10px] text-neutral-400 whitespace-nowrap font-medium shrink-0">Exemples :</span>
            {currentConfig.quickQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q.text)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-900/60 hover:bg-purple-900/40 text-neutral-200 hover:text-purple-200 border border-white/10 whitespace-nowrap transition-colors shrink-0 cursor-pointer"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input Message Area */}
          <div className="p-3 bg-neutral-950/60 border-t border-white/10 flex items-center gap-2 backdrop-blur-md shrink-0 w-full">
            <input
              id="chat-mockup-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Posez une question sur ${currentConfig.title} (tarifs, services, délais, zones)…`}
              className="flex-1 min-w-0 bg-neutral-900/50 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-md"
            />
            <button
              id="chat-mockup-send"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="shrink-0 p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 transition-all flex items-center justify-center font-semibold cursor-pointer shadow-md shadow-purple-600/30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
