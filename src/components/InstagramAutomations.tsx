/**
 * JAWEBFLOW — « Automatisations » : le ManyChat de JawebFlow.
 *
 *   💬 Commentaire sous un post/reel ➜ réponse publique + message privé
 *   🔑 Mot-clé reçu en message privé ➜ réponse automatique immédiate
 *   📖 Réponse à une story / 📣 mention en story ➜ message automatique
 *
 * Le robot IA (base de connaissances du site) continue de répondre à tout le
 * reste : les règles passent en premier, l'IA prend le relais.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Loader2, Plus, Zap } from 'lucide-react';
import { AUTOMATION_TEMPLATES, normalizeConfig, type Automation } from '../../functions/_shared/ig-automation-core';
import { ApiError, igApi, type Diagnostics } from '../lib/ig-automations-api';
import { AutomationEditor, type Draft } from './automations/AutomationEditor';
import { HealthPanel } from './automations/HealthPanel';
import { AutomationCard } from './automations/AutomationCard';
import { HistoryPanel } from './automations/HistoryPanel';
import { SetupBanner } from './automations/SetupBanner';
import { Card, Notice, ghostBtn, primaryBtn, secondaryBtn } from './automations/ui';

interface Props {
  businessName?: string;
  /** Propriétaire de la plateforme : voit les étapes de mise à jour de la base (les clients voient un simple message). */
  isAdmin?: boolean;
  /** Renvoie vers l'onglet Instagram (« connect » : connecter le compte ; « comments » : autoriser les commentaires). */
  onGoToInstagram: (why?: 'connect' | 'comments') => void;
}

type View = 'list' | 'new' | 'edit' | 'history';
type NoticeState = { kind: 'success' | 'error' | 'info' | 'warn'; text: string } | null;

export const InstagramAutomations: React.FC<Props> = ({ businessName, isAdmin = false, onGoToInstagram }) => {
  const [view, setView] = useState<View>('list');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [historyFor, setHistoryFor] = useState<string | undefined>();

  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const flash = useCallback((kind: NonNullable<NoticeState>['kind'], text: string) => setNotice({ kind, text }), []);
  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await igApi.list();
      if (!mounted.current) return;
      setSetupRequired(Boolean(res.setupRequired));
      setAutomations(res.automations || []);
    } catch (e) {
      if (mounted.current) setLoadError(e instanceof ApiError ? e.message : 'Impossible de charger tes automatisations.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setDiagLoading(true);
    setDiagError('');
    try {
      const res = await igApi.diagnostics();
      if (mounted.current) setDiag(res);
    } catch (e) {
      if (mounted.current) setDiagError(e instanceof ApiError ? e.message : 'Impossible de vérifier la connexion Instagram.');
    } finally {
      if (mounted.current) setDiagLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    void loadHealth();
  }, [loadList, loadHealth]);

  const repair = async () => {
    setRepairing(true);
    setRepairMessage('');
    try {
      const res = await igApi.repairSubscription();
      setRepairMessage(res.message);
      await loadHealth();
    } catch (e) {
      setRepairMessage(e instanceof ApiError ? e.message : 'La réparation a échoué. Réessaie dans un instant.');
    } finally {
      setRepairing(false);
    }
  };

  // ── Actions sur la liste ──────────────────────────────────────────────────
  const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  const toggle = async (a: Automation, enabled: boolean) => {
    setBusyFor(a.id, true);
    setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled } : x))); // réponse immédiate à l'écran
    try {
      const res = await igApi.setEnabled(a.id, enabled);
      setAutomations((list) => list.map((x) => (x.id === a.id ? res.automation : x)));
      flash('success', enabled ? `« ${a.name} » est activée : le robot travaille pour toi.` : `« ${a.name} » est en pause.`);
    } catch (e) {
      setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled: a.enabled } : x))); // on revient en arrière
      flash('error', e instanceof ApiError ? e.message : 'Impossible de changer l’état pour le moment.');
    } finally {
      setBusyFor(a.id, false);
    }
  };

  const duplicate = async (a: Automation) => {
    setBusyFor(a.id, true);
    try {
      const res = await igApi.duplicate(a.id);
      setAutomations((list) => [res.automation, ...list]);
      flash('success', `Copie créée : « ${res.automation.name} » (elle est en pause, vérifie-la puis active-la).`);
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'Impossible de dupliquer pour le moment.');
    } finally {
      setBusyFor(a.id, false);
    }
  };

  const remove = async (a: Automation) => {
    setBusyFor(a.id, true);
    try {
      await igApi.remove(a.id);
      setAutomations((list) => list.filter((x) => x.id !== a.id));
      setConfirmDelete(null);
      flash('success', `« ${a.name} » a été supprimée.`);
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'Impossible de supprimer pour le moment.');
    } finally {
      setBusyFor(a.id, false);
    }
  };

  const startFromTemplate = (id: string) => {
    const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setServerErrors([]);
    setDraft({ name: tpl.name, triggerType: tpl.triggerType, enabled: false, config: normalizeConfig(tpl.triggerType, tpl.config) });
    setView('edit');
  };

  const edit = (a: Automation) => {
    setServerErrors([]);
    setDraft({ id: a.id, name: a.name, triggerType: a.triggerType, enabled: a.enabled, config: a.config });
    setView('edit');
  };

  const save = async (d: Draft, activate: boolean) => {
    setSaving(true);
    setServerErrors([]);
    try {
      const input = { name: d.name, triggerType: d.triggerType, enabled: d.enabled, config: d.config };
      const res = d.id ? await igApi.update(d.id, input) : await igApi.create(input);
      setAutomations((list) => (d.id ? list.map((x) => (x.id === d.id ? res.automation : x)) : [res.automation, ...list]));
      setDraft(null);
      setView('list');
      const hasProblem = (diag?.checks || []).some((c) => c.status === 'error');
      if (res.automation.enabled && hasProblem) {
        flash('warn', `« ${res.automation.name} » est enregistrée et activée, mais un point est à régler en haut de la page pour qu’elle fonctionne vraiment.`);
      } else {
        flash('success', activate ? `« ${res.automation.name} » est activée : le robot travaille pour toi 🎉` : `« ${res.automation.name} » est enregistrée.`);
      }
    } catch (e) {
      const details = e instanceof ApiError ? e.details : null;
      setServerErrors(Array.isArray(details?.errors) && details.errors.length ? details.errors : [e instanceof ApiError ? e.message : 'Impossible d’enregistrer pour le moment.']);
      if (e instanceof ApiError && details?.setupRequired) {
        setSetupRequired(true);
        setView('list');
      }
    } finally {
      setSaving(false);
    }
  };

  const accountName = diag?.username || businessName || 'ton_compte';
  const activeCount = useMemo(() => automations.filter((a) => a.enabled).length, [automations]);

  // ── Écrans ────────────────────────────────────────────────────────────────
  if (view === 'edit' && draft) {
    return (
      <React.Fragment key={draft.id || 'nouveau'}>
        <AutomationEditor
          initial={draft}
          accountName={accountName}
          businessName={businessName}
          saving={saving}
          serverErrors={serverErrors}
          onSave={save}
          onCancel={() => { setView(draft.id ? 'list' : 'new'); setDraft(null); setServerErrors([]); }}
        />
      </React.Fragment>
    );
  }

  if (view === 'history') {
    return <HistoryPanel automations={automations} initialAutomationId={historyFor} onBack={() => { setView('list'); setHistoryFor(undefined); }} />;
  }

  const templateGrid = (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Modèles d’automatisation">
      {AUTOMATION_TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => startFromTemplate(tpl.id)}
          className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-purple-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <span className="text-2xl" aria-hidden>{tpl.emoji}</span>
          <span className="mt-2 block text-sm font-semibold text-slate-900">{tpl.title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">{tpl.description}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-purple-700 group-hover:underline">Utiliser ce modèle →</span>
        </button>
      ))}
    </div>
  );

  if (view === 'new') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView('list')} className={ghostBtn}>← Retour</button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Que veux-tu automatiser ?</h2>
            <p className="text-xs text-slate-500">Choisis un point de départ : tu pourras tout modifier ensuite.</p>
          </div>
        </div>
        {templateGrid}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-slate-900">Automatisations Instagram</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Réponds tout seul aux commentaires, envoie un message privé à ceux qui commentent « prix » ou « info », et réponds aux mots-clés dans tes messages — 24h/24.
              Pour tout le reste, ton assistant IA prend le relais.
            </p>
          </div>
          {!setupRequired && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setHistoryFor(undefined); setView('history'); }} className={secondaryBtn}>
                <History className="h-4 w-4" /> Historique
              </button>
              <button type="button" onClick={() => setView('new')} className={primaryBtn}>
                <Plus className="h-4 w-4" /> Nouvelle automatisation
              </button>
            </div>
          )}
        </div>
      </Card>

      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {setupRequired ? (
        <SetupBanner onRecheck={loadList} checking={loading} isAdmin={isAdmin} />
      ) : (
        <>
          <HealthPanel
            diag={diag}
            loading={diagLoading}
            error={diagError}
            repairing={repairing}
            repairMessage={repairMessage}
            onRefresh={loadHealth}
            onRepair={repair}
            onGoToInstagram={(why) => onGoToInstagram(why)}
          />

          {loadError && (
            <Notice kind="error">
              {loadError}{' '}
              <button type="button" onClick={loadList} className="font-semibold underline">Réessayer</button>
            </Notice>
          )}

          {loading && automations.length === 0 && !loadError ? (
            <Card className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de tes automatisations…</Card>
          ) : automations.length === 0 && !loadError ? (
            <Card className="space-y-4 p-5 sm:p-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Tu n’as pas encore d’automatisation</h3>
                <p className="mt-1 text-sm text-slate-500">Commence avec un modèle, c’est prêt en 2 minutes :</p>
              </div>
              {templateGrid}
            </Card>
          ) : (
            <>
              {automations.length > 0 && (
                <p className="text-xs text-slate-500" data-testid="automation-count">
                  {automations.length} automatisation{automations.length > 1 ? 's' : ''} · {activeCount} active{activeCount > 1 ? 's' : ''}
                </p>
              )}
              <ul className="space-y-3" aria-label="Tes automatisations">
                {automations.map((a) => (
                  <li key={a.id}>
                    <AutomationCard
                      a={a}
                      busy={Boolean(busy[a.id])}
                      confirmingDelete={confirmDelete === a.id}
                      onToggle={(v) => toggle(a, v)}
                      onEdit={() => edit(a)}
                      onHistory={() => { setHistoryFor(a.id); setView('history'); }}
                      onDuplicate={() => duplicate(a)}
                      onAskDelete={() => setConfirmDelete(a.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onDelete={() => remove(a)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          <details className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
            <summary className="cursor-pointer select-none font-medium text-slate-800">Bon à savoir (les règles d’Instagram)</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-500">
              <li>Instagram autorise <strong>un seul message privé par commentaire</strong>, et seulement dans les <strong>7 jours</strong> qui suivent.</li>
              <li>Si la personne ne te suit pas, ton message arrive dans ses « Demandes de messages » : elle doit l’accepter pour le lire.</li>
              <li>Les liens ne sont pas cliquables dans les commentaires : mets-les dans le message privé (bouton).</li>
              <li>Le prénom n’est connu que dans les messages privés. Sous un commentaire, utilise <strong>@pseudo</strong>.</li>
              <li>Ton compte doit être un compte professionnel (Business ou Créateur) et public.</li>
              <li>Quand une règle correspond, elle répond à la place de l’IA. Sinon, l’IA répond comme d’habitude.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
};

export default InstagramAutomations;
