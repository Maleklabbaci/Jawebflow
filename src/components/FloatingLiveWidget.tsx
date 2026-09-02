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
  { label: '💰 Quels sont les tarifs ?', query: 'Quels sont les tarifs et forfaits de JawebFlow ?' },
  { label: '⚡ Comment installer sur mon site ?', query: 'Comment installer le widget sur mon site web ?' },
  { label: '🇩🇿 Est-ce compatible Darija ?', query: 'Est-ce que le chatbot comprend et répond en Darija algérienne ?' },
  { label: '💳 Quels modes de paiement ?', query: 'Quels sont les modes de paiement acceptés en Algérie ?' }
];

const DEFAULT_ANSWERS: Record<string, string> = {
  tarifs: `Voici nos forfaits transparents en Dinars Algériens (DZD) :
• Découverte (0 DA) : Test complet et configuration du widget.
• Basique (2 900 DA/mois) : 1 000 messages/mois, 1 site web, import de documents.
• Pro (5 900 DA/mois) : 5 000 messages/mois, multi-sites, CRM des prospects et scan de site illimité.
• Entreprise (Sur mesure) : Déploiement personnalisé et intégrations dédiées.`,
  installer: `L'installation prend moins de 2 minutes !
Il vous suffit d'insérer une seule ligne de code HTML/JS avant la balise </body> de votre site :
<script src="https://jawebflow.dz/cdn/widget.js" data-assistant-id="VOTRE_ID" async></script>
Compatible à 100% avec WordPress, Shopify, Wix, Webflow, Next.js ou HTML personnalisé.`,
  darija: `Oui, absolument ! 🇩🇿
JawebFlow a été spécialement calibré pour le public algérien : il comprend parfaitement la Darija en caractères latins (Arabizi), en alphabet arabe et en Français courant. Il s'adapte automatiquement à la langue parlée par votre visiteur.`,
  paiement: `Nous acceptons tous les moyens de paiement locaux et fiables :
• BaridiMob (transfert RIP instantané)
• CCP (virement / reçu postal)
• Virement bancaire entreprise avec facture certifiée (NIF, NIS, RC)`
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
      text: "Salam ! 👋 Bienvenue sur JawebFlow. Je suis votre conseiller virtuel. Posez-moi toutes vos questions sur l'intégration, nos fonctionnalités ou nos forfaits !",
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
        botReply = instantMatch || "JawebFlow vous permet d'intégrer en 2 minutes un assistant intelligent sur votre site web pour convertir vos visiteurs 24h/24 en Français et en Darija. Souhaitez-vous créer votre compte gratuit ?";
      }

      const botMsg: WidgetMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionLabel: 'Créer un assistant gratuitement',
        actionUrl: 'create-assistant'
      };

      setMessages(prev => [...prev, botMsg]);
    } catch {
      const fallbackReply = instantMatch || "Merci pour votre question ! JawebFlow s'installe en 2 minutes sur n'importe quel site web et répond à vos prospects 24h/24.";
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
          className="mb-2.5 w-[calc(100vw-1.5rem)] sm:w-[380px] max-w-[400px] h-[520px] max-h-[calc(100dvh-5.5rem)] sm:max-h-[82vh] rounded-3xl bg-neutral-950/95 border border-purple-500/30 backdrop-blur-2xl shadow-2xl shadow-purple-950/60 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200 pointer-events-auto"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-neutral-900/90 border-b border-white/10 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-sm text-white shadow-md shadow-purple-600/40">
                  JF
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-neutral-950"></span>
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-xs sm:text-sm leading-tight text-white flex items-center gap-1.5 truncate">
                  <span className="truncate">Assistant JawebFlow</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-200 border border-purple-500/30 font-medium">Officiel</span>
                </h4>
                <p className="text-[11px] text-emerald-400 font-medium truncate">
                  En ligne • Réponse immédiate
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Réduire"
              >
                <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div 
            ref={chatScrollRef}
            className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 bg-[#090b11]/90 overscroll-contain"
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
                        ? 'bg-neutral-900 text-neutral-100 border border-white/10 rounded-tl-sm'
                        : 'bg-purple-600 text-white rounded-tr-sm font-medium'
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
                          className="w-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/30 cursor-pointer"
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
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-purple-600/30 text-neutral-300 hover:text-white border border-white/10 hover:border-purple-500/40 whitespace-nowrap transition-all shrink-0 cursor-pointer"
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
              placeholder="Posez une question sur JawebFlow…"
              className="flex-1 min-w-0 bg-neutral-950 border border-white/15 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            <button
              id="live-widget-send-btn"
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-purple-600/30 shrink-0"
              title="Envoyer"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Bottom attribution label */}
          <div className="px-3 py-1.5 bg-neutral-950 border-t border-white/5 flex items-center justify-between text-[10px] text-neutral-400">
            <span>⚡ Propulsé par JawebFlow</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenCreateAssistant();
              }}
              className="text-purple-300 hover:underline cursor-pointer"
            >
              Créer mon chatbot →
            </button>
          </div>
        </div>
      )}

      {/* Teaser Bubble (when closed) */}
      {!isOpen && showTeaser && (
        <div className="mb-2 flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-2xl bg-neutral-950/95 border border-purple-500/40 backdrop-blur-xl shadow-xl shadow-purple-950/40 text-xs text-neutral-200 animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto max-w-[calc(100vw-5rem)] sm:max-w-xs">
          <button 
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-2 text-left cursor-pointer hover:text-white truncate"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <span className="truncate">Une question ? Testez le widget en direct 👋</span>
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
        className="relative group p-3.5 sm:p-4 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-xl shadow-purple-600/40 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center pointer-events-auto"
        aria-label="Ouvrir l'assistant"
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform duration-200" />
        ) : (
          <MessageSquare className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
        )}

        {/* Unread indicator dot */}
        {!isOpen && hasUnread && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-neutral-950 flex items-center justify-center text-[8px] font-bold text-neutral-950 shadow-sm">
            1
          </span>
        )}
      </button>
    </div>
  );
};
