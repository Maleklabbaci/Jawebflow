/**
 * Une carte de la liste : ce que fait l'automatisation, ses chiffres, et ses boutons.
 * Composant « pur » (aucun appel réseau) : l'écran parent décide quoi faire de chaque clic.
 */
import React from 'react';
import { Copy, History, Loader2, Pencil, Trash2 } from 'lucide-react';
import { TRIGGER_LABELS, describeActions, describeTrigger, type Automation, type TriggerType } from '../../../functions/_shared/ig-automation-core';
import { Card, Toggle, ghostBtn, timeAgo } from './ui';

const TRIGGER_EMOJI: Record<TriggerType, string> = { comment: '💬', dm_keyword: '🔑', story_reply: '📖', story_mention: '📣' };

export function AutomationCard({
  a,
  busy,
  confirmingDelete,
  onToggle,
  onEdit,
  onHistory,
  onDuplicate,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  a: Automation;
  busy: boolean;
  confirmingDelete: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onHistory: () => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={`p-4 sm:p-5 ${a.enabled ? '' : 'bg-slate-50/60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-2xl" aria-hidden>{TRIGGER_EMOJI[a.triggerType]}</span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">{a.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{TRIGGER_LABELS[a.triggerType].short}</p>
            <p className="mt-2 text-sm text-slate-700">{describeTrigger(a)}</p>
            <p className="mt-0.5 text-sm text-slate-500">{describeActions(a)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden text-xs font-medium sm:inline ${a.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>{a.enabled ? 'Active' : 'En pause'}</span>
          <Toggle checked={a.enabled} busy={busy} onChange={onToggle} label={`${a.enabled ? 'Mettre en pause' : 'Activer'} « ${a.name} »`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500" data-testid={`stats-${a.id}`}>
          {a.stats.triggered === 0 ? (
            'Pas encore déclenchée'
          ) : (
            <>
              <strong className="text-slate-800">{a.stats.triggered}</strong> déclenchement{a.stats.triggered > 1 ? 's' : ''}
              {a.config.dm.enabled && <> · <strong className="text-slate-800">{a.stats.dms}</strong> message{a.stats.dms > 1 ? 's' : ''} privé{a.stats.dms > 1 ? 's' : ''}</>}
              {a.config.publicReply.enabled && <> · <strong className="text-slate-800">{a.stats.publicReplies}</strong> réponse{a.stats.publicReplies > 1 ? 's' : ''} publique{a.stats.publicReplies > 1 ? 's' : ''}</>}
              {a.stats.lastTriggeredAt && <> · {timeAgo(a.stats.lastTriggeredAt)}</>}
            </>
          )}
          {a.stats.errors > 0 && (
            <button type="button" onClick={onHistory} className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 hover:bg-red-200">
              {a.stats.errors} erreur{a.stats.errors > 1 ? 's' : ''} — voir pourquoi
            </button>
          )}
        </p>

        {confirmingDelete ? (
          <div className="flex items-center gap-2" role="group" aria-label="Confirmer la suppression">
            <span className="text-xs font-medium text-red-700">Supprimer pour de bon ?</span>
            <button type="button" onClick={onDelete} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Oui, supprimer'}
            </button>
            <button type="button" onClick={onCancelDelete} className={ghostBtn}>Annuler</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={onEdit} className={ghostBtn} aria-label={`Modifier « ${a.name} »`}><Pencil className="h-3.5 w-3.5" /> Modifier</button>
            <button type="button" onClick={onHistory} className={ghostBtn} aria-label={`Historique de « ${a.name} »`}><History className="h-3.5 w-3.5" /> Historique</button>
            <button type="button" onClick={onDuplicate} disabled={busy} className={ghostBtn} aria-label={`Dupliquer « ${a.name} »`}><Copy className="h-3.5 w-3.5" /> Dupliquer</button>
            <button type="button" onClick={onAskDelete} className={`${ghostBtn} hover:bg-red-50! hover:text-red-700!`} aria-label={`Supprimer « ${a.name} »`}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          </div>
        )}
      </div>
    </Card>
  );
}
