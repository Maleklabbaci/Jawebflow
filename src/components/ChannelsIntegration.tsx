/**
 * JAWEBFLOW — « MESSAGERIES » : brancher Messenger, WhatsApp, Telegram, TikTok
 * ============================================================================
 * Le marchand colle deux informations (l'identifiant du compte et le jeton) et
 * clique « Tester et connecter ». Le serveur teste le jeton auprès de la
 * plateforme AVANT de l'enregistrer : un mauvais jeton est refusé tout de
 * suite, avec la raison exacte.
 *
 * Ce que cet écran ne fait JAMAIS : afficher un jeton. Il ne reçoit que
 * `hasToken` du serveur (voir functions/api/channels/integrations.ts).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Copy, Facebook, Loader2, MessageCircle, Music2, Plug, RefreshCw, Send, Unplug,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChannelInfo {
  id: string;
  label: string;
  what: string;
  accountLabel: string;
  tokenLabel: string;
  cost: string;
  paid: boolean;
  webhookUrl: string;
  keyedWebhook: boolean;
}

interface Integration {
  channel: string;
  accountId: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  connected: boolean;
  lastError?: string | null;
  hasToken: boolean;
}

interface WaUsage {
  billable: number;
  free: number;
  quota: number;
  purchased: number;
  remaining: number;
}

interface Props {
  assistantId: string;
  plan?: string;
  /**
   * N'afficher QUE ce canal (« messenger », « whatsapp », « telegram »,
   * « tiktok »). Chaque entrée du menu « Canaux » ouvre ainsi son propre écran.
   * Vide = les quatre d'un coup.
   */
  channel?: string;
}

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  messenger: Facebook,
  whatsapp: MessageCircle,
  telegram: Send,
  tiktok: Music2,
};

const card = 'rounded-[28px] bg-white p-6 sm:p-7 shadow-[0_1px_2px_rgba(27,22,71,0.04)]';
const field = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#5a2cff]';
const primary = 'inline-flex items-center gap-2 rounded-full bg-[#1b1647] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer';
const ghost = 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

export const ChannelsIntegration: React.FC<Props> = ({ assistantId, plan, channel }) => {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [usage, setUsage] = useState<WaUsage | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [form, setForm] = useState<Record<string, { accountId: string; token: string; phoneNumber: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/integrations?assistantId=${encodeURIComponent(assistantId || '')}`, { headers: await authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Chargement impossible' });
        return;
      }
      setChannels(data.channels || []);
      setIntegrations(data.integrations || []);
      setUsage(data.whatsapp || null);
      setSetupRequired(Boolean(data.setupRequired));
    } catch {
      setNotice({ type: 'error', text: 'Serveur injoignable. Réessayez dans un instant.' });
    } finally {
      setLoading(false);
    }
  }, [assistantId, authHeader]);

  useEffect(() => { load(); }, [load]);

  // Un onglet du menu = un canal : on ne montre que le sien.
  const visibleChannels = channel ? channels.filter((c) => c.id === channel) : channels;
  const single = channel ? channels.find((c) => c.id === channel) : undefined;

  const integrationOf = (id: string) => integrations.find((i) => i.channel === id);
  const formOf = (id: string) => form[id] || { accountId: '', token: '', phoneNumber: '' };
  const patchForm = (id: string, patch: Partial<{ accountId: string; token: string; phoneNumber: string }>) =>
    setForm((prev) => ({ ...prev, [id]: { ...formOf(id), ...patch } }));

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setNotice({ type: 'info', text: 'Copie impossible : sélectionnez le texte et copiez-le à la main.' });
    }
  };

  const connect = async (id: string) => {
    const values = formOf(id);
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch('/api/channels/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          channel: id,
          accountId: values.accountId.trim(),
          token: values.token.trim(),
          phoneNumber: values.phoneNumber.trim() || undefined,
          assistantId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Connexion refusée' });
        return;
      }
      setNotice({
        type: 'success',
        text: data.verified === false ? data.message : `Connecté. ${data.message}`,
      });
      patchForm(id, { token: '' }); // on ne garde aucun jeton à l'écran
      await load();
    } catch {
      setNotice({ type: 'error', text: 'Serveur injoignable. Réessayez dans un instant.' });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/channels/integrations?channel=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'error', text: data?.error || 'Déconnexion impossible' });
        return;
      }
      setNotice({ type: 'info', text: 'Canal déconnecté. Les messages ne seront plus traités.' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-slate-500" data-testid="channels-loading">
        <Loader2 className="h-5 w-5 animate-spin" /> Chargement de vos messageries…
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="channels-integration">
      <div className={card}>
        <h1 className="text-3xl text-[#1b1647]">{single ? single.label : 'Messageries'}</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          {single
            ? single.what
            : 'Branchez vos messageries : votre assistant répond alors partout où vos clients vous écrivent — même quand vous dormez. Aucun jeton ne s’affiche jamais sur cet écran.'}
        </p>
      </div>

      {setupRequired && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" data-testid="channels-setup-required">
          <strong>Une étape technique manque.</strong> La base de données n’a pas encore ses tables de canaux :
          exécutez <code className="rounded bg-white px-1.5 py-0.5">supabase/migration_channels.sql</code> dans
          Supabase (SQL Editor), puis rechargez cette page.
        </div>
      )}

      {notice && (
        <div
          data-testid="channels-notice"
          className={`rounded-[24px] p-4 text-sm ${
            notice.type === 'success' ? 'bg-emerald-50 text-emerald-800'
              : notice.type === 'error' ? 'bg-rose-50 text-rose-800'
                : 'bg-[#f6f7fd] text-[#1b1647]'
          }`}
        >
          {notice.text}
        </div>
      )}

      {visibleChannels.map((ch) => {
        const it = integrationOf(ch.id);
        const Icon = CHANNEL_ICONS[ch.id] || Plug;
        const values = formOf(ch.id);
        const isBusy = busy === ch.id;
        const canSubmit = values.accountId.trim().length > 0 && values.token.trim().length > 0 && !isBusy;
        const finalUrl = ch.keyedWebhook && it ? `${ch.webhookUrl}?key=${it.accountId}` : ch.webhookUrl;

        return (
          <div key={ch.id} className={card} data-testid={`channel-card-${ch.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f6f7fd] text-[#5a2cff]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl text-[#1b1647]">{ch.label}</h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-500">{ch.what}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ch.paid ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {ch.paid ? 'Payant chez Meta' : 'Gratuit'}
                </span>
                <span
                  data-testid={`channel-status-${ch.id}`}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${it?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  {it?.connected ? '● Connecté' : 'Non connecté'}
                </span>
              </div>
            </div>

            {/* ── Canal connecté ─────────────────────────────────────────── */}
            {it?.connected ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-[#f6f7fd] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-slate-600">
                      Compte : <strong className="text-[#1b1647]">{it.displayName || ch.label}</strong>
                      <span className="ml-2 font-mono text-xs text-slate-500">{it.accountId}</span>
                      {it.phoneNumber ? <span className="ml-2 text-xs text-slate-500">{it.phoneNumber}</span> : null}
                    </span>
                    <span className={`text-xs font-semibold ${it.hasToken ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {it.hasToken ? 'Jeton enregistré' : 'Aucun jeton — reconnectez'}
                    </span>
                  </div>
                  {it.lastError ? (
                    <p className="mt-2 flex items-start gap-2 text-xs text-rose-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Dernière erreur : {it.lastError}
                    </p>
                  ) : null}
                </div>

                {ch.id === 'whatsapp' && usage ? (
                  <div className="rounded-2xl border border-slate-200 p-4" data-testid="whatsapp-gauge">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-[#1b1647]">Messages facturés ce mois-ci</span>
                      <span className="text-slate-600">
                        {usage.billable} / {usage.quota + usage.purchased} {usage.purchased > 0 ? `(dont ${usage.purchased} rechargés)` : ''}
                      </span>
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${usage.billable >= usage.quota + usage.purchased ? 'bg-rose-500' : usage.billable >= (usage.quota + usage.purchased) * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (usage.billable / Math.max(1, usage.quota + usage.purchased)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {usage.quota === 0
                        ? `WhatsApp n’est pas inclus dans votre formule${plan ? ` (${plan})` : ''} : passez à Pro pour l’activer.`
                        : usage.remaining > 0
                          ? `Il vous reste ${usage.remaining} réponses ce mois-ci. Un message n’est compté que lorsque Meta confirme sa livraison.`
                          : 'Forfait épuisé : les réponses WhatsApp reprennent le 1ᵉʳ du mois, ou rechargez dès maintenant.'}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-[#1b1647]">Adresse à donner à la plateforme</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-xl bg-[#f6f7fd] px-3 py-2 font-mono text-xs text-slate-700" data-testid={`webhook-url-${ch.id}`}>
                      {finalUrl}
                    </code>
                    <button type="button" onClick={() => copy(finalUrl, ch.id)} className={ghost} aria-label={`Copier l’adresse du webhook ${ch.label}`}>
                      {copied === ch.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === ch.id ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => connect(ch.id)} disabled={isBusy} className={ghost} data-testid={`reconnect-${ch.id}`}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Vérifier à nouveau
                  </button>
                  <button type="button" onClick={() => disconnect(ch.id)} disabled={isBusy} className={ghost} data-testid={`disconnect-${ch.id}`}>
                    <Unplug className="h-4 w-4" /> Déconnecter
                  </button>
                </div>
              </div>
            ) : (
              /* ── Canal non connecté : le formulaire ───────────────────── */
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`account-${ch.id}`} className="block text-sm font-semibold text-[#1b1647]">{ch.accountLabel}</label>
                    <input
                      id={`account-${ch.id}`}
                      aria-label={ch.accountLabel}
                      value={values.accountId}
                      onChange={(e) => patchForm(ch.id, { accountId: e.target.value })}
                      className={field}
                      placeholder={ch.keyedWebhook ? 'ma-cle-secrete-2026' : '1234567890'}
                    />
                  </div>
                  <div>
                    <label htmlFor={`token-${ch.id}`} className="block text-sm font-semibold text-[#1b1647]">{ch.tokenLabel}</label>
                    <input
                      id={`token-${ch.id}`}
                      aria-label={ch.tokenLabel}
                      type="password"
                      autoComplete="off"
                      value={values.token}
                      onChange={(e) => patchForm(ch.id, { token: e.target.value })}
                      className={field}
                      placeholder="EAA…"
                    />
                  </div>
                  {ch.id === 'whatsapp' ? (
                    <div className="sm:col-span-2">
                      <label htmlFor={`phone-${ch.id}`} className="block text-sm font-semibold text-[#1b1647]">
                        Numéro affiché <span className="font-light text-slate-400">(facultatif)</span>
                      </label>
                      <input
                        id={`phone-${ch.id}`}
                        aria-label="Numéro affiché"
                        value={values.phoneNumber}
                        onChange={(e) => patchForm(ch.id, { phoneNumber: e.target.value })}
                        className={field}
                        placeholder="+213 …"
                      />
                    </div>
                  ) : null}
                </div>

                <p className="text-xs text-slate-500">{ch.cost}</p>

                <details className="rounded-2xl bg-[#f6f7fd] p-4 text-sm text-[#1b1647]">
                  <summary className="cursor-pointer font-semibold">Où trouver ces informations ?</summary>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-600">
                    {ch.id === 'messenger' && (
                      <>
                        <li>Facebook Developers → votre application → Messenger → Réglages.</li>
                        <li>« Identifiant de la page » : dans les réglages de votre page Facebook (À propos → Transparence de la page).</li>
                        <li>« Jeton de la page » : généré dans l’application (jeton d’accès de page).</li>
                        <li>Dans l’application, l’adresse du webhook est <code className="rounded bg-white px-1.5 py-0.5">{finalUrl}</code>.</li>
                      </>
                    )}
                    {ch.id === 'whatsapp' && (
                      <>
                        <li>Meta Business → WhatsApp → Configuration de l’API.</li>
                        <li>« Identifiant du numéro » (Phone number ID) : ce n’est PAS le numéro lui-même.</li>
                        <li>« Jeton d’accès » : jeton permanent du compte système.</li>
                        <li>L’adresse du webhook est <code className="rounded bg-white px-1.5 py-0.5">{finalUrl}</code> (champ « messages » obligatoire).</li>
                      </>
                    )}
                    {ch.id === 'telegram' && (
                      <>
                        <li>Écrivez à <strong>@BotFather</strong> sur Telegram → <code className="rounded bg-white px-1.5 py-0.5">/newbot</code> → copiez le jeton.</li>
                        <li>« Clé de liaison » : inventez une chaîne secrète (au moins 12 caractères).</li>
                        <li>Puis enregistrez l’adresse : <code className="rounded bg-white px-1.5 py-0.5">{finalUrl}</code></li>
                      </>
                    )}
                    {ch.id === 'tiktok' && (
                      <>
                        <li>TikTok for Business → Business Messaging (accès à demander).</li>
                        <li>« Clé de liaison » : inventez une chaîne secrète (au moins 12 caractères).</li>
                        <li>Collez l’adresse <code className="rounded bg-white px-1.5 py-0.5">{finalUrl}</code> dans les réglages du webhook.</li>
                      </>
                    )}
                  </ol>
                </details>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => connect(ch.id)} disabled={!canSubmit} className={primary} data-testid={`connect-${ch.id}`}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Tester et connecter
                  </button>
                  <button
                    type="button"
                    onClick={() => { patchForm(ch.id, { token: '' }); setNotice(null); }}
                    className={ghost}
                    disabled={isBusy}
                  >
                    Effacer
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
