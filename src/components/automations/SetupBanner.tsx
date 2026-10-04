/**
 * « Une dernière étape » : tant que la mise à jour de la base de données n'a pas
 * été faite (une seule fois, 30 secondes), on guide le marchand pas à pas.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import migrationSql from '../../../supabase/migration_ig_automations.sql?raw';
import { Card, primaryBtn, secondaryBtn } from './ui';

/** https://xxxx.supabase.co → https://supabase.com/dashboard/project/xxxx/sql/new */
export function supabaseSqlEditorUrl(): string {
  const runtimeEnv: Record<string, string> = (typeof window !== 'undefined' && (window as any).__JAWEBFLOW_ENV__) || {};
  const url = String(import.meta.env.VITE_SUPABASE_URL || runtimeEnv.VITE_SUPABASE_URL || '');
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i.exec(url)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard';
}

export function SetupBanner({ onRecheck, checking, isAdmin }: { onRecheck: () => void; checking: boolean; isAdmin: boolean }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  // Un client de JawebFlow n'a pas accès à la base de données de la plateforme : la mise à jour est faite par l'équipe.
  if (!isAdmin) {
    return (
      <Card className="border-amber-300 bg-amber-50/60 p-6">
        <h2 className="text-base font-semibold text-slate-900">Les automatisations sont en cours d’activation</h2>
        <p className="mt-1 text-sm text-slate-600">
          L’équipe JawebFlow termine une dernière mise à jour technique de la plateforme. Reviens dans quelques minutes : tu n’as rien à faire de ton côté.
        </p>
        <button type="button" onClick={onRecheck} disabled={checking} className={`${secondaryBtn} mt-4`}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Réessayer
        </button>
      </Card>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(migrationSql);
      setCopied(true);
    } catch {
      // Navigateur sans accès au presse-papiers : on sélectionne le texte, le marchand fait Ctrl+C.
      const box = document.getElementById('ig-setup-sql') as HTMLTextAreaElement | null;
      box?.focus();
      box?.select();
      try { document.execCommand('copy'); setCopied(true); } catch { /* sélection manuelle */ }
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Card className="border-amber-300 bg-amber-50/60 p-6">
      <h2 className="text-base font-semibold text-slate-900">Une dernière étape avant de commencer (30 secondes, une seule fois)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pour garder la liste de tes automatisations et leur historique, ta base de données a besoin d’une petite mise à jour. Tu copies, tu colles, c’est fini.
      </p>

      <ol className="mt-5 space-y-4 text-sm text-slate-800">
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">1</span>
          <div className="space-y-2">
            <p>Copie le petit programme de mise à jour.</p>
            <button type="button" onClick={copy} className={primaryBtn}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? 'Copié ✓' : 'Copier la mise à jour'}
            </button>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">2</span>
          <div className="space-y-2">
            <p>Ouvre ta base de données (Supabase) : une page avec une grande zone blanche s’ouvre.</p>
            <a href={supabaseSqlEditorUrl()} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
              <ExternalLink className="h-4 w-4" /> Ouvrir Supabase
            </a>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">3</span>
          <p className="pt-0.5">Colle (Ctrl+V) dans la zone blanche, puis clique sur le bouton vert <strong>Run</strong>. Tu dois voir « Success ».</p>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">4</span>
          <div className="space-y-2">
            <p>Reviens ici et clique :</p>
            <button type="button" onClick={onRecheck} disabled={checking} className={secondaryBtn}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} C’est fait, vérifier
            </button>
          </div>
        </li>
      </ol>

      <details className="mt-5 text-xs text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600">Voir ce que contient la mise à jour (pour les curieux)</summary>
        <textarea
          id="ig-setup-sql"
          readOnly
          value={migrationSql}
          rows={10}
          aria-label="Contenu de la mise à jour"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-[11px] text-slate-700"
        />
      </details>
    </Card>
  );
}
