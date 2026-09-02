import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  MessageSquare,
  Zap,
  Headphones,
  Brain,
  Shield,
  Send,
  X,
  Phone,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { WidgetCustomization } from '../lib/firebase';
import { renderMessageContent } from '../utils/renderMessageContent';

export interface JawebChatWidgetProps {
  businessName?: string;
  config?: Partial<WidgetCustomization>;
  whatsappNumber?: string;
  faqKnowledge?: string;
  initialOpen?: boolean;
}

const DEFAULT_WIDGET_CONFIG: WidgetCustomization = {
  iconType: 'sparkles',
  customLogoUrl: '',
  primaryColor: '#9333ea',
  gradientSecondary: '#6366f1',
  useGradient: true,
  position: 'bottom-right',
  shape: 'circle',
  size: 'standard',
  showTeaser: true,
  teaserText: 'Une question ? Discutons en direct 👋',
  onlineBadge: true,
  headerTitle: '',
  headerSubtitle: 'En ligne · Réponse immédiate',
  welcomeMessage: "Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?",
  themeMode: 'dark',
  showBranding: true
};

export const JawebChatWidget: React.FC<JawebChatWidgetProps> = ({
  businessName = 'Mon Entreprise',
  config: userConfig,
  whatsappNumber = '',
  faqKnowledge = '',
  initialOpen = false
}) => {
  const mergedConfig: WidgetCustomization = {
    ...DEFAULT_WIDGET_CONFIG,
    ...(userConfig || {})
  };

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [showTeaser, setShowTeaser] = useState(mergedConfig.showTeaser !== false);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadPhone, setLeadPhone] = useState('');
  const [showLeadForm, setShowLeadForm] = useState(false);

  const primaryColor = mergedConfig.primaryColor;
  const secondaryColor = mergedConfig.gradientSecondary || '#6366f1';
  const useGradient = mergedConfig.useGradient !== false;
  const isLeft = mergedConfig.position === 'bottom-left';
  const shape = mergedConfig.shape;
  const themeMode = mergedConfig.themeMode;
  const headerTitle = mergedConfig.headerTitle || businessName;
  const headerSubtitle = mergedConfig.headerSubtitle || 'En ligne · Réponse immédiate';
  const welcomeMsg = mergedConfig.welcomeMessage || `Bonjour ! 👋 Comment puis-je vous aider aujourd'hui concernant ${businessName} ?`;

  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: welcomeMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  useEffect(() => {
    if (mergedConfig.showTeaser === false) {
      setShowTeaser(false);
    }
  }, [mergedConfig.showTeaser]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { sender: 'user', text, time }]);
    setInputVal('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: businessName,
          message: text
        })
      });

      let botReply = '';
      if (response.ok) {
        const data = await response.json();
        botReply = data.text || data.message || data.response || '';
      } else {
        const errData = await response.json().catch(() => ({}));
        botReply = errData.message || `Bonjour ! Merci pour votre message chez ${businessName}. Laissez-nous vos coordonnées ou votre question, un conseiller vous répond très rapidement.`;
      }

      if (!botReply) {
        botReply = `Bonjour ! Merci pour votre message chez ${businessName}. Comment puis-je vous aider aujourd'hui ?`;
      }

      const lower = text.toLowerCase();
      if (lower.includes('tarif') || lower.includes('prix') || lower.includes('contact') || lower.includes('devis')) {
        setShowLeadForm(true);
      }

      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: botReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Chat AI error:', err);
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ Erreur de connexion avec l\'assistant IA.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadPhone.trim()) return;
    setLeadCaptured(true);
    setShowLeadForm(false);
    setMessages(prev => [
      ...prev,
      {
        sender: 'bot',
        text: `✅ Merci ! Nous avons bien enregistré votre contact (${leadPhone}). Un conseiller va vous recontacter très rapidement.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const renderBubbleIcon = () => {
    if (mergedConfig.iconType === 'custom_logo' && mergedConfig.customLogoUrl) {
      return (
        <img
          src={mergedConfig.customLogoUrl}
          alt={businessName}
          className="w-full h-full object-cover rounded-full"
        />
      );
    }
    switch (mergedConfig.iconType) {
      case 'bot': return <Bot className="w-6 h-6" />;
      case 'message': return <MessageSquare className="w-6 h-6" />;
      case 'zap': return <Zap className="w-6 h-6" />;
      case 'headphone': return <Headphones className="w-6 h-6" />;
      case 'brain': return <Brain className="w-6 h-6" />;
      case 'shield': return <Shield className="w-6 h-6" />;
      default: return <Sparkles className="w-6 h-6" />;
    }
  };

  return (
    <div
      className={`fixed bottom-3 sm:bottom-5 z-[999999] flex flex-col items-${isLeft ? 'start' : 'end'} font-sans antialiased pointer-events-none`}
      style={{
        [isLeft ? 'left' : 'right']: '16px',
        maxWidth: 'calc(100vw - 32px)'
      }}
    >
      {/* CHAT WINDOW */}
      {isOpen && (
        <div
          className={`mb-3 w-[calc(100vw-32px)] sm:w-[380px] max-w-[400px] h-[520px] max-h-[calc(100dvh-5.5rem)] sm:max-h-[82vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border transition-all duration-200 animate-in fade-in slide-in-from-bottom-4 pointer-events-auto ${
            themeMode === 'dark'
              ? 'bg-[#0f121d] text-white border-white/15 shadow-black/80'
              : 'bg-white text-neutral-900 border-neutral-200 shadow-xl'
          }`}
        >
          {/* Header */}
          <div
            className="p-3.5 sm:p-4 flex items-center justify-between text-white relative shadow-md shrink-0"
            style={{
              background: useGradient
                ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                : primaryColor
            }}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/20 backdrop-blur-md p-1.5 flex items-center justify-center shadow-inner overflow-hidden shrink-0">
                {renderBubbleIcon()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-xs sm:text-sm leading-tight flex items-center gap-1.5 truncate">
                  <span className="truncate">{headerTitle}</span>
                  {mergedConfig.onlineBadge !== false && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 inline-block"></span>
                  )}
                </h4>
                <p className="text-[11px] text-white/85 font-medium truncate">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Body Messages */}
          <div
            className={`flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3.5 overscroll-contain ${
              themeMode === 'dark' ? 'bg-[#090b11]/80' : 'bg-neutral-50'
            }`}
            style={{ scrollbarWidth: 'thin', scrollbarColor: themeMode === 'dark' ? 'rgba(255,255,255,0.15) transparent' : 'rgba(0,0,0,0.15) transparent' }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 sm:px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm break-words ${
                    m.sender === 'user'
                      ? 'text-white rounded-br-none'
                      : themeMode === 'dark'
                      ? 'bg-[#181d2d] text-neutral-100 border border-white/10 rounded-bl-none'
                      : 'bg-white text-neutral-800 border border-neutral-200 rounded-bl-none'
                  }`}
                  style={
                    m.sender === 'user'
                      ? {
                          background: useGradient
                            ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                            : primaryColor
                        }
                      : {}
                  }
                >
                  {renderMessageContent(m.text, themeMode)}
                </div>
                <span className="text-[9px] text-neutral-400 mt-1 px-1">{m.time}</span>
              </div>
            ))}

            {isTyping && (
              <div
                className={`flex items-center gap-1.5 p-3 rounded-2xl w-16 ${
                  themeMode === 'dark' ? 'bg-[#181d2d] border border-white/10' : 'bg-white border border-neutral-200'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: primaryColor }}
                ></span>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s]"
                  style={{ backgroundColor: primaryColor }}
                ></span>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s]"
                  style={{ backgroundColor: primaryColor }}
                ></span>
              </div>
            )}

            {/* In-chat Lead capture trigger */}
            {showLeadForm && !leadCaptured && (
              <form
                onSubmit={handleLeadSubmit}
                className={`p-3 rounded-2xl border space-y-2.5 animate-in fade-in duration-200 ${
                  themeMode === 'dark' ? 'bg-[#151928] border-purple-500/30' : 'bg-white border-purple-200'
                }`}
              >
                <p className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>Être rappelé ou recevoir une proposition :</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="Ex: 0550 12 34 56"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    className={`flex-1 text-xs sm:text-sm px-3 py-2 rounded-xl border focus:outline-none ${
                      themeMode === 'dark'
                        ? 'bg-[#090b11] text-white border-white/15 focus:border-purple-500'
                        : 'bg-neutral-50 text-neutral-900 border-neutral-300 focus:border-purple-600'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-transform active:scale-95 cursor-pointer shrink-0"
                    style={{
                      background: useGradient
                        ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                        : primaryColor
                    }}
                  >
                    Envoyer
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className={`p-3 border-t flex items-center gap-2 shrink-0 ${
              themeMode === 'dark' ? 'bg-[#0f121d] border-white/10' : 'bg-white border-neutral-200'
            }`}
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Écrivez votre message..."
              className={`flex-1 text-xs sm:text-sm px-3.5 py-2 rounded-xl border focus:outline-none transition-all ${
                themeMode === 'dark'
                  ? 'bg-[#151928] text-white border-white/10 placeholder-neutral-500 focus:border-purple-500'
                  : 'bg-neutral-100 text-neutral-900 border-neutral-200 placeholder-neutral-400 focus:border-purple-600'
              }`}
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isTyping}
              className="p-2 sm:p-2.5 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shrink-0"
              style={{
                background: useGradient
                  ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                  : primaryColor
              }}
              title="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Branding if active */}
          {mergedConfig.showBranding !== false && (
            <div
              className={`py-1.5 text-center text-[10px] font-medium border-t ${
                themeMode === 'dark'
                  ? 'bg-[#090b11] text-neutral-400 border-white/5'
                  : 'bg-neutral-100 text-neutral-400 border-neutral-200'
              }`}
            >
              ⚡ Propulsé par <span className="font-semibold text-purple-400">JawebFlow IA</span>
            </div>
          )}
        </div>
      )}

      {/* FLOATING TRIGGER BUTTON & TEASER */}
      <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
        {/* Teaser tooltip if closed */}
        {!isOpen && showTeaser && mergedConfig.teaserText && (
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl shadow-xl border text-xs font-medium cursor-pointer transition-all hover:scale-105 max-w-[calc(100vw-5rem)] sm:max-w-xs ${
              themeMode === 'dark'
                ? 'bg-[#151928] text-white border-white/15'
                : 'bg-white text-neutral-800 border-neutral-200'
            }`}
            onClick={() => setIsOpen(true)}
          >
            <span className="truncate">{mergedConfig.teaserText}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTeaser(false);
              }}
              className="text-neutral-400 hover:text-white p-0.5 rounded ml-auto shrink-0"
              title="Fermer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Floating Bubble Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative flex items-center justify-center text-white shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
            shape === 'circle'
              ? 'rounded-full w-12 h-12 sm:w-14 sm:h-14'
              : shape === 'squircle'
              ? 'rounded-2xl w-12 h-12 sm:w-14 sm:h-14'
              : 'rounded-full px-4 sm:px-5 py-3 sm:py-3.5 gap-2'
          }`}
          style={{
            background: useGradient
              ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
              : primaryColor,
            boxShadow: `0 10px 25px -5px ${primaryColor}66`
          }}
          aria-label="Ouvrir le chat assistant IA"
        >
          {isOpen ? (
            <ChevronDown className="w-6 h-6 sm:w-7 sm:h-7" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center">
                {renderBubbleIcon()}
              </div>
              {shape === 'compact' && (
                <span className="font-bold text-xs">Discuter</span>
              )}
            </div>
          )}

          {/* Online green indicator dot */}
          {mergedConfig.onlineBadge !== false && !isOpen && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#090b11] shadow-sm"></span>
          )}
        </button>
      </div>
    </div>
  );
};
