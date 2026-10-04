import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  CheckCheck, 
  ArrowRight,
  Minus
} from 'lucide-react';
import { renderMessageContent } from '../utils/renderMessageContent';

interface FloatingLiveWidgetProps {
  onOpenCreateAssistant: () => void;
  onNavigate?: (page: any) => void;
}

interface WidgetMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionUrl?: string;
  actionLabel?: string;
}

const QUICK_PROMPTS = [
  { label: 'Combien ça coûte ?', query: 'Quels sont les tarifs et forfaits de JawebFlow ?' },
  { label: 'Ça s’installe comment ?', query: 'Comment installer le widget sur mon site web ?' },
  { label: 'Ça parle darija ?', query: 'Est-ce que le chatbot comprend et répond en Darija algérienne ?' },
  { label: 'Comment je paie ?', query: 'Quels sont les modes de paiement acceptés en Algérie ?' }
];

// Les mêmes prix que la page Tarifs : un visiteur qui compare les deux pages ne
// doit jamais tomber sur deux montants différents (l'ancien widget annonçait
// 2 900 DA et 5 900 DA — introuvables ailleurs sur le site).
const DEFAULT_ANSWERS: Record<string, string> = {
  tarifs: `Voici nos formules, en dinars comme en dollars :
• Découverte — 0 DA : configuration complète et installation du widget, pour tester sans risque.
• Basic — 6 850 DA/mois (~29 $) : jusqu'à 1 000 conversations/mois, 1 site, import de vos documents.
• Pro — 18 700 DA/mois (~79 $) : jusqu'à 5 000 conversations/mois, plusieurs sites, clients intéressés (nom, téléphone, ville) détectés automatiquement.
• Enterprise — sur mesure : volume élevé, intégrations dédiées et accompagnement.
Sans engagement : vous changez de formule ou vous arrêtez quand vous voulez, et la facture d'entreprise conforme (NIF, NIS, RC) est disponible.`,
  installer: `L'installation prend moins de 5 minutes, sans développeur.
Une seule ligne de code à coller dans votre site, avant la balise </body> :
<script src="https://jawebflow.dz/cdn/widget.js" data-assistant-id="VOTRE_ID" async></script>
Compatible avec WordPress, Shopify, Wix, Webflow, Next.js ou un site sur mesure. Si vous préférez, notre équipe l'installe pour vous.`,
  darija: `Oui, absolument ! 🇩🇿
JawebFlow a été calibré pour le public algérien : il comprend la darija écrite en lettres latines (Arabizi), en caractères arabes, ainsi que le français et l'anglais. Il s'adapte automatiquement à la langue de votre visiteur.`,
  paiement: `Nous acceptons les moyens de paiement locaux et professionnels :
• BaridiMob (transfert RIP instantané)
• CCP (virement / reçu postal)
• Virement bancaire d'entreprise avec facture conforme (NIF, NIS, RC, RIB)`
};

export const FloatingLiveWidget: React.FC<FloatingLiveWidgetProps> = ({ 
  onOpenCreateAssistant,
  onNavigate 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(true);
  const [hasUnread, setHasUnread] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Salam ! 👋 Je suis l’assistant JawebFlow. Posez-moi vos questions : installation, tarifs, darija, paiement — je vous réponds tout de suite.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    setShowTeaser(false);
    setHasUnread(false);
  };

  const handleSendMessage = async (customQuery?: string) => {
    const query = (customQuery || inputText).trim();
    if (!query) return;

    const userMsg: WidgetMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customQuery) setInputText('');
    setIsTyping(true);

    // Fast keyword analysis for immediate responsive feedback
    const lower = query.toLowerCase();
    let instantMatch = '';
    if (lower.includes('tarif') || lower.includes('prix') || lower.includes('forfait') || lower.includes('combien') || lower.includes('chhal')) {
      instantMatch = DEFAULT_ANSWERS.tarifs;
    } else if (lower.includes('install') || lower.includes('code') || lower.includes('script') || lower.includes('integr')) {
      instantMatch = DEFAULT_ANSWERS.installer;
    } else if (lower.includes('darija') || lower.includes('arabe') || lower.includes('langue') || lower.includes('alger')) {
      instantMatch = DEFAULT_ANSWERS.darija;
    } else if (lower.includes('paiement') || lower.includes('baridimob') || lower.includes('ccp') || lower.includes('payer')) {
      instantMatch = DEFAULT_ANSWERS.paiement;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: 'jawebflow_assistant',
          message: query
        })
      });

      let botReply = '';
      if (response.ok) {
        const data = await response.json();
        botReply = data.text || data.message || data.response || '';
      }

      if (!botReply) {
        botReply = instantMatch || "JawebFlow installe en 5 minutes un assistant qui répond à vos clients 24h/24, en français et en darija, et qui vous transmet le contact des clients intéressés. Vous pouvez commencer gratuitement, sans carte bancaire.";
      }

      const botMsg: WidgetMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionLabel: 'Créer mon assistant gratuitement',
        actionUrl: 'create-assistant'
      };

      setMessages(prev => [...prev, botMsg]);
    } catch {
      const fallbackReply = instantMatch || "Merci pour votre question ! JawebFlow s'installe en 5 minutes sur n'importe quel site web et répond à vos clients 24h/24. Voulez-vous créer votre assistant gratuitement ?";
      const botMsg: WidgetMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div 
      id="floating-live-widget-container"
      className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[9999] flex flex-col items-end font-sans antialiased max-w-[calc(100vw-1.5rem)] pointer-events-none"
    >
      {/* Live Chat Window */}
      {isOpen && (
        <div 
          id="live-widget-modal"
          className="animate-in slide-in-from-bottom-5 pointer-events-auto mb-2.5 flex h-[520px] max-h-[calc(100dvh-5.5rem)] w-[calc(100vw-1.5rem)] max-w-[400px] flex-col overflow-hidden rounded-[22px] border border-purple-400/25 bg-[#0b0912]/97 shadow-[0_36px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl duration-200 sm:h-[540px] sm:max-h-[82vh] sm:w-[380px]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.03] p-3.5 text-white sm:p-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-purple-500 to-purple-700 text-[0.8rem] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                  JF
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0912] bg-emerald-400"></span>
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-xs sm:text-sm leading-tight text-white flex items-center gap-1.5 truncate">
                  <span className="truncate">Assistant JawebFlow</span>
                  <span className="shrink-0 rounded-full border border-purple-400/30 bg-purple-500/15 px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.1em] text-purple-200">Officiel</span>
                </h4>
                <p className="truncate text-[0.68rem] font-light text-emerald-400">
                  En ligne • réponse immédiate
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.05] text-neutral-400 transition-colors hover:bg-white/[0.12] hover:text-white sm:h-8 sm:w-8"
                title="Réduire"
              >
                <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.05] text-neutral-400 transition-colors hover:bg-white/[0.12] hover:text-white sm:h-8 sm:w-8"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div 
            ref={chatScrollRef}
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#08070e] p-3.5 sm:p-4"
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
                    className={`max-w-[88%] rounded-2xl px-3.5 sm:px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm break-words ${
                      isAssistant
                        ? 'rounded-tl-sm border border-white/[0.07] bg-white/[0.045] font-light text-neutral-100'
                        : 'rounded-tr-sm bg-purple-600 text-white'
                    }`}
                  >
                    {renderMessageContent(m.text, 'dark')}
                    
                    {/* Action Button inside bot responses */}
                    {isAssistant && m.actionLabel && (
                      <div className="mt-3 pt-2.5 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenCreateAssistant();
                          }}
                          className="btn btn-sm btn-primary btn-block"
                        >
                          <span>{m.actionLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-neutral-400 mt-1 px-1">{m.timestamp}</span>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-neutral-900 border border-white/10 w-16">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]"></span>
              </div>
            )}
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 bg-neutral-900/90 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto shrink-0 overscroll-x-contain" style={{ scrollbarWidth: 'none' }}>
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(qp.query)}
                className="lux-chip shrink-0"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-neutral-900 border-t border-white/10 flex items-center gap-2 shrink-0">
            <input
              id="live-widget-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Posez votre question…"
              className="lux-input min-w-0 flex-1 rounded-[10px] px-3.5 py-2 text-[0.82rem]"
            />
            <button
              id="live-widget-send-btn"
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-purple-600 text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
              title="Envoyer"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Bottom attribution label */}
          <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/30 px-3 py-1.5 text-[0.62rem] font-light text-neutral-500">
            <span>⚡ Propulsé par JawebFlow</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenCreateAssistant();
              }}
              className="cursor-pointer font-normal text-purple-300 transition-colors hover:text-purple-200"
            >
              Créer mon chatbot →
            </button>
          </div>
        </div>
      )}

      {/* Teaser Bubble (when closed) */}
      {!isOpen && showTeaser && (
        <div className="animate-in fade-in slide-in-from-right-4 pointer-events-auto mb-2 flex max-w-[calc(100vw-5rem)] items-center gap-2 rounded-2xl border border-purple-400/35 bg-[#0b0912]/96 px-3 py-2 text-[0.76rem] font-light text-neutral-200 shadow-[0_20px_45px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl duration-300 sm:max-w-xs sm:px-3.5">
          <button 
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-2 text-left cursor-pointer hover:text-white truncate"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <span className="truncate">Une question ? Je réponds tout de suite 👋</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTeaser(false)}
            className="text-neutral-400 hover:text-neutral-200 p-0.5 cursor-pointer ml-auto shrink-0"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Trigger Bubble */}
      <button
        id="floating-live-widget-toggle"
        type="button"
        onClick={handleToggle}
        className="group pointer-events-auto relative flex cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-purple-500 to-purple-700 p-3.5 text-white shadow-[0_20px_45px_-22px_rgba(124,58,237,1)] transition-transform duration-200 hover:scale-[1.04] active:scale-95 sm:p-4"
        aria-label="Ouvrir l'assistant"
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform duration-200" />
        ) : (
          <MessageSquare className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
        )}

        {/* Unread indicator dot */}
        {!isOpen && hasUnread && (
          <span className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#08070f] bg-emerald-400 text-[0.5rem] font-bold text-neutral-950">
            1
          </span>
        )}
      </button>
    </div>
  );
};
