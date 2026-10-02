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
import { AlertTriangle, Check, Database, ExternalLink, Instagram, Loader2, Mic, Phone, RotateCcw, Send, SlidersHorizontal, Sparkles, Undo2, X, Zap } from 'lucide-react';
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

export const QUICK_PROMPTS: Array<{ label: string; text: string; send: boolean }> = [
  { label: 'Ajouter une info à ma base', text: 'Ajoute à ma base : ', send: false },
  { label: 'Répondre aux commentaires', text: 'Quand quelqu’un commente « prix » sous mes publications, réponds-lui en public et envoie-lui un message privé avec mes tarifs.', send: false },
  { label: 'Répondre plus court', text: 'Réponds toujours court et clair à mes clients.', send: true },
  { label: 'Parler darija', text: 'Réponds à mes clients en darija algérienne.', send: true },
  { label: 'Que sais-tu de moi ?', text: 'Fais-moi un résumé de ce que tu sais sur mon entreprise.', send: true },
  { label: 'Mes automatisations', text: 'Quelles automatisations Instagram j’ai ? Lesquelles sont actives ?', send: true },
];

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
}

export const CopilotChat: React.FC<CopilotChatProps> = (props) => {
  const { open, onClose, userId } = props;
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
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  // À l'ouverture, le curseur est prêt dans la zone de texte
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
    if (typeof window !== 'undefined' && window.innerWidth < 1024) onClose(); // sur téléphone, le chat cache l'écran
  };

  const empty = messages.length === 0;

  return (
    <div
      role="dialog"
      aria-label="Discussion avec mon IA"
      hidden={!open}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className={`${open ? 'flex' : 'hidden'} fixed inset-0 z-[60] flex-col bg-white sm:inset-auto sm:bottom-4 sm:right-4 sm:top-[4.75rem] sm:w-[430px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl`}
    >
      {/* En-tête */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-white sm:rounded-t-2xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight">Mon IA</h2>
          <p className="truncate text-[11px] text-purple-100">Dis-lui quoi faire en français, en darija ou en arabe</p>
        </div>
        <button type="button" onClick={reset} disabled={busy || empty} aria-label="Nouvelle discussion" title="Nouvelle discussion" className="rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 cursor-pointer">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" className="rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4" aria-live="polite">
        {empty && (
          <div className="px-1 text-sm text-slate-600">
            <p className="text-base font-semibold text-slate-900">Salut 👋 Je suis ton IA.</p>
            <p className="mt-1">Dis-moi quoi faire, je le fais <b>pour de vrai</b> — et tu peux toujours annuler.</p>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              <li>📚 Ajouter ou corriger les infos de ton entreprise</li>
              <li>💬 Répondre aux commentaires Instagram à ta façon</li>
              <li>🎯 Changer la façon de parler à tes clients (court, darija, tutoiement…)</li>
            </ul>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Essaie par exemple</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.label} type="button" onClick={() => pickPrompt(p)} disabled={busy} className="rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50 cursor-pointer">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-md bg-purple-600 text-white'
                  : m.error
                    ? 'rounded-bl-md border border-rose-200 bg-rose-50 text-rose-700'
                    : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
              }`}
            >
              {m.role === 'assistant' ? tidy(m.text) : m.text}
            </div>
            {m.error && m.retry && (
              <button type="button" onClick={() => void send(m.retry!, { resend: true })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                <RotateCcw className="h-3 w-3" /> Réessayer
              </button>
            )}
            {m.actions && m.actions.length > 0 && (
              <div className="w-full max-w-[96%] space-y-1.5">
                {m.actions.map((a) => (
                  <ActionCard key={a.id} action={a} busy={busy} onUndo={() => void runAction(m.id, a, 'undo')} onActivate={() => void runAction(m.id, a, 'activate')} onView={onView} />
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div role="status" className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" />
            </span>
            Mon IA s’en occupe…
          </div>
        )}
      </div>

      {/* Zone de saisie */}
      <form
        className="border-t border-slate-200 bg-white p-3 sm:rounded-b-2xl"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <div className="flex items-end gap-2">
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
            placeholder="Écris ce que tu veux que je fasse…"
            className="max-h-36 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          {Recognition && (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                title={listening ? 'Arrêter la dictée' : 'Dicter mon message'}
                className={`rounded-xl border p-2.5 cursor-pointer ${listening ? 'animate-pulse border-rose-300 bg-rose-100 text-rose-600' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setVoiceLang((l) => (l === 'fr-FR' ? 'ar-DZ' : 'fr-FR'))}
                disabled={listening}
                aria-label={`Langue de la dictée : ${voiceLang === 'fr-FR' ? 'français' : 'arabe'}`}
                title="Changer la langue de la dictée"
                className="rounded-md px-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                {voiceLang === 'fr-FR' ? 'FR' : 'عربي'}
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Envoyer"
            title="Envoyer"
            className="rounded-xl bg-purple-600 p-2.5 text-white transition-colors hover:bg-purple-700 disabled:opacity-40 cursor-pointer"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-400">Tout est enregistré tout de suite · chaque action peut être annulée</p>
      </form>
    </div>
  );
};
