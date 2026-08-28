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
    badge: 'Services B2B',
    avatar: 'NX',
    sectorLabel: 'Services B2B & Conseil Digital',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Salam, chhal waqt pour faire un audit complet de notre site web ?',
        timestamp: '11:15',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! L\'audit complet (SEO, UX & performances) est livré sous 48h avec rapport PDF et devis proforma certifié.',
        timestamp: '11:15',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📊 Tarifs forfaits ?', text: 'Quels sont vos forfaits d\'accompagnement mensuel ?' },
      { label: '📍 Zones d\'intervention', text: 'Intervenez-vous sur site et à distance ?' },
      { label: '⏱️ Délais de lancement', text: 'Quel est le délai pour démarrer un projet ?' },
      { label: '📑 Facturation société', text: 'Fournissez-vous des factures proforma certifiées ?' }
    ]
  },
  ecommerce: {
    id: 'ecommerce',
    title: 'Maison Lila',
    badge: 'E-commerce',
    avatar: 'ML',
    sectorLabel: 'Boutique Soins & Cosmétiques',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Salam, chhal waqt la livraison et quel est le prix du pack soin bio ?',
        timestamp: '14:20',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! Le Pack Soin Bio est à 3 800 DA. Livraison rapide 24h/48h avec paiement sécurisé à la livraison.',
        timestamp: '14:20',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📦 Délais d\'envoi', text: 'Chhal waqt pour recevoir ma commande ?' },
      { label: '💵 Mode de paiement', text: 'Quels sont les modes de paiement acceptés ?' },
      { label: '🌿 Composition soin', text: 'Quels sont les ingrédients du pack bio ?' },
      { label: '📍 Suivi de commande', text: 'Comment suivre ma livraison en direct ?' }
    ]
  },
  formation: {
    id: 'formation',
    title: 'Horizon Academy',
    badge: 'Formation Pro',
    avatar: 'HA',
    sectorLabel: 'Institut de Formation Professionnelle',
    initialMessages: [
      {
        id: '1',
        sender: 'user',
        text: 'Bonjour, la formation en Management est disponible en ligne et donne-t-elle un certificat ?',
        timestamp: '09:30',
      },
      {
        id: '2',
        sender: 'assistant',
        text: 'Bonjour ! Oui, disponible 100% en ligne ou en présentiel, avec certificat d\'État officiel remis à la validation.',
        timestamp: '09:30',
        isAiVerified: true,
      },
    ],
    quickQuestions: [
      { label: '📅 Prochaine session', text: 'Quand commence la prochaine session de formation ?' },
      { label: '💳 Tarifs & Facilité', text: 'Y a-t-il une facilité de paiement en plusieurs fois ?' },
      { label: '📍 Format des cours', text: 'Proposez-vous des cours du soir ou en weekend ?' },
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
      className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full flex flex-col items-start"
    >
      {/* Container aligned with floating bubble aura */}
      <div className="relative w-full max-w-2xl">
        
        {/* Floating Bubble Origin Anchor */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="relative flex items-center justify-center">
            {/* Luminous Pulsing Bubble Rings */}
            <span className="absolute w-7 h-7 rounded-full bg-purple-500/30 animate-ping opacity-75 pointer-events-none"></span>
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600/60 via-fuchsia-500/40 to-indigo-500/60 border border-purple-400/50 backdrop-blur-xl flex items-center justify-center text-purple-200 text-xs shadow-[0_0_20px_rgba(168,85,247,0.4)]">
              <Sparkles className="w-4 h-4 text-purple-200 animate-spin-slow" />
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] sm:bg-neutral-950/25 border border-purple-500/30 text-xs text-purple-300 backdrop-blur-xl shadow-sm">
            <span className="font-semibold text-[11px] tracking-wide">Bulle de Démo IA Interactive</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] sm:bg-neutral-950/20 border border-white/10 text-xs text-neutral-300 backdrop-blur-xl">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[11px]">Réponses certifiées</span>
          </div>
        </div>

        {/* Business Type Quick Switcher Bar (Ultra transparent glass) */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.02] sm:bg-neutral-950/20 border border-white/10 backdrop-blur-xl mb-3 w-full shadow-inner">
          <button
            onClick={() => handleSelectBusiness('services')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'services'
                ? 'bg-purple-600/90 text-white font-semibold shadow-md shadow-purple-600/30 border border-purple-400/30'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Services & Agences</span>
          </button>

          <button
            onClick={() => handleSelectBusiness('ecommerce')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'ecommerce'
                ? 'bg-purple-600/90 text-white font-semibold shadow-md shadow-purple-600/30 border border-purple-400/30'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Boutique & E-com</span>
          </button>

          <button
            onClick={() => handleSelectBusiness('formation')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all truncate cursor-pointer ${
              selectedBusiness === 'formation'
                ? 'bg-purple-600/90 text-white font-semibold shadow-md shadow-purple-600/30 border border-purple-400/30'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Formation & Pro</span>
          </button>
        </div>

        {/* Main Floating Speech Bubble Card with Invisible Frosted Glass Effect */}
        <div 
          id="interactive-chat-card"
          className="relative w-full rounded-3xl rounded-tl-xl bg-white/[0.02] sm:bg-neutral-950/20 border border-white/15 hover:border-purple-500/40 backdrop-blur-2xl shadow-[0_12px_45px_-10px_rgba(147,51,234,0.22)] overflow-hidden transition-all duration-300 flex flex-col"
        >
          {/* Subtle Bubble Pointer Notch (Top Left) */}
          <div className="absolute -top-1.5 left-4 w-3.5 h-3.5 bg-neutral-950/40 border-t border-l border-white/15 rotate-45 backdrop-blur-xl pointer-events-none"></div>

          {/* Ambient Specular Light Sheen */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-purple-600/5 via-transparent to-white/[0.04]" />

          {/* Glass Header */}
          <div className="relative z-10 px-4 py-3 bg-white/[0.02] sm:bg-neutral-950/30 border-b border-white/10 flex items-center justify-between gap-2.5 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {/* Business Avatar with Halo */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600/40 via-fuchsia-600/20 to-indigo-600/40 border border-purple-400/40 flex items-center justify-center text-purple-200 font-bold font-display text-sm shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                  {currentConfig.avatar}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-neutral-950"></span>
              </div>

              {/* Business Details */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <h3 className="text-sm font-semibold text-neutral-100 font-display truncate">{currentConfig.title}</h3>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {currentConfig.badge}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 truncate">
                  <span className="text-purple-300/90 flex items-center gap-1 font-medium truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0"></span>
                    En direct • Base synchronisée
                  </span>
                </div>
              </div>
            </div>

            {/* Channel Selector & Reset */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center bg-white/[0.04] sm:bg-neutral-950/40 rounded-xl p-0.5 border border-white/10 text-[11px] backdrop-blur-md">
                <button
                  onClick={() => setActiveChannel('web')}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    activeChannel === 'web' 
                      ? 'bg-purple-600 text-white font-medium shadow-sm border border-purple-400/30' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Globe className="w-3 h-3 shrink-0" />
                  <span>Web</span>
                </button>
                <button
                  onClick={() => setActiveChannel('whatsapp')}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    activeChannel === 'whatsapp' 
                      ? 'bg-purple-600 text-white font-medium shadow-sm border border-purple-400/30' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MessageCircle className="w-3 h-3 shrink-0" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <button
                onClick={handleReset}
                title="Réinitialiser la conversation"
                className="p-1.5 rounded-xl bg-white/[0.04] sm:bg-neutral-900/40 hover:bg-neutral-800/60 text-neutral-400 hover:text-white border border-white/10 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Conversation Body - Perfectly sized without default scrolling */}
          <div 
            ref={chatScrollRef}
            className="relative z-10 p-3.5 sm:p-4 space-y-3 min-h-[190px] max-h-[250px] overflow-y-auto overflow-x-hidden w-full overscroll-contain no-scrollbar"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.map((msg) => {
              const isAssistant = msg.sender === 'assistant';
              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} animate-in fade-in duration-200`}
                >
                  <div className={`flex items-end gap-2 max-w-[90%] sm:max-w-[85%]`}>
                    {isAssistant && (
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 text-purple-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold border border-purple-500/40 shadow-sm shrink-0">
                        ✦
                      </div>
                    )}

                    <div 
                      className={`relative px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-lg backdrop-blur-xl break-words [overflow-wrap:anywhere] ${
                        isAssistant
                          ? 'bg-neutral-950/30 text-neutral-100 border border-white/15 rounded-2xl rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                          : 'bg-gradient-to-r from-purple-600/90 to-indigo-600/90 text-white rounded-2xl rounded-tr-sm font-medium shadow-[0_4px_20px_rgba(147,51,234,0.35)] border border-purple-400/30'
                      }`}
                    >
                      {isAssistant && (
                        <div className="flex items-center gap-1 text-[10px] text-purple-300 font-medium mb-1">
                          <span className="text-purple-400">✦</span>
                          <span>Réponse certifiée {currentConfig.title}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-xs sm:text-[13px]">{msg.text}</p>
                      
                      <div className={`text-[9px] mt-1 flex items-center justify-end gap-1 ${
                        isAssistant ? 'text-neutral-400' : 'text-purple-200/90'
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
                <div className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold shrink-0">
                  ✦
                </div>
                <div className="rounded-2xl bg-neutral-950/30 border border-white/15 px-3.5 py-2 text-xs text-neutral-300 flex items-center gap-1.5 backdrop-blur-xl shadow-md">
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  <span className="ml-1 text-[10px] truncate">Recherche dans la base certifiée {currentConfig.title}…</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestion Chips (Transparent glass pills) */}
          <div className="relative z-10 px-3.5 py-2 bg-white/[0.02] sm:bg-neutral-950/30 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar backdrop-blur-md shrink-0 w-full">
            <span className="text-[10px] text-neutral-400 whitespace-nowrap font-medium shrink-0">Suggestions :</span>
            {currentConfig.quickQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q.text)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] sm:bg-neutral-900/40 hover:bg-purple-900/40 text-neutral-200 hover:text-purple-200 border border-white/10 hover:border-purple-500/40 whitespace-nowrap transition-all shrink-0 cursor-pointer shadow-sm"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input Message Area (Floating sleek translucent bar) */}
          <div className="relative z-10 p-2.5 sm:p-3 bg-white/[0.02] sm:bg-neutral-950/40 border-t border-white/10 flex items-center gap-2 backdrop-blur-md shrink-0 w-full">
            <input
              id="chat-mockup-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Posez une question à l'assistant de ${currentConfig.title}…`}
              className="flex-1 min-w-0 bg-white/[0.04] sm:bg-neutral-900/30 border border-white/15 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-purple-500/70 focus:ring-1 focus:ring-purple-500/50 transition-all backdrop-blur-xl"
            />
            <button
              id="chat-mockup-send"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="shrink-0 p-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 transition-all flex items-center justify-center font-semibold cursor-pointer shadow-md shadow-purple-600/30 border border-purple-400/30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
