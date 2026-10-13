/**
 * JAWEBFLOW — « RÉSEAUX SOCIAUX » : LE CADENAS (côté marchand)
 * ============================================================================
 * Le chatbot du site web et le module Réseaux sociaux sont deux produits
 * distincts. Quand le module n'est pas ouvert sur le compte, le marchand NE
 * tombe pas sur une page blanche ni sur un écran technique :
 *
 *   • il voit ce que le module apporte (Instagram, Messenger, WhatsApp,
 *     Telegram, TikTok) ;
 *   • il peut DEMANDER l'activation en un clic (e-mail à l'équipe + trace) ;
 *   • il peut vérifier lui-même si l'activation vient d'être faite, sans
 *     attendre une réponse.
 *
 * Le verrou est aussi appliqué par le serveur (403) : ce composant est le
 * visage commercial d'un contrôle qui ne se contourne pas.
 */

import React, { useState } from 'react';
import {
  ArrowRight, Check, Facebook, Instagram, Loader2, Lock, MessageCircle, Music2, RefreshCw, Send, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const CHANNELS: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; blurb: string }> = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, blurb: 'Messages privés et commentaires' },
  { id: 'messenger', label: 'Messenger', icon: Facebook, blurb: 'Page Facebook et Messenger' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, blurb: 'Vos clients sur WhatsApp' },
  { id: 'telegram', label: 'Telegram', icon: Send, blurb: 'Bot Telegram' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, blurb: 'Messages TikTok Business' },
];

const BENEFITS = [
  'Votre assistant répond tout seul, 24h/24, sur vos réseaux',
  'Les conversations remontent dans « Clients » comme sur le site',
  'Un onglet par réseau : vous voyez d’un coup d’œil ce qui est branché',
  'Aucun jeton ne traîne : les accès restent chez nous, côté serveur',
];

interface Props {
  /** Le canal que le marchand essayait d'ouvrir — sert seulement au message. */
  channel?: string;
  /** Appelé quand le serveur confirme que le module vient d'être ouvert. */
  onUnlocked?: () => void;
}

export const SocialModuleLocked: React.FC<Props> = ({ channel, onUnlocked }) => {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  const authHeader = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch {
      return {};
    }
  };

  const ask = async () => {
    setState('sending');
    setNotice(null);
    try {
      const res = await fetch('/api/channels/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ message: message.trim(), channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setNotice(data?.error || 'Envoi impossible pour le moment. Réessayez dans un instant.');
        return;
      }
      setState('sent');
      setMessage('');
    } catch {
      setState('error');
      setNotice("Serveur injoignable. Écrivez-nous à contact@jawebflow.dz — nous ouvrons votre module.");
    }
  };

  /** « J'ai été activé ? » : une requête suffit, le serveur est la référence. */
  const check = async () => {
    setChecking(true);
    setCheckFailed(false);
    try {
      const res = await fetch('/api/channels/integrations', { headers: await authHeader() });
      if (res.ok) {
        onUnlocked?.();
        return;
      }
      setCheckFailed(true);
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-200" data-testid="social-locked">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#5a2cff] to-[#a23dff] px-6 py-7 text-white">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Module à activer
          </span>
          <h1 className="mt-3 text-2xl font-bold">Réseaux sociaux</h1>
          <p className="mt-2 max-w-xl text-sm text-white/90">
            Votre assistant est prêt à répondre sur vos réseaux — Instagram, Messenger, WhatsApp,
            Telegram et TikTok. C’est un module séparé du chatbot de votre site : demandez son
            activation, nous l’ouvrons sur votre compte.
          </p>
        </div>

        <div className="px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNELS.map(({ id, label, icon: Icon, blurb }) => (
              <div key={id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1ecff] text-[#5a2cff]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="truncate text-xs text-slate-500">{blurb}</p>
                </div>
                <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" />
              </div>
            ))}
          </div>

          <ul className="mt-5 space-y-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {b}
              </li>
            ))}
          </ul>

          {state === 'sent' ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid="social-request-sent">
              <p className="text-sm font-semibold text-emerald-900">Demande envoyée ✓</p>
              <p className="mt-1 text-sm text-emerald-800">
                Nous vous répondons sur votre adresse e-mail, et le module s’ouvrira ici automatiquement.
                Vous venez d’être activé ? Rechargez la page.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <label htmlFor="social-request-message" className="text-sm font-medium text-slate-700">
                Un mot pour nous ? (facultatif)
              </label>
              <textarea
                id="social-request-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Ex. : je veux surtout Messenger et WhatsApp pour ma boutique"
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#a23dff] focus:ring-2 focus:ring-[#a23dff]/20"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={ask}
                  disabled={state === 'sending'}
                  data-testid="social-request-access"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5a2cff] to-[#a23dff] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Demander l’activation
                </button>
                <button
                  type="button"
                  onClick={check}
                  disabled={checking}
                  data-testid="social-lock-check"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  J’ai été activé, vérifier
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Votre demande part à <strong>contact@jawebflow.dz</strong> avec le nom de votre compte :
                nous n’avons rien à vous demander de plus.
              </p>
            </div>
          )}

          {state === 'error' && notice && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" data-testid="social-request-error">
              {notice}
            </div>
          )}
          {checkFailed && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Pas encore ouvert sur votre compte. Écrivez-nous si vous voulez savoir où ça en est.
            </div>
          )}

          <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              Rien n’est facturé tant que vous n’avez pas accepté l’activation : cette demande nous sert
              seulement à vous préparer votre accès.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialModuleLocked;
