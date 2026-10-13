import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare,
  X,
  Send,
  ArrowRight,
  Minus,
  Sparkles,
  Bot,
  Zap,
  Headphones,
  Brain,
  Shield,
  Mail,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import { renderMessageContent } from '../utils/renderMessageContent';
import ChatCards, { chatCardsFor } from './ChatCards';

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

/**
 * Réponses de secours : elles servent UNIQUEMENT si l'API du chatbot est
 * injoignable (ou coupée). Elles sont recopiées de la base de connaissance du
 * site — un visiteur ne doit jamais tomber sur « une erreur est survenue ».
 */
const DEFAULT_ANSWERS: Record<string, string> = {
  tarifs: `Voici nos formules, en dinars comme en dollars :
• Découverte — 0 DA : configuration complète et installation du widget, pour tester sans risque.
• Basic — 2 700 DA/mois (~10 $) : 500 conversations/mois (1 000 messages ou 50 min d'appels), 1 site, import de vos documents.
• Pro — 5 400 DA/mois (~20 $) : 1 500 conversations/mois (3 000 messages ou 150 min d'appels), plusieurs sites, WhatsApp inclus, clients intéressés (nom, téléphone, ville) détectés automatiquement.
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
• Virement bancaire d'entreprise avec facture conforme (NIF, NIS, RC, RIB)`,
};

/** Questions cliquables par défaut : elles restent affichées si l'API des
 *  réglages est injoignable (le visiteur ne doit jamais voir un chat vide). */
const DEFAULT_QUICK_PROMPTS = ['Combien ça coûte ?', 'Ça s’installe comment ?', 'Ça parle darija ?', 'Comment je paie ?'];

const GENERIC_REPLY =
  "JawebFlow installe en 5 minutes un assistant qui répond à vos clients 24h/24, en français et en darija, et qui vous transmet le contact des clients intéressés. Vous pouvez commencer gratuitement, sans carte bancaire.";

const localAnswer = (question: string) => {
  const lower = question.toLowerCase();
  if (/tarif|prix|forfait|combien|chhal|سعر|الثمن/.test(lower)) return DEFAULT_ANSWERS.tarifs;
  if (/install|code|script|integr|intégr/.test(lower)) return DEFAULT_ANSWERS.installer;
  if (/darija|arabe|langue|alger|دارجة/.test(lower)) return DEFAULT_ANSWERS.darija;
  if (/paiement|baridimob|ccp|payer|دفع/.test(lower)) return DEFAULT_ANSWERS.paiement;
  return '';
};

/** Réglages publics servis par /api/site-chat (réglés dans la console admin). */
interface PublicSiteChat {
  enabled: boolean;
  quickPrompts: string[];
  placeholder: string;
  aiEnabled: boolean;
  contact: { email: string; whatsapp: string; whatsappText: string };
  widget: {
    iconType: string;
    customLogoUrl: string;
    primaryColor: string;
    gradientSecondary: string;
    useGradient: boolean;
    position: 'bottom-right' | 'bottom-left';
    shape: 'circle' | 'squircle' | 'compact';
    size: 'standard' | 'large' | 'compact';
    showTeaser: boolean;
    teaserText: string;
    onlineBadge: boolean;
    headerTitle: string;
    headerSubtitle: string;
    welcomeMessage: string;
    themeMode: 'dark' | 'light';
    showBranding: boolean;
    mode: 'chat' | 'both' | 'voice';
    voice: { enabled: boolean; voice: string; greeting: string; maxMinutes: number };
    attention: { pulse: boolean; teaserDelaySeconds: number; autoOpenSeconds: number; proactiveText: string; callCtaText: string };
    customCss: string;
  };
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  bot: Bot,
  message: MessageSquare,
  zap: Zap,
  headphone: Headphones,
  brain: Brain,
  shield: Shield,
};

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const FloatingLiveWidget: React.FC<FloatingLiveWidgetProps> = ({
  onOpenCreateAssistant,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [config, setConfig] = useState<PublicSiteChat | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Salam ! 👋 Je suis l’assistant JawebFlow. Posez-moi vos questions : installation, tarifs, darija, paiement — je vous réponds tout de suite.",
      timestamp: now(),
    },
  ]);

  // 🎙️ L'appel en cours : état, durée, transcription, micro coupé.
  const [call, setCall] = useState<{ active: boolean; state: string; error: string; seconds: number; lines: Array<{ speaker: string; text: string }>; muted: boolean; speaker: boolean }>({
    active: false, state: '', error: '', seconds: 0, lines: [], muted: false,
  });
  const callRef = useRef<any>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const openedOnce = useRef(false);

  // ── Les réglages viennent de la console admin : un seul endroit à changer. ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/site-chat', { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        // On n'accepte qu'une vraie réponse de réglages : une réponse vide ou
        // inattendue ne doit jamais casser la bulle (ni la faire disparaître).
        if (!alive || !data || data.ok === false || !data.widget) return;
        setConfig(data as PublicSiteChat);
      } catch {
        /* Réglages injoignables : on garde les valeurs par défaut, jamais d'erreur. */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const widget = config?.widget;
  const theme = widget?.themeMode === 'light' ? 'light' : 'dark';
  const branded = widget?.showBranding !== false;
  const primary = widget?.primaryColor || '#9333ea';
  const secondary = widget?.gradientSecondary || '#6366f1';
  const showTeaserBubble = widget?.showTeaser !== false;
  const position = widget?.position === 'bottom-left' ? 'left' : 'right';
  const shape = widget?.shape || 'circle';
  const size = widget?.size || 'standard';
  const BubbleIcon = (widget?.customLogoUrl ? null : ICONS[widget?.iconType || 'sparkles']) || MessageSquare;
  const quickPrompts = config?.quickPrompts?.length ? config.quickPrompts : DEFAULT_QUICK_PROMPTS;

  // Message d'accueil réglé dans la console (une seule fois, au chargement).
  useEffect(() => {
    if (!widget?.welcomeMessage) return;
    setMessages((prev) => (prev.length === 1 && prev[0].id === 'welcome' ? [{ ...prev[0], text: widget.welcomeMessage }] : prev));
  }, [widget?.welcomeMessage]);

  // Accroche retardée (délai réglable) puis ouverture automatique éventuelle.
  useEffect(() => {
    if (!showTeaserBubble) return;
    const delay = Number(widget?.attention?.teaserDelaySeconds ?? 3) * 1000;
    const timer = setTimeout(() => setShowTeaser(true), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [showTeaserBubble, widget?.attention?.teaserDelaySeconds]);

  useEffect(() => {
    const seconds = Number(widget?.attention?.autoOpenSeconds ?? 0);
    if (!seconds) return;
    const timer = setTimeout(() => setIsOpen(true), seconds * 1000);
    return () => clearTimeout(timer);
  }, [widget?.attention?.autoOpenSeconds]);

  // Message proactif : le bot parle le premier (réglage « accroche »).
  useEffect(() => {
    const text = widget?.attention?.proactiveText?.trim();
    if (!text || openedOnce.current) return;
    openedOnce.current = true;
    setMessages((prev) => [...prev, { id: `proactive-${Date.now()}`, sender: 'assistant', text, timestamp: now() }]);
  }, [widget?.attention?.proactiveText]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // CSS libre : le propriétaire du site écrit ce qu'il veut (le champ est borné
  // à 4 000 caractères côté serveur).
  const customCss = widget?.customCss?.trim() || '';
  const customCssTag = useMemo(() => (customCss ? <style>{customCss}</style> : null), [customCss]);

  // ── L'APPEL (Gemini Live, via /api/site-voice puis /cdn/voice.js) ──────────
  const voiceOn = widget?.voice?.enabled !== false;
  const mode = widget?.mode || 'both';
  const canCall = voiceOn && mode !== 'chat';
  const voiceOnly = mode === 'voice';

  const reportCall = (info: any, sessionId: string) => {
    try {
      fetch('/api/voice/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: 'jawebflow_site',
          sessionId: sessionId || 'site_voice',
          seconds: info?.seconds || 0,
          tokensIn: info?.tokensIn || 0,
          tokensOut: info?.tokensOut || 0,
          transcript: info?.transcript || '',
        }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* un relevé raté ne casse rien */
    }
  };

  // Une SEULE seconde chance : si Google ferme la session avant même qu'elle
  // démarre (setup refusé, jeton coincé), on redemande un jeton en demandant le
  // couple historique — inutile de retenter exactement ce qui vient d'échouer.
  const attemptRef = useRef({ fallback: false, setupDone: false, firstError: '' });

  // Le moteur d'appel est chargé d'AVANCE : au moment du clic il est déjà là, et
  // on peut réveiller la sortie audio DANS le geste de l'utilisateur. Sans ça,
  // les navigateurs (surtout iOS) gardent la sortie « suspendue » : le modèle
  // parle, le visiteur n'entend rien — c'était le « j'écoute rien ».
  const engineRef = useRef<any>(null);
  const engineUrl = '/cdn/voice.js?v=13';

  useEffect(() => {
    let alive = true;
    import(/* @vite-ignore */ engineUrl)
      .then((mod: any) => {
        if (alive) engineRef.current = mod;
      })
      .catch(() => {
        /* le moteur se rechargera au moment de l'appel */
      });
    return () => {
      alive = false;
    };
  }, [engineUrl]);

  /** Réveille la sortie audio (à appeler dans le clic, avant tout `fetch`). */
  const unlockAudio = () => {
    try {
      engineRef.current?.unlockVoiceAudio?.();
    } catch {
      /* le bouton « Son » reste là pour ça */
    }
  };

  // ⏱️ Le jeton part au serveur TOUT DE SUITE, en parallèle du moteur d'appel,
  // de la sonnerie et du micro : c'est ce qui supprime le silence de plusieurs
  // secondes entre « ça sonne » et la première phrase de l'assistant.
  const openSession = (fallback: boolean) => {
    const sessionId = `site_${Date.now().toString(36)}`;
    const sessionPromise = fetch('/api/site-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, fallback }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.ok || !data.wsUrl) {
          return {
            ok: false as const,
            blocked: Boolean(data?.blocked),
            error: data?.error || data?.message || "L'appel n'est pas disponible pour le moment.",
          };
        }
        return { ok: true as const, data };
      })
      .catch(() => ({
        ok: false as const,
        blocked: false,
        error: "L'appel n'est pas disponible pour le moment.",
      }));

    // On réutilise le moteur chargé d'avance (déjà « débloqué » côté son) ; au
    // pire on l'importe maintenant. Le `?v=` évite qu'un navigateur serve
    // l'ancien moteur pendant des heures après une correction (incrémenter à
    // chaque changement de `public/cdn/voice.js`).
    return Promise.resolve(engineRef.current || import(/* @vite-ignore */ engineUrl))
      .then((mod: any) => {
        const session = mod.createVoiceCall({
        // ⚠️ Pas de `wsUrl` ici : le jeton n'est pas encore arrivé. La session
        // démarre sans lui (sonnerie + micro tout de suite) et reçoit
        // `connect({ wsUrl… })` dès que le serveur répond.
        onState: (state: string) => {
          // « listening » = Google a accepté la session (setupComplete reçu).
          if (state === 'listening' || state === 'speaking') attemptRef.current.setupDone = true;
          setCall((c) => ({ ...c, state }));
        },
        onTranscript: (t: any) =>
          setCall((c) => {
            const lines = [...c.lines];
            const last = lines[lines.length - 1];
            if (last && last.speaker === t?.speaker) lines[lines.length - 1] = { speaker: t.speaker, text: t.text };
            else lines.push({ speaker: t?.speaker || 'model', text: String(t?.text || '') });
            return { ...c, lines };
          }),
        onNotice: (n: any) => {
          // Le navigateur a coupé la sortie audio : on le DIT au visiteur.
          if (n?.message) setCall((c) => ({ ...c, error: String(n.message) }));
        },
        // Deux outils pour l'agent :
        //   • `chercher_information` → la base du site n'est PAS dans le prompt,
        //     le serveur renvoie uniquement les lignes utiles à la question ;
        //   • l'enregistrement de la demande (nom, téléphone, besoin) → la fiche
        //     part dans la console admin (id = site_leads).
        // Sans réponse, Gemini attendrait — et l'appel deviendrait muet.
        onToolCall: async (call: any) => {
          const args = call?.args || {};
          try {
            if (call?.name === 'chercher_information') {
              const res = await fetch('/api/voice/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site: true, question: String(args.question || '') }),
              });
              const data = await res.json().catch(() => null);
              return { result: String(data?.text || ''), found: Boolean(data?.found) };
            }
            const res = await fetch('/api/voice/lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ site: true, sessionId, args }),
            });
            return await res.json().catch(() => null);
          } catch {
            return { result: '', found: false };
          }
        },
        onError: (e: any) => {
          const message = e?.message || "L'appel a échoué.";
          attemptRef.current.firstError = attemptRef.current.firstError || message;
          setCall((c) => ({ ...c, state: 'error', error: message }));
        },
        onEnd: (info: any) => {
          callRef.current = null;
          // La session n'a JAMAIS démarré : on retente une fois sur le repli —
          // SAUF si le serveur a refusé (forfait, quota, appel coupé) : là,
          // insister ne sert à rien et le visiteur doit lire la raison.
          if (!attemptRef.current.setupDone && !attemptRef.current.fallback && info?.reason !== 'no-session') {
            attemptRef.current.fallback = true;
            setCall((c) => ({ ...c, active: true, state: 'connecting', error: '', seconds: 0, lines: [] }));
            openSession(true);
            return;
          }
          // Erreur : on garde l'écran d'appel ouvert pour que la raison soit LUE
          // (si les deux essais ont échoué, on montre d'abord la cause première).
          const first = attemptRef.current.firstError;
          setCall((c) => {
            const reason = c.error && first && first !== c.error ? `${first}\n${c.error}` : c.error || first;
            return { ...c, active: Boolean(reason), state: reason ? 'error' : '', error: reason };
          });
          reportCall(info, sessionId);
        },        });
        callRef.current = session;
        // 🔔 La sonnerie démarre MAINTENANT (et le micro est demandé tout de
        // suite) : le visiteur n'attend pas le serveur en silence.
        session.start();
        return sessionPromise.then((result) => {
          if (!result.ok) {
            // Refus du serveur : insister ne sert à rien (la seconde chance est
            // réservée aux sessions mortes avant le premier mot).
            if (result.blocked) attemptRef.current.fallback = true;
            setCall((c) => ({ ...c, state: 'error', error: result.error }));
            session.stop('no-session');
            return;
          }
          session.connect({
            wsUrl: result.data.wsUrl,
            setup: result.data.setup,
            greeting: result.data.greeting,
            maxSeconds: result.data.maxSeconds,
          });
        });
      })
      .catch((e: any) => {
        setCall((c) => ({
          ...c,
          active: false,
          state: 'error',
          error: e?.message || "L'appel n'a pas pu démarrer.",
        }));
      });
  };

  const startCall = async () => {
    if (call.active) return;
    // DANS le clic : on réveille la sortie audio (sinon l'assistant est muet).
    unlockAudio();
    setShowTeaser(false);
    setHasUnread(false);
    setIsOpen(true);
    attemptRef.current = { fallback: false, setupDone: false, firstError: '' };
    setCall({ active: true, state: 'connecting', error: '', seconds: 0, lines: [], muted: false, speaker: true });
    openSession(false);
  };

  const hangUp = () => {
    try {
      callRef.current?.stop?.('client');
    } catch {
      /* on raccroche quand même */
    }
    callRef.current = null;
    setCall((c) => ({ ...c, active: false, state: '', error: '' }));
  };

  /** 🔊 / 🔇 — le son de l'assistant (le micro n'est pas touché par ce bouton). */
  const toggleSpeaker = () => {
    const on = !call.speaker;
    const applied = callRef.current?.setSpeaker?.(on);
    if (on) unlockAudio();
    setCall((c) => ({ ...c, speaker: applied === undefined ? on : !!applied }));
  };

  const toggleMute = () => {
    const muted = callRef.current?.setMuted?.(!call.muted);
    setCall((c) => ({ ...c, muted: muted === undefined ? !c.muted : !!muted }));
  };

  useEffect(() => {
    if (!call.active) return;
    const timer = setInterval(() => {
      setCall((c) => ({ ...c, seconds: callRef.current?.getSeconds?.() ?? c.seconds + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [call.active]);

  const handleToggle = () => {
    if (voiceOnly) {
      // « Le bot qui appelle » : la bulle EST le bouton d'appel.
      if (call.active) hangUp();
      else startCall();
      return;
    }
    setIsOpen((v) => !v);
    setShowTeaser(false);
    setHasUnread(false);
  };

  const callClock = (total: number) => {
    const m = Math.floor(total / 60);
    const r = total % 60;
    return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
  };

  const callStatus =
    // Une erreur (avec sa raison) passe AVANT l'état : c'est l'information utile.
    call.error ? call.error
    : call.state === 'connecting' ? 'Connexion…'
    : call.state === 'listening' ? 'Je vous écoute…'
    : call.state === 'speaking' ? 'Je réponds…'
    : call.state === 'error' ? (call.error || "L'appel a échoué.")
    : 'Appel terminé';

  const handleSendMessage = async (customQuery?: string) => {
    const query = (customQuery || inputText).trim();
    if (!query) return;

    const userMsg: WidgetMessage = { id: Date.now().toString(), sender: 'user', text: query, timestamp: now() };
    setMessages((prev) => [...prev, userMsg]);
    if (!customQuery) setInputText('');
    setIsTyping(true);

    const history = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

    let botReply = '';
    try {
      const response = await fetch('/api/site-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, history }),
      });
      if (response.ok) {
        const data = await response.json();
        botReply = String(data?.text || '').trim();
        if (data?.contact && !config?.contact?.whatsapp) setConfig((prev) => (prev ? { ...prev, contact: data.contact } : prev));
      }
    } catch {
      /* panne réseau : on répond avec les réponses du site */
    }

    if (!botReply) botReply = localAnswer(query) || GENERIC_REPLY;

    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: botReply,
        timestamp: now(),
        actionLabel: 'Créer mon assistant gratuitement',
        actionUrl: 'create-assistant',
      },
    ]);
    setIsTyping(false);
  };

  // Interrupteur général de la console : fermé = aucune bulle sur le site.
  // (Seul un `false` explicite ferme : un réglage illisible laisse la bulle.)
  if (config && config.enabled === false) return null;

  const bubblePadding = size === 'large' ? 'p-4 sm:p-5' : size === 'compact' ? 'p-3 sm:p-3.5' : 'p-3.5 sm:p-4';
  const bubbleRadius = shape === 'circle' ? 'rounded-full' : shape === 'squircle' ? 'rounded-[22px]' : 'rounded-[16px]';
  const bubbleIconSize = size === 'large' ? 'h-7 w-7' : size === 'compact' ? 'h-5 w-5' : 'h-6 w-6';
  const bubbleStyle: React.CSSProperties = widget?.useGradient === false
    ? { backgroundColor: primary }
    : { backgroundImage: `linear-gradient(to bottom, ${primary}, ${secondary})` };

  const light = theme === 'light';
  const skin = {
    panel: light ? 'border-black/10 bg-white/97 text-neutral-900' : 'border-purple-400/25 bg-[#0b0912]/97 text-white',
    header: light ? 'border-b border-black/[0.07] bg-white' : 'border-b border-white/[0.07] bg-white/[0.03] text-white',
    area: light ? 'bg-neutral-50' : 'bg-[#08070e]',
    bot: light ? 'rounded-tl-sm border border-black/[0.06] bg-white font-light text-neutral-800' : 'rounded-tl-sm border border-white/[0.07] bg-white/[0.045] font-light text-neutral-100',
    teaser: light ? 'border-black/10 bg-white/97 text-neutral-700' : 'border-purple-400/35 bg-[#0b0912]/96 text-neutral-200',
    footer: light ? 'bg-neutral-100 text-neutral-500' : 'bg-black/30 text-neutral-500',
    bar: light ? 'bg-neutral-100/90 border-black/[0.07]' : 'bg-neutral-900/90 border-white/10',
    input: light
      ? 'bg-white border border-black/10 text-neutral-900 placeholder:text-neutral-400 focus:border-purple-400'
      : 'bg-neutral-900 border border-white/10 text-white placeholder:text-neutral-500 focus:border-purple-400/60',
    // 🔆 Le mode clair a ses propres contrastes : les puces et les liens du
    // panneau sombre (gris très clair, violet 300) devenaient illisibles sur
    // fond blanc — c'était le défaut visible sur la maquette.
    chip: light
      ? 'border border-black/10 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900'
      : 'border border-white/10 bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white',
    link: light ? 'text-purple-600 hover:text-purple-700' : 'text-purple-300 hover:text-purple-200',
    pill: light
      ? 'border-purple-500/25 bg-purple-50 text-purple-700'
      : 'border-purple-400/30 bg-purple-500/15 text-purple-200',
    iconBtn: light
      ? 'bg-black/[0.06] text-neutral-700 hover:bg-black/[0.12] hover:text-neutral-900'
      : 'bg-white/[0.05] text-neutral-300 hover:bg-white/[0.12] hover:text-white',
    callBtn: light
      ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
      : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300',
  };

  // 📏 La taille du panneau suit le réglage du propriétaire : une bulle de chat
  // n'est pas une application — par défaut elle reste discrète, et le client
  // choisit « compact », « standard » ou « large » (console → Apparence).
  const panelSize =
    widget?.size === 'large'
      ? 'sm:h-[580px] sm:w-[400px]'
      : widget?.size === 'compact'
        ? 'sm:h-[440px] sm:w-[320px]'
        : 'sm:h-[500px] sm:w-[344px]';

  const contactLine = config?.contact?.email ? (
    <a
      href={`mailto:${config.contact.email}`}
      className={`inline-flex items-center gap-1 text-[0.62rem] font-light transition-colors ${skin.link}`}
    >
      <Mail className="h-3 w-3" />
      {config.contact.email}
    </a>
  ) : null;

  return (
    <div
      id="floating-live-widget-container"
      className={`fixed bottom-3 z-[9999] flex max-w-[calc(100vw-1.5rem)] flex-col font-sans antialiased pointer-events-none sm:bottom-5 ${
        position === 'left' ? 'left-3 items-start sm:left-5' : 'right-3 items-end sm:right-5'
      }`}
    >
      {customCssTag}

      {/* Live Chat Window */}
      {isOpen && (
        <div
          id="live-widget-modal"
          className={`animate-in slide-in-from-bottom-5 pointer-events-auto mb-2.5 flex h-[min(72dvh,520px)] max-h-[calc(100dvh-5.5rem)] w-[calc(100vw-1.5rem)] max-w-[400px] flex-col overflow-hidden rounded-[22px] border shadow-[0_36px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl duration-200 sm:max-h-[82vh] ${panelSize} ${skin.panel}`}
        >
          {/* Header */}
          <div className={`flex shrink-0 items-center justify-between gap-2 p-3.5 sm:p-4 ${skin.header}`}>
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="relative shrink-0">
                {widget?.customLogoUrl ? (
                  <img
                    src={widget.customLogoUrl}
                    alt={widget?.headerTitle || 'Assistant JawebFlow'}
                    className="h-9 w-9 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                    style={bubbleStyle}
                  >
                    <BubbleIcon className="h-4 w-4" />
                  </div>
                )}
                {widget?.onlineBadge !== false && (
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400 ${light ? 'border-white' : 'border-[#0b0912]'}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold leading-tight sm:text-sm">
                  <span className="truncate">{widget?.headerTitle || 'Assistant JawebFlow'}</span>
                  {/* La pastille est décorative : sur un panneau étroit (320-344 px)
                      elle mangeait la place du titre — on la garde en grand écran. */}
                  <span className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.1em] md:inline-flex ${skin.pill}`}>
                    Officiel
                  </span>
                </h4>
                <p className={`truncate text-[0.68rem] font-light ${light ? 'text-emerald-600' : 'text-emerald-500'}`}>
                  {widget?.headerSubtitle || 'En ligne • réponse immédiate'}
                </p>
              </div>
            </div>

            <div className="ml-2 flex shrink-0 items-center gap-1">
              {canCall && !call.active && (
                <button
                  type="button"
                  onClick={startCall}
                  data-testid="site-call-start"
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${skin.callBtn}`}
                  title="Appeler maintenant"
                >
                  <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${skin.iconBtn}`}
                title="Réduire"
              >
                <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${skin.iconBtn}`}
                title="Fermer"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>

          {/* 🎙️ Écran d'appel : l'avatar, le chrono, ce qui se dit, et raccrocher */}
          {(call.active || call.state === 'error') && (
            <div
              data-testid="site-call-panel"
              className={`flex flex-1 flex-col items-center gap-2.5 overflow-y-auto p-4 text-center ${skin.area}`}
            >
              <div className="relative mt-1 flex h-20 w-20 items-center justify-center rounded-full text-white" style={bubbleStyle}>
                {widget?.customLogoUrl ? (
                  <img src={widget.customLogoUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <Phone className="h-8 w-8" />
                )}
                {(call.state === 'listening' || call.state === 'speaking') && (
                  <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={bubbleStyle} />
                )}
              </div>
              <p className="text-sm font-semibold">{widget?.headerTitle || 'Assistant JawebFlow'}</p>
              <p className={`whitespace-pre-line text-xs ${call.state === 'error' ? 'text-red-400' : 'opacity-70'}`}>{callStatus}</p>
              <p data-testid="site-call-timer" className="text-2xl font-bold tabular-nums">{callClock(call.seconds)}</p>

              {call.lines.length > 0 && (
                <div className="w-full space-y-1.5 text-left">
                  {call.lines.slice(-4).map((line, i) => (
                    <p
                      key={i}
                      className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                        line.speaker === 'user'
                          ? light ? 'bg-black/[0.05] text-neutral-700' : 'bg-white/[0.06] text-neutral-200'
                          : light ? 'bg-purple-50 text-neutral-800' : 'bg-purple-500/10 text-neutral-100'
                      }`}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              )}

              {call.state === 'connecting' && (
                <span className="flex items-center gap-2 text-[11px] opacity-70">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Autorisation du micro…
                </span>
              )}

              <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-3">
                {call.active && (
                  <button
                    type="button"
                    onClick={toggleSpeaker}
                    data-testid="site-call-speaker"
                    aria-pressed={call.speaker}
                    className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium ${light ? 'bg-black/[0.06] text-neutral-700' : 'bg-white/[0.08] text-neutral-200'}`}
                  >
                    {call.speaker ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    {call.speaker ? 'Son actif' : 'Son coupé'}
                  </button>
                )}
                {call.active && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    data-testid="site-call-mute"
                    className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium ${light ? 'bg-black/[0.06] text-neutral-700' : 'bg-white/[0.08] text-neutral-200'}`}
                  >
                    {call.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    {call.muted ? 'Réactiver le micro' : 'Couper le micro'}
                  </button>
                )}
                {call.active ? (
                  <button
                    type="button"
                    onClick={hangUp}
                    data-testid="site-call-hangup"
                    className="flex cursor-pointer items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-red-500"
                  >
                    <PhoneOff className="h-3.5 w-3.5" /> Raccrocher
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCall}
                    className="btn btn-sm btn-primary"
                  >
                    <Phone className="h-3.5 w-3.5" /> Rappeler
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Messages Container */}
          <div
            ref={chatScrollRef}
            className={`flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5 sm:p-4 ${skin.area} ${call.active || call.state === 'error' ? 'hidden' : ''}`}
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
          >
            {messages.map((m) => {
              const isAssistant = m.sender === 'assistant';
              // 🃏 Une réponse en liste (titre + puces) devient une carte propre ;
              // tout le reste garde la bulle habituelle.
              const cards = isAssistant ? chatCardsFor(m.text) : null;
              if (cards) {
                return (
                  <div key={m.id} className="flex flex-col items-start">
                    <ChatCards blocks={cards} light={light} accent={primary} />
                    {m.actionLabel && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onOpenCreateAssistant();
                        }}
                        className="btn btn-sm btn-primary mt-2"
                      >
                        <span>{m.actionLabel}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <span className="mt-1 px-1 text-[9px] text-neutral-400">{m.timestamp}</span>
                  </div>
                );
              }
              return (
                <div key={m.id} className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}>
                  <div
                    className={`max-w-[88%] break-words rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm sm:px-4 sm:text-[13px] ${
                      isAssistant ? skin.bot : 'rounded-tr-sm text-white'
                    }`}
                    style={isAssistant ? undefined : { backgroundColor: primary }}
                  >
                    {renderMessageContent(m.text, light ? 'light' : 'dark')}

                    {isAssistant && m.actionLabel && (
                      <div className={`mt-3 border-t pt-2.5 ${light ? 'border-black/10' : 'border-white/10'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenCreateAssistant();
                          }}
                          className="btn btn-sm btn-primary btn-block"
                        >
                          <span>{m.actionLabel}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="mt-1 px-1 text-[9px] text-neutral-400">{m.timestamp}</span>
                </div>
              );
            })}

            {isTyping && (
              <div className={`flex w-16 items-center gap-1.5 rounded-2xl border p-3 ${light ? 'border-black/10 bg-white' : 'border-white/10 bg-neutral-900'}`}>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:0.4s]"></span>
              </div>
            )}
          </div>

          {/* Quick Prompts Bar */}
          <div className={`flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-t px-3 py-2 ${skin.bar} ${call.active || call.state === 'error' ? 'hidden' : ''}`} style={{ scrollbarWidth: 'none' }}>
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(qp)}
                className={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[0.72rem] font-normal transition-colors ${skin.chip}`}
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div className={`flex shrink-0 items-center gap-2 border-t p-3 ${skin.bar} ${call.active || call.state === 'error' ? 'hidden' : ''}`}>
            <input
              id="live-widget-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={config?.placeholder || 'Posez votre question…'}
              className={`min-w-0 flex-1 rounded-[10px] px-3.5 py-2 text-[0.82rem] transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${skin.input}`}
            />
            <button
              id="live-widget-send-btn"
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 sm:h-9 sm:w-9"
              style={inputText.trim() ? { backgroundColor: primary } : undefined}
              title="Envoyer"
            >
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>

          {/* Bottom attribution label */}
          {(branded || contactLine) && (
            <div className={`flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[0.62rem] font-light ${skin.footer} ${light ? 'border-black/[0.06]' : 'border-white/[0.06]'}`}>
              <span className="truncate">{branded ? '⚡ Propulsé par JawebFlow' : contactLine}</span>
              {branded && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenCreateAssistant();
                  }}
                  className={`shrink-0 cursor-pointer font-normal transition-colors ${skin.link}`}
                >
                  Créer mon chatbot →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Teaser Bubble (when closed) */}
      {!isOpen && !call.active && showTeaser && showTeaserBubble && (
        <div
          className={`animate-in fade-in slide-in-from-right-4 pointer-events-auto mb-2 flex max-w-[calc(100vw-5rem)] items-center gap-2 rounded-2xl border px-3 py-2 text-[0.76rem] font-light shadow-[0_20px_45px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl duration-300 sm:max-w-xs sm:px-3.5 ${skin.teaser}`}
        >
          <button type="button" onClick={handleToggle} className="flex cursor-pointer items-center gap-2 truncate text-left hover:opacity-90">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"></span>
            <span className="truncate">
              {voiceOnly
                ? widget?.attention?.callCtaText || 'Appelez-moi, je réponds tout de suite 📞'
                : widget?.teaserText || 'Une question ? Je réponds tout de suite 👋'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowTeaser(false)}
            className="ml-auto shrink-0 cursor-pointer p-0.5 opacity-70 hover:opacity-100"
            title="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Floating Trigger Bubble */}
      <div className="relative">
        {widget?.attention?.pulse !== false && !isOpen && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full opacity-40" style={{ backgroundColor: primary }} />
        )}
        <button
          id="floating-live-widget-toggle"
          type="button"
          onClick={handleToggle}
          className={`group pointer-events-auto relative flex cursor-pointer items-center justify-center text-white shadow-[0_20px_45px_-22px_rgba(124,58,237,1)] transition-transform duration-200 hover:scale-[1.04] active:scale-95 ${bubbleRadius} ${bubblePadding}`}
          style={bubbleStyle}
          aria-label={voiceOnly ? 'Appeler maintenant' : "Ouvrir l'assistant"}
        >
          {voiceOnly && !call.active ? (
            <Phone className={`${bubbleIconSize} transition-transform duration-200 group-hover:scale-110`} />
          ) : isOpen ? (
            <X className={`${bubbleIconSize} transition-transform duration-200`} />
          ) : widget?.customLogoUrl ? (
            <img src={widget.customLogoUrl} alt="" className={`${bubbleIconSize} rounded-full object-cover`} />
          ) : (
            <BubbleIcon className={`${bubbleIconSize} transition-transform duration-200 group-hover:scale-110`} />
          )}

          {!isOpen && hasUnread && (
            <span className={`absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-emerald-400 text-[0.5rem] font-bold text-neutral-950 ${light ? 'border-white' : 'border-[#08070f]'}`}>
              1
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
