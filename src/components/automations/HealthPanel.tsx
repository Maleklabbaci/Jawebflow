/**
 * « Est-ce que ça marche ? » — le bilan de santé, en clair.
 * Chaque point vient d'une VRAIE vérification auprès d'Instagram (jamais un faux « tout va bien »).
 */
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { DiagnosticCheck, Diagnostics } from '../../lib/ig-automations-api';
import { Card, secondaryBtn, timeAgo } from './ui';

const ICON: Record<DiagnosticCheck['status'], React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  unknown: <CircleHelp className="h-4 w-4 text-slate-400" />,
};

export function HealthPanel({
  diag,
  loading,
  error,
  repairing,
  repairMessage,
  onRefresh,
  onRepair,
  onGoToInstagram,
}: {
  diag: Diagnostics | null;
  loading: boolean;
  error: string;
  repairing: boolean;
  repairMessage: string;
  onRefresh: () => void;
  onRepair: () => void;
  onGoToInstagram: (why: 'connect' | 'comments') => void;
}) {
  const [open, setOpen] = useState(false);
  const problems = (diag?.checks || []).filter((c) => c.status === 'error' || c.status === 'warn');
  const allGood = Boolean(diag?.connected) && problems.length === 0;

  const actionButton = (c: DiagnosticCheck) => {
    if (!c.action) return null;
    if (c.action === 'repair') {
      return (
        <button type="button" onClick={onRepair} disabled={repairing} className={secondaryBtn}>
          {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Réparer
        </button>
      );
    }
    if (c.action === 'connect') {
      return <button type="button" onClick={() => onGoToInstagram('connect')} className={secondaryBtn}>Connecter Instagram</button>;
    }
    return <button type="button" onClick={() => onGoToInstagram('comments')} className={secondaryBtn}>Reconnecter Instagram</button>;
  };

  if (loading && !diag) {
    return (
      <Card className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Vérification de ta connexion Instagram…
      </Card>
    );
  }

  if (error && !diag) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
        <span>{error}</span>
        <button type="button" onClick={onRefresh} className={secondaryBtn}><RefreshCw className="h-4 w-4" /> Réessayer</button>
      </Card>
    );
  }

  // Tout va bien : une simple ligne discrète, rien de technique.
  if (allGood && !repairMessage) {
    return (
      <p className="flex items-center gap-2 text-xs text-emerald-700" data-testid="health-title">
        <CheckCircle2 className="h-4 w-4" /> Instagram est bien connecté{diag?.username ? ` (@${diag.username})` : ''}
      </p>
    );
  }

  return (
    <Card className={allGood ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          {allGood ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
          <div className="min-w-0">
            <p className="font-semibold text-slate-900" data-testid="health-title">
              {allGood
                ? `Instagram est bien connecté${diag?.username ? ` (@${diag.username})` : ''}`
                : !diag?.connected
                  ? 'Instagram n’est pas encore connecté'
                  : `${problems.length} point${problems.length > 1 ? 's' : ''} à régler pour que tout fonctionne`}
            </p>
            {allGood && diag?.lastCommentAt && <p className="text-xs text-slate-500">Dernier commentaire reçu {timeAgo(diag.lastCommentAt)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className={secondaryBtn} aria-label="Vérifier à nouveau la connexion">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Vérifier
          </button>
        </div>
      </div>

      {repairMessage && <p className="border-t border-slate-200/70 px-4 py-2.5 text-xs text-slate-700" role="status">{repairMessage}</p>}

      {(open || !allGood) && diag && (
        <ul className="divide-y divide-slate-200/70 border-t border-slate-200/70" aria-label="Détails de la connexion">
          {diag.checks.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{c.title}</p>
                  {c.detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.detail}</p>}
                </div>
              </div>
              {(c.status === 'error' || c.status === 'warn') && actionButton(c)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
