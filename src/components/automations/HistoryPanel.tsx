/**
 * Historique : « qui a déclenché quoi, et est-ce que ça a marché ? »
 * Les échecs sont expliqués en français (écrits côté serveur).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import type { Automation } from '../../../functions/_shared/ig-automation-core';
import { ApiError, igApi, type AutomationEvent } from '../../lib/ig-automations-api';
import { Card, Notice, ghostBtn, secondaryBtn, timeAgo } from './ui';

const OUTCOME: Record<AutomationEvent['outcome'], { label: string; cls: string }> = {
  done: { label: 'Réussi', cls: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Partiel', cls: 'bg-amber-100 text-amber-800' },
  failed: { label: 'Échec', cls: 'bg-red-100 text-red-800' },
  skipped: { label: 'Ignoré', cls: 'bg-slate-100 text-slate-600' },
  processing: { label: 'En cours', cls: 'bg-sky-100 text-sky-800' },
};

function StatusDot({ label, status }: { label: string; status: string | null }) {
  if (!status) return null;
  const map: Record<string, { sym: string; cls: string; txt: string }> = {
    sent: { sym: '✓', cls: 'text-emerald-600', txt: 'envoyé' },
    failed: { sym: '✗', cls: 'text-red-600', txt: 'échec' },
    skipped: { sym: '–', cls: 'text-slate-400', txt: 'ignoré' },
    awaiting_follow: { sym: '⏳', cls: 'text-amber-600', txt: 'en attente de l’abonnement' },
  };
  const m = map[status] || { sym: '•', cls: 'text-slate-500', txt: status };
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${m.cls}`} title={`${label} : ${m.txt}`}>
      <span aria-hidden>{m.sym}</span>
      <span>{label}</span>
      <span className="sr-only">{m.txt}</span>
    </span>
  );
}

export function HistoryPanel({
  automations,
  initialAutomationId,
  onBack,
}: {
  automations: Automation[];
  initialAutomationId?: string;
  onBack: () => void;
}) {
  const [automationId, setAutomationId] = useState<string>(initialAutomationId || '');
  const [events, setEvents] = useState<AutomationEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await igApi.events(automationId || undefined);
      setEvents(res.events || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger l’historique.');
    } finally {
      setLoading(false);
    }
  }, [automationId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className={ghostBtn}><ArrowLeft className="h-4 w-4" /> Retour</button>
          <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="history-filter">Filtrer par automatisation</label>
          <select
            id="history-filter"
            value={automationId}
            onChange={(e) => setAutomationId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">Toutes les automatisations</option>
            {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading} className={secondaryBtn} aria-label="Actualiser l’historique">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualiser
          </button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Card className="overflow-hidden">
        {loading && !events ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>
        ) : (
          <HistoryList events={events || []} />
        )}
      </Card>
    </div>
  );
}

/** La liste elle-même (sans chargement) : réutilisée telle quelle par l'aperçu statique. */
export function HistoryList({ events }: { events: AutomationEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-2xl">🕒</p>
        <p className="mt-2 text-sm font-medium text-slate-700">Rien pour l’instant</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          Dès que quelqu’un déclenchera une de tes automatisations, tu verras ici ce qui a été envoyé, et si Instagram l’a bien accepté.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100" aria-label="Historique des déclenchements">
      {events.map((e) => (
        <li key={e.id} className="space-y-1.5 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{e.username ? `@${e.username}` : 'Un contact'}</span>
              <span className="text-slate-400"> · </span>
              <span className="text-slate-500">{e.automationName || 'Automatisation supprimée'}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400" title={new Date(e.createdAt).toLocaleString('fr-FR')}>{timeAgo(e.createdAt)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME[e.outcome]?.cls || OUTCOME.processing.cls}`}>
                {OUTCOME[e.outcome]?.label || e.outcome}
              </span>
            </div>
          </div>
          {e.inputText && <p className="text-sm text-slate-600">« {e.inputText} »</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusDot label="Réponse publique" status={e.publicReplyStatus} />
            <StatusDot label="Message privé" status={e.dmStatus} />
          </div>
          {e.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">{e.error}</p>}
          {!e.error && e.note && <p className="text-xs text-slate-500">{e.note}</p>}
        </li>
      ))}
    </ul>
  );
}
