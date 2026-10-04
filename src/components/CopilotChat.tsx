/**
 * « Parler à mon IA » — le chat où le marchand donne des ORDRES à son IA.
 *
 *   « ajoute ce produit à ma base »  → une fiche est écrite dans « Mes informations »
 *   « réponds aux commentaires ainsi » → une réponse automatique Instagram est créée
 *   « réponds court, en darija »       → la façon de parler du robot change
 *
 * Sous chaque réponse, des cartes montrent ce que l'IA a RÉELLEMENT fait (le serveur
 * en fait la liste, l'IA ne peut pas l'inventer) avec « Annuler », « Activer » et « Voir ».
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowUp, BarChart3, Check, Database, ExternalLink, Instagram, Loader2, Mic, Phone, Plus, RotateCcw, Send, SlidersHorizontal, Sparkles, Undo2, Users, X, Zap } from 'lucide-react';
import { ApiError, copilotApi } from '../lib/copilot-api';
import type { CopilotAction, CopilotMessage, CopilotStatePatch } from '../lib/copilot-api';

export type CopilotSection = NonNullable<CopilotAction['goto']>;

type ActionState = 'idle' | 'working' | 'undone' | 'activated' | 'static';

interface ActionView extends Omit<CopilotAction, 'undo'> {
  undo?: CopilotAction['undo'];
  state: ActionState;
  /** Retour de la dernière tentative (succès ou erreur). */
  note?: string;
  failed?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: ActionView[];
  /** Bulle d'erreur (non enregistrée, jamais envoyée à l'IA). */
  error?: boolean;
  /** Message à renvoyer si le marchand clique sur « Réessayer ». */
  retry?: string;
}

const P_MESSAGES = { label: 'Combien de messages cette semaine ?', text: 'Combien de messages mes clients m’ont envoyés cette semaine ?', send: true };
const P_LEADS = { label: 'Combien de leads ?', text: 'Combien de leads j’ai eus cette semaine ? Montre-moi les derniers.', send: true };
const P_ADD = { label: 'Ajouter une info à ma base', text: 'Ajoute à ma base : ', send: false };
const P_COMMENTS = { label: 'Répondre aux commentaires', text: 'Quand quelqu’un commente « prix » sous mes publications, réponds-lui en public et envoie-lui un message privé avec mes tarifs.', send: false };
const P_SHORT = { label: 'Répondre plus court', text: 'Réponds toujours court et clair à mes clients.', send: true };
const P_DARIJA = { label: 'Parler darija', text: 'Réponds à mes clients en darija algérienne.', send: true };
const P_KNOW = { label: 'Que sais-tu de moi ?', text: 'Fais-moi un résumé de ce que tu sais sur mon entreprise.', send: true };
const P_AUTOS = { label: 'Mes automatisations', text: 'Quelles automatisations Instagram j’ai ? Lesquelles sont actives ?', send: true };

/** Suggestions de la fenêtre flottante. */
export const QUICK_PROMPTS: Array<{ label: string; text: string; send: boolean }> = [P_MESSAGES, P_LEADS, P_ADD, P_COMMENTS, P_SHORT, P_DARIJA, P_KNOW, P_AUTOS];

type HomeIcon = 'stats' | 'leads' | 'note' | 'instagram' | 'behavior' | 'ask';
/** Suggestions de la page d'accueil (façon Gemini / Claude). */
export const HOME_PROMPTS: Array<{ label: string; text: string; send: boolean; icon: HomeIcon }> = [
  { ...P_MESSAGES, icon: 'stats' },
  { ...P_LEADS, icon: 'leads' },
  { ...P_ADD, icon: 'note' },
  { ...P_COMMENTS, icon: 'instagram' },
  { ...P_DARIJA, icon: 'behavior' },
  { ...P_KNOW, icon: 'ask' },
];
const HOME_ICONS: Record<HomeIcon, React.ComponentType<{ className?: string }>> = {
  stats: BarChart3, leads: Users, note: Database, instagram: Instagram, behavior: SlidersHorizontal, ask: Sparkles,
};

const GOTO_LABEL: Record<CopilotSection, string> = {
  knowledge: 'Voir mes informations',
  behavior: 'Voir le comportement',
  automations: 'Voir les automatisations',
  instagram: 'Voir Instagram',
};

const ICONS: Record<CopilotAction['icon'], React.ComponentType<{ className?: string }>> = {
  note: Database,
  behavior: SlidersHorizontal,
  info: Phone,
  instagram: Instagram,
  automation: Zap,
};

const MAX_STORED = 50;
const HISTORY_SENT = 14;
const storageKey = (uid: string) => `jawebflow_copilot_v1_${uid}`;

const newId = () => Math.random().toString(36).slice(2, 10);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** L'IA est priée de ne pas utiliser de markdown ; on nettoie ce qui s'échappe quand même. */
export const tidy = (t: string) =>
  String(t || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*•-]\s+/gm, '• ')
    .trim();

const BotAvatar: React.FC<{ error?: boolean }> = ({ error }) => (
  <span aria-hidden="true" className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${error ? 'bg-rose-500' : 'bg-gradient-to-br from-[#a23dff] to-[#5a2cff]'}`}>
    {error ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
  </span>
);

function loadHistory(uid: string): ChatMsg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(uid)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text)
      .slice(-MAX_STORED)
      .map((m) => ({
        id: String(m.id || newId()),
        role: m.role,
        text: m.text,
        // Après un rechargement, les boutons « Annuler / Activer » ne sont plus proposés (l'état a pu changer) : cartes en lecture seule.
        actions: Array.isArray(m.actions)
          ? m.actions.map((a: any) => ({ id: String(a.id), tool: String(a.tool || ''), icon: a.icon in ICONS ? a.icon : 'note', title: String(a.title || ''), detail: String(a.detail || ''), goto: a.goto, state: a.state === 'undone' ? 'undone' : 'static' }))
          : undefined,
      }));
  } catch {
    return [];
  }
}

function saveHistory(uid: string, msgs: ChatMsg[]) {
  try {
    const slim = msgs
      .filter((m) => !m.error)
      .slice(-MAX_STORED)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        ...(m.actions?.length ? { actions: m.actions.map((a) => ({ id: a.id, tool: a.tool, icon: a.icon, title: a.title, detail: a.detail, goto: a.goto, state: a.state === 'undone' ? 'undone' : 'static' })) } : {}),
      }));
    localStorage.setItem(storageKey(uid), JSON.stringify(slim));
  } catch { /* stockage plein ou bloqué : le chat marche quand même */ }
}

/** Ce qui part vers l'IA : les derniers messages, avec un rappel de ce qu'elle a déjà fait. */
export function toHistory(msgs: ChatMsg[]): CopilotMessage[] {
  return msgs
    .filter((m) => !m.error && m.text.trim())
    .slice(-HISTORY_SENT)
    .map((m) => {
      if (m.role !== 'assistant' || !m.actions?.length) return { role: m.role, text: m.text };
      const done = m.actions.map((a) => `${a.title} — ${clip(a.detail, 90)}${a.state === 'undone' ? ' (annulée par le marchand)' : ''}`).join(' ; ');
      return { role: 'assistant' as const, text: `${m.text}\n(Actions effectuées : ${done})` };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bouton flottant
// ─────────────────────────────────────────────────────────────────────────────
export const CopilotLauncher: React.FC<{ onClick: () => void; unread?: boolean }> = ({ onClick, unread }) => (
  <button
    type="button"
    id="copilot-launcher"
    onClick={onClick}
    aria-label="Parler à mon IA"
    className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 rounded-full bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition-colors hover:bg-purple-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-300 cursor-pointer"
  >
    <Sparkles className="h-5 w-5" />
    <span className="hidden sm:inline">Parler à mon IA</span>
    {unread && <span aria-label="Nouvelle réponse" className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500" />}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Carte « ce que j'ai fait »
// ─────────────────────────────────────────────────────────────────────────────
const ActionCard: React.FC<{
  action: ActionView;
  busy: boolean;
  onUndo: () => void;
  onActivate: () => void;
  onView: (section: CopilotSection) => void;
}> = ({ action, busy, onUndo, onActivate, onView }) => {
  const Icon = ICONS[action.icon] || Database;
  const undone = action.state === 'undone';
  const working = action.state === 'working';
  const canUndo = Boolean(action.undo) && (action.state === 'idle' || action.state === 'activated');
  const canActivate = Boolean(action.activate) && action.state === 'idle';
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs ${undone ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-emerald-200 bg-emerald-50/60 text-slate-700'}`} data-testid="copilot-action">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${undone ? 'bg-slate-200 text-slate-400' : 'bg-emerald-100 text-emerald-700'}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${undone ? 'line-through' : 'text-slate-900'}`}>{action.title}</p>
          <p className={`mt-0.5 break-words ${undone ? 'line-through' : 'text-slate-600'}`}>{action.detail}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
        {canActivate && (
          <button type="button" disabled={busy || working} onClick={onActivate} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
            {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Activer maintenant
          </button>
        )}
        {action.state === 'activated' && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 font-semibold text-emerald-700"><Check className="h-3 w-3" /> Activée</span>
        )}
        {canUndo && (
          <button type="button" disabled={busy || working} onClick={onUndo} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
            {working && !canActivate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Annuler
          </button>
        )}
        {undone && <span className="font-medium text-slate-500">Annulé</span>}
        {action.goto && !undone && (
          <button type="button" onClick={() => onView(action.goto!)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 font-medium text-purple-700 hover:bg-purple-50 cursor-pointer">
            <ExternalLink className="h-3 w-3" /> {GOTO_LABEL[action.goto]}
          </button>
        )}
      </div>
      {action.note && action.failed && <p className="mt-1.5 flex items-start gap-1 pl-8 text-rose-600"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {action.note}</p>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Le chat
// ─────────────────────────────────────────────────────────────────────────────
export interface CopilotChatProps {
  /**
   * « drawer » = fenêtre flottante (par défaut) ; « page » = grand écran d'accueil façon Gemini / Claude,
   * dessiné dans `homeHost`. C'est la MÊME discussion dans les deux cas (une seule instance, donc rien ne se perd
   * quand on change d'écran).
   */
  mode?: 'drawer' | 'page';
  homeHost?: HTMLElement | null;
  /** Prénom affiché dans « Bonjour … » (page d'accueil). */
  firstName?: string;
  /** Résumé discret sous les suggestions (page d'accueil). */
  summary?: { online: boolean; leads: number; notes: number };
  /** Étapes restantes : petites pastilles cliquables (page d'accueil). */
  todo?: Array<{ label: string; onClick: () => void }>;
  /** Alerte importante au-dessus du titre (ex. limite atteinte). */
  notice?: { text: string; tone: 'warn' | 'danger'; actionLabel: string; onAction: () => void } | null;
  open: boolean;
  onClose: () => void;
  userId: string;
  assistantId: string;
  /**
   * Prépare l'envoi : enregistre ce qui est en attente dans le tableau de bord (le serveur travaille
   * sur la base) et renvoie l'identifiant de l'assistant — `null` s'il n'est pas encore chargé,
   * `{ error }` si l'enregistrement a échoué (message à montrer tel quel).
   */
  ensureReady: () => Promise<string | { error: string } | null>;
  /** Met à jour les écrans avec ce que l'IA vient de changer. */
  onStatePatch: (patch: CopilotStatePatch) => void;
  onNavigate: (section: CopilotSection) => void;
  /** Vrai pendant qu'une demande est en cours (le tableau de bord suspend sa sauvegarde automatique). */
  onBusyChange?: (busy: boolean) => void;
  /** Une réponse vient d'arriver. */
  onReply?: () => void;
  /**
   * La réponse s'est perdue en route (coupure de réseau, délai dépassé) : l'IA a peut-être travaillé quand même.
   * Le tableau de bord relit alors la base pour que ses écrans montrent la vérité.
   */
  onResync?: () => void;
}

export const CopilotChat: React.FC<CopilotChatProps> = (props) => {
  const { open, onClose, userId } = props;
  const pageMode = props.mode === 'page';
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory(userId));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'fr-FR' | 'ar-DZ'>('fr-FR');

  const messagesRef = useRef<ChatMsg[]>(messages);
  const busyRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const assistantIdRef = useRef(props.assistantId);
  if (props.assistantId) assistantIdRef.current = props.assistantId;
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<any>(null);

  const Recognition = useMemo(() => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null), []);

  const commit = useCallback((next: ChatMsg[]) => {
    messagesRef.current = next;
    setMessages(next);
    saveHistory(userId, next);
  }, [userId]);

  // Défilement automatique vers le dernier message
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  // Zone de texte qui grandit avec le message
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, pageMode ? 220 : 140)}px`;
  }, [draft, pageMode]);

  // À l'ouverture, le curseur est prêt dans la zone de texte
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Page d'accueil : sur ordinateur le curseur est prêt tout de suite ; sur téléphone on évite d'ouvrir le clavier d'office.
  useEffect(() => {
    if (!pageMode || !props.homeHost) return;
    const fine = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    if (fine) inputRef.current?.focus();
  }, [pageMode, props.homeHost]);

  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* ignoré */ } }, []);

  const send = useCallback(async (raw: string, opts: { resend?: boolean } = {}) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    propsRef.current.onBusyChange?.(true);

    let base = messagesRef.current;
    if (opts.resend) {
      base = base.filter((m) => !m.error); // la bulle d'erreur disparaît, le message du marchand reste
    } else {
      base = [...base, { id: newId(), role: 'user', text }];
      setDraft('');
    }
    commit(base);

    try {
      const ready = await propsRef.current.ensureReady();
      if (!ready) throw new ApiError('Ton assistant est encore en train de se charger. Réessaie dans un instant.', 0);
      if (typeof ready === 'object') throw new ApiError(ready.error, 0);
      const id = ready;
      assistantIdRef.current = id;
      const res = await copilotApi.ask(id, toHistory(base));
      const actions: ActionView[] = (res.actions || []).map((a) => ({ ...a, state: 'idle' as const }));
      // Si l'IA vient d'ACTIVER une automatisation (« oui, active »), le bouton « Activer maintenant » d'une carte plus
      // ancienne n'a plus lieu d'être : on la marque comme activée.
      const nowActive = new Set(
        actions.flatMap((a) => (a.tool === 'set_automation_enabled' && a.undo?.type === 'automation_set_enabled' && a.undo.enabled === false ? [a.undo.automationId] : [])),
      );
      const previous = nowActive.size
        ? messagesRef.current.map((m) => ({
            ...m,
            actions: m.actions?.map((a) => (a.activate && nowActive.has(a.activate.automationId) && a.state === 'idle' ? { ...a, state: 'activated' as const } : a)),
          }))
        : messagesRef.current;
      commit([...previous, { id: newId(), role: 'assistant', text: res.reply || 'C’est fait ✅', ...(actions.length ? { actions } : {}) }]);
      if (res.state && Object.keys(res.state).length) propsRef.current.onStatePatch(res.state);
      propsRef.current.onReply?.();
    } catch (e: any) {
      const message = e instanceof ApiError ? e.message : 'Une erreur est survenue. Réessaie dans un instant.';
      commit([...messagesRef.current, { id: newId(), role: 'assistant', text: message, error: true, retry: text }]);
      // Réponse perdue (status 0 = coupure / délai) alors que la demande est peut-être partie : on se re-synchronise.
      if (e instanceof ApiError && e.status === 0 && assistantIdRef.current) propsRef.current.onResync?.();
    } finally {
      busyRef.current = false;
      setBusy(false);
      propsRef.current.onBusyChange?.(false);
    }
  }, [commit]);

  const patchAction = useCallback((msgId: string, actionId: string, patch: Partial<ActionView>) => {
    commit(messagesRef.current.map((m) => (m.id !== msgId ? m : { ...m, actions: m.actions?.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) })));
  }, [commit]);

  const runAction = useCallback(async (msgId: string, action: ActionView, kind: 'undo' | 'activate') => {
    const op = kind === 'undo' ? action.undo : action.activate ? ({ type: 'automation_set_enabled', automationId: action.activate.automationId, enabled: true } as const) : null;
    const id = assistantIdRef.current;
    if (!op || !id || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    propsRef.current.onBusyChange?.(true);
    patchAction(msgId, action.id, { state: 'working', note: undefined, failed: false });
    try {
      const res = await copilotApi.run(id, op);
      if (res.state && Object.keys(res.state).length) propsRef.current.onStatePatch(res.state);
      patchAction(msgId, action.id, { state: kind === 'undo' ? 'undone' : 'activated', note: res.message, failed: false });
    } catch (e: any) {
      patchAction(msgId, action.id, { state: 'idle', note: e instanceof ApiError ? e.message : 'Impossible pour le moment. Réessaie.', failed: true });
      if (e instanceof ApiError && e.status === 0) propsRef.current.onResync?.();
    } finally {
      busyRef.current = false;
      setBusy(false);
      propsRef.current.onBusyChange?.(false);
    }
  }, [patchAction]);

  const reset = () => {
    if (busyRef.current) return;
    commit([]);
    setDraft('');
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (!Recognition) return;
    if (listening) {
      try { recRef.current?.stop(); } catch { /* ignoré */ }
      return;
    }
    const rec = new Recognition();
    rec.lang = voiceLang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = e?.results?.[0]?.[0]?.transcript;
      if (t) setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const pickPrompt = (p: (typeof QUICK_PROMPTS)[number]) => {
    if (p.send) { void send(p.text); return; }
    setDraft(p.text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(p.text.length, p.text.length); }
    });
  };

  const onView = (section: CopilotSection) => {
    props.onNavigate(section);
    if (!pageMode && typeof window !== 'undefined' && window.innerWidth < 1024) onClose(); // sur téléphone, la fenêtre cache l'écran
  };

  const empty = messages.length === 0;

  // ───────────────────────────────────────────────────────────────────────────
  // Page d'accueil façon Gemini / Claude : « Bonjour {prénom} », un grand champ de texte, puis la discussion
  // message par message. La zone de saisie reste au MÊME endroit dans l'arbre : le curseur ne saute pas quand
  // la première réponse arrive.
  // ───────────────────────────────────────────────────────────────────────────
  if (pageMode) {
    if (!props.homeHost) return null;
    const first = (props.firstName || '').trim();
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    const notice = props.notice;
    const page = (
      <section id="copilot-home" role="region" aria-label="Discussion avec mon IA" className="relative flex h-full min-h-0 flex-col">
        {!empty && (
          <button type="button" onClick={reset} disabled={busy} aria-label="Nouvelle discussion" title="Nouvelle discussion" className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-slate-900 disabled:opacity-40 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Nouvelle discussion
          </button>
        )}

        {/* Titre (au début) ou discussion */}
        <div ref={listRef} aria-live="polite" className={empty ? 'flex flex-1 flex-col items-center justify-end px-4 pb-6 pt-8 text-center' : 'flex-1 overflow-y-auto px-4'}>
          {empty ? (
            <div className="w-full max-w-2xl">
              {notice && (
                <div role="alert" className={`mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-2.5 text-sm ${notice.tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  <span>{notice.text}</span>
                  <button type="button" onClick={notice.onAction} className="font-semibold underline underline-offset-2 hover:no-underline cursor-pointer">{notice.actionLabel}</button>
                </div>
              )}
              <h2 className="flex items-center justify-center gap-3 text-[#1f1f1f] sm:gap-4" style={{ fontFamily: "'Fraunces', Georgia, 'Times New Roman', serif" }}>
                <Sparkles aria-hidden="true" className="h-7 w-7 shrink-0 text-[#7c3aed] sm:h-9 sm:w-9" strokeWidth={1.75} />
                <span className="text-[32px] font-normal leading-tight tracking-[-0.02em] sm:text-[44px]">
                  Bonjour{first ? <>, {first}</> : null}
                </span>
              </h2>
              <p className="mt-3 text-[15px] font-normal text-slate-500 sm:text-base">Quoi de neuf ? On ajoute quoi ?</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 pb-4 pt-14">
              {messages.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-purple-600 px-4 py-2.5 text-[15px] leading-relaxed text-white">{m.text}</div>
                  ) : (
                    <>
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.error ? 'bg-rose-100 text-rose-600' : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white'}`}>
                        {m.error ? <AlertTriangle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${m.error ? 'text-rose-700' : 'text-slate-800'}`}>{tidy(m.text)}</p>
                        {m.error && m.retry && (
                          <button type="button" onClick={() => void send(m.retry!, { resend: true })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                            <RotateCcw className="h-3 w-3" /> Réessayer
                          </button>
                        )}
                        {m.actions && m.actions.length > 0 && (
                          <div className="space-y-1.5">
                            {m.actions.map((a) => (
                              <ActionCard key={a.id} action={a} busy={busy} onUndo={() => void runAction(m.id, a, 'undo')} onActivate={() => void runAction(m.id, a, 'activate')} onView={onView} />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {busy && (
                <div role="status" className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white"><Sparkles className="h-4 w-4" /></span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" />
                  </span>
                  Mon IA s’en occupe…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zone de saisie */}
        <form className="px-4 pb-4" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-[28px] border border-transparent bg-white shadow-[0_1px_2px_rgba(27,22,71,0.05),0_14px_36px_-18px_rgba(27,22,71,0.28)] transition focus-within:border-purple-300 focus-within:ring-4 focus-within:ring-purple-200/60">
              <textarea
                id="copilot-input"
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={4000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any)?.isComposing) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                aria-label="Ton message pour mon IA"
                placeholder={empty ? 'Ajoute une info, demande tes chiffres…' : 'Écris ta réponse…'}
                className="dash-bare block max-h-56 min-h-[56px] w-full resize-none rounded-[28px] bg-transparent px-5 pb-2 pt-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  {Recognition && (
                    <>
                      <button
                        type="button"
                        onClick={toggleMic}
                        aria-label={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                        title={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                        className={`rounded-full p-2 cursor-pointer ${listening ? 'animate-pulse bg-rose-100 text-rose-600' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceLang((l) => (l === 'fr-FR' ? 'ar-DZ' : 'fr-FR'))}
                        disabled={listening}
                        aria-label={`Langue de la dictée : ${voiceLang === 'fr-FR' ? 'français' : 'arabe'}`}
                        title="Changer la langue de la dictée"
                        className="rounded-md px-1.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                      >
                        {voiceLang === 'fr-FR' ? 'FR' : 'عربي'}
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  aria-label="Envoyer"
                  title="Envoyer"
                  className="dash-gradient flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-white shadow-[0_10px_22px_-12px_rgba(110,50,255,0.8)] transition hover:brightness-110 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer disabled:cursor-default"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">Tout est enregistré tout de suite · chaque action peut être annulée</p>
          </div>
        </form>

        {/* Suggestions (seulement au début) */}
        {empty && (
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <div className="mx-auto w-full max-w-2xl text-center">
              <div className="flex flex-wrap justify-center gap-2">
                {HOME_PROMPTS.map((p) => {
                  const Icon = HOME_ICONS[p.icon];
                  return (
                    <button key={p.label} type="button" onClick={() => pickPrompt(p)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800 disabled:opacity-50 cursor-pointer">
                      <Icon className="h-4 w-4 text-purple-500" />
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {props.todo && props.todo.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pour démarrer</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {props.todo.map((t) => (
                      <button key={t.label} type="button" onClick={t.onClick} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {props.summary && (
                <p className="mt-6 text-xs text-slate-400">
                  <span className={props.summary.online ? 'text-emerald-600' : 'text-amber-600'}>● {props.summary.online ? 'Assistant en ligne' : 'Assistant en préparation'}</span>
                  {' · '}{plural(props.summary.leads, 'client intéressé', 'clients intéressés')}
                  {' · '}{plural(props.summary.notes, 'information utilisée', 'informations utilisées')}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    );
    return createPortal(page, props.homeHost);
  }

  const bubbleShadow = 'shadow-[0_1px_2px_rgba(27,22,71,0.06)]';

  return (
    <div
      role="dialog"
      aria-label="Discussion avec mon IA"
      hidden={!open}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className={`${open ? 'flex' : 'hidden'} fixed inset-0 z-[60] flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[400px] sm:rounded-[28px] sm:border sm:border-[#e8e4f8] sm:shadow-[0_32px_80px_-24px_rgba(27,22,71,0.5)]`}
    >
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-[#a23dff] to-[#5a2cff] px-4 py-3.5 text-white">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Sparkles className="h-5 w-5" />
          <span aria-hidden="true" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#7a35ff] bg-emerald-400" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-tight">Mon IA</h2>
          <p className="truncate text-[12px] leading-tight text-white/80">En ligne · français, darija, arabe</p>
        </div>
        <button type="button" onClick={reset} disabled={busy || empty} aria-label="Nouvelle discussion" title="Nouvelle discussion" className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 outline-none transition hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-30 cursor-pointer">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 outline-none transition hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-[#f5f4fc] px-4 py-5" aria-live="polite">
        {empty && (
          <div>
            <div className="flex items-end gap-2">
              <BotAvatar />
              <div className={`max-w-[84%] rounded-[20px] rounded-bl-md bg-white px-4 py-3 text-[14px] leading-[1.5] text-slate-700 ${bubbleShadow}`}>
                <p className="font-semibold text-slate-900">Salut 👋 Je suis ton IA.</p>
                <p className="mt-1">Dis-moi quoi faire, je le fais <b>pour de vrai</b> — et tu peux toujours annuler.</p>
                <ul className="mt-2.5 space-y-1 text-[13px] text-slate-600">
                  <li>📚 Ajouter ou corriger les infos de ton entreprise</li>
                  <li>💬 Répondre aux commentaires Instagram à ta façon</li>
                  <li>🎯 Changer ta façon de parler aux clients</li>
                  <li>📊 Connaître tes chiffres : messages, leads…</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-9">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.label} type="button" onClick={() => pickPrompt(p)} disabled={busy} className="rounded-full border border-[#d9ccff] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#5a2cff] outline-none transition hover:bg-[#f1ecff] focus-visible:ring-2 focus-visible:ring-[#a23dff]/40 disabled:opacity-50 cursor-pointer">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const lastOfGroup = next?.role !== m.role;
          const gap = i === 0 ? '' : prev?.role !== m.role ? 'mt-4' : 'mt-1';
          const tail = lastOfGroup ? (isUser ? 'rounded-br-md' : 'rounded-bl-md') : '';
          return (
            <div key={m.id} className={gap}>
              <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (lastOfGroup ? <BotAvatar error={m.error} /> : <span className="w-7 shrink-0" />)}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] ${tail} px-4 py-2.5 text-[14px] leading-[1.5] ${
                    isUser
                      ? 'bg-gradient-to-br from-[#a23dff] to-[#5a2cff] text-white shadow-[0_6px_16px_-8px_rgba(110,50,255,0.6)]'
                      : m.error
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : `bg-white text-slate-800 ${bubbleShadow}`
                  }`}
                >
                  {isUser ? m.text : tidy(m.text)}
                </div>
              </div>
              {m.error && m.retry && (
                <div className="mt-1.5 pl-9">
                  <button type="button" onClick={() => void send(m.retry!, { resend: true })} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                    <RotateCcw className="h-3 w-3" /> Réessayer
                  </button>
                </div>
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-1.5 space-y-1.5 pl-9">
                  {m.actions.map((a) => (
                    <ActionCard key={a.id} action={a} busy={busy} onUndo={() => void runAction(m.id, a, 'undo')} onActivate={() => void runAction(m.id, a, 'activate')} onView={onView} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div role="status" className={`flex items-end gap-2 ${messages.length ? 'mt-4' : 'mt-3'}`}>
            <BotAvatar />
            <span className={`flex items-center gap-1 rounded-[20px] rounded-bl-md bg-white px-4 py-3.5 ${bubbleShadow}`}>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a23dff]/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a23dff]/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a23dff]/60" />
              <span className="sr-only">Mon IA s’en occupe…</span>
            </span>
          </div>
        )}
      </div>

      {/* Saisie */}
      <form
        className="shrink-0 border-t border-[#eeeaf9] bg-white px-3 pb-3 pt-3"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <div className="flex items-end gap-1.5 rounded-[26px] bg-[#f5f4fc] p-1.5 pl-4 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#a23dff]/30">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any)?.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            aria-label="Ton message pour mon IA"
            placeholder="Écris ton message…"
            className="dash-bare max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[14px] leading-[1.4] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {Recognition && (
            <>
              <button
                type="button"
                onClick={() => setVoiceLang((l) => (l === 'fr-FR' ? 'ar-DZ' : 'fr-FR'))}
                disabled={listening}
                aria-label={`Langue de la dictée : ${voiceLang === 'fr-FR' ? 'français' : 'arabe'}`}
                title="Changer la langue de la dictée"
                className="mb-2 h-6 shrink-0 rounded-full bg-white px-2 text-[10px] font-bold text-slate-500 outline-none transition hover:text-[#5a2cff] focus-visible:ring-2 focus-visible:ring-[#a23dff]/40 disabled:opacity-40 cursor-pointer"
              >
                {voiceLang === 'fr-FR' ? 'FR' : 'عربي'}
              </button>
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                title={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#a23dff]/40 cursor-pointer ${listening ? 'animate-pulse bg-rose-100 text-rose-600' : 'text-slate-500 hover:bg-white hover:text-[#5a2cff]'}`}
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Envoyer"
            title="Envoyer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#a23dff] to-[#5a2cff] text-white shadow-[0_8px_18px_-10px_rgba(110,50,255,0.8)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#a23dff]/50 focus-visible:ring-offset-2 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer disabled:cursor-default"
          >
            {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-400">Tout est enregistré tout de suite · chaque action peut être annulée</p>
      </form>
    </div>
  );
};
