/**
 * JAWEBFLOW — « RÉSEAUX SOCIAUX » : LA PAGE SUR DEMANDE (côté marchand)
 * ============================================================================
 * Le chatbot du site web et les réseaux sociaux sont deux espaces séparés.
 * Tant que l'équipe n'a pas ouvert le second sur le compte, le marchand ne
 * branche rien — mais il VOIT que le module existe, ce qu'il apporte, et il
 * peut DEMANDER son activation :
 *
 *   • pas de tour du module, pas de réglages, pas de formulaire de branchement ;
 *   • un cadenas, le contenu du module, et un bouton « Demander l'activation » ;
 *   • la demande part sur `/api/channels/request-access` : elle est tracée en
 *     base (`social_requests`) ET envoyée par e-mail à l'équipe, qui ouvre le
 *     module client par client depuis la console admin.
 *
 * C'est le visage commercial d'un verrou appliqué AUSSI par le serveur (403) :
 * appeler l'API directement ne l'ouvre pas davantage.
 */

import React, { useEffect, useState } from 'react';
import { Lock, Send, Loader2, CheckCircle2, Mail, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

/** Ce que le module apporte, en clair (aucun jargon technique). */
const CHANNELS: Array<{ id: string; emoji: string; label: string; promesse: string }> = [
  { id: 'instagram', emoji: '📸', label: 'Instagram', promesse: 'DM et commentaires' },
  { id: 'messenger', emoji: '💬', label: 'Messenger', promesse: 'Messages de la page' },
  { id: 'whatsapp', emoji: '📱', label: 'WhatsApp', promesse: 'Numéro Business' },
  { id: 'telegram', emoji: '✈️', label: 'Telegram', promesse: 'Bot de la boutique' },
  { id: 'tiktok', emoji: '🎵', label: 'TikTok', promesse: 'Messages du compte' },
];

const SECTION_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  automations: 'Automatisations',
};

interface Props {
  /** L'écran que le marchand essayait d'ouvrir — sert seulement au message. */
  channel?: string;
}

const dateFr = (value: string | Date) =>
  new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

export const SocialModuleLocked: React.FC<Props> = ({ channel }) => {
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'already' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState('');

  const asked = SECTION_LABELS[channel || ''] || '';

  // Le marchand qui revient doit retrouver son état : « demande envoyée le … »,
  // pas un bouton qui l'invite à redemander tous les jours.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) return;
        const { data, error: readError } = await supabase
          .from('social_requests')
          .select('created_at,status')
          .eq('user_id', uid)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!alive || readError || !data?.created_at) return;
        setSentAt(dateFr(data.created_at));
        setState('sent');
      } catch {
        /* Rien de grave : sans cette lecture, le bouton reste là. */
      }
    })();
    return () => { alive = false; };
  }, []);

  const request = async () => {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/channels/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok && data?.ok) {
        setSentAt(dateFr(new Date()));
        setState('sent');
        return;
      }
      if (res.status === 429) {
        setError(String(data?.error || 'Vous avez déjà demandé l’activation aujourd’hui. Nous vous répondons très vite.'));
        setState('already');
        return;
      }
      setError(
        String(data?.error || '') ||
          'Envoi impossible pour le moment. Écrivez-nous directement à contact@jawebflow.dz — nous ouvrons votre module.',
      );
      setState('error');
    } catch {
      setError(
        'Envoi impossible pour le moment (connexion). Écrivez-nous directement à contact@jawebflow.dz — nous ouvrons votre module.',
      );
      setState('error');
    }
  };

  return (
    <div className="animate-in fade-in duration-200" data-testid="social-locked">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500">
          <Lock className="h-7 w-7" />
        </span>

        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
          <Sparkles className="h-3 w-3" />
          Prochainement
        </span>

        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          Réseaux sociaux — bientôt sur votre compte
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600">
          {asked ? `« ${asked} » fait partie du module Réseaux sociaux. ` : ''}
          Vos clients vous écrivent déjà sur Instagram, Messenger, WhatsApp, Telegram ou TikTok : le
          module branche ces messageries sur votre assistant, qui répond tout seul — et tout arrive
          ici, dans le même tableau de bord.
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left"
            >
              <span className="text-[13px] font-semibold text-slate-800">
                {c.emoji} {c.label}
              </span>
              <span className="block text-[11px] text-slate-500">{c.promesse}</span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[12px] text-slate-500">
          Ce module s’active sur demande : la formule actuelle couvre le chatbot de votre site web.
          Rien à installer, rien à payer maintenant — nous revenons vers vous avec les conditions.
        </p>

        {/* ── La demande d'activation ─────────────────────────────────── */}
        {state === 'sent' ? (
          <div
            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-left"
            data-testid="social-request-sent"
          >
            <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Demande envoyée{sentAt ? ` le ${sentAt}` : ''}.
            </p>
            <p className="mt-1 text-[12px] text-emerald-700">
              Nous vous répondons avec les conditions et nous ouvrons le module sur votre compte.
              Vous pouvez continuer à utiliser le chatbot de votre site en attendant.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3 text-left">
            <label className="block text-[12px] font-semibold text-slate-700" htmlFor="social-request-message">
              Que voulez-vous brancher ? (facultatif)
            </label>
            <textarea
              id="social-request-message"
              data-testid="social-request-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Ex. : Messenger et WhatsApp surtout, on reçoit 40 messages par jour."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-400 focus:bg-white"
            />

            <button
              type="button"
              data-testid="social-request-access"
              onClick={request}
              disabled={state === 'sending'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {state === 'sending' ? 'Envoi…' : 'Demander l’activation'}
            </button>

            {(state === 'error' || state === 'already') && error && (
              <p
                className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] ${
                  state === 'already'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-rose-50 text-rose-700'
                }`}
                data-testid="social-request-error"
              >
                <Mail className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                <span>
                  {error}{' '}
                  {state === 'error' && (
                    <a href="mailto:contact@jawebflow.dz" className="font-semibold underline">
                      contact@jawebflow.dz
                    </a>
                  )}
                </span>
              </p>
            )}

            <p className="text-[11px] text-slate-400">
              Votre demande arrive directement à l’équipe, avec le nom de votre entreprise et votre
              formule : inutile d’écrire un e-mail en plus.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SocialModuleLocked;
