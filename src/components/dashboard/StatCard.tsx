/**
 * Carte de chiffre de l'espace client (même style que le reste de la plateforme) :
 * petite icône violette, libellé, GROS nombre, puis une ligne grise et une pastille facultative.
 */
import React from 'react';

export interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  /** Ligne grise sous le nombre. */
  hint?: string;
  /** Pastille colorée (ex. « ✓ Actif »). */
  badge?: { text: string; tone: 'good' | 'warn' | 'neutral' };
}

const TONES: Record<NonNullable<StatCardProps['badge']>['tone'], string> = {
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-600',
  neutral: 'bg-slate-100 text-slate-500',
};

export const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, hint, badge }) => (
  <div className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(27,22,71,0.04)]" data-testid="stat-card">
    <Icon className="h-6 w-6 text-purple-600" />
    <p className="mt-4 text-[15px] text-slate-600">{label}</p>
    <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[#1b1647]">{value}</p>
    {(hint || badge) && (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-slate-400">
        {hint && <span>{hint}</span>}
        {badge && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[badge.tone]}`}>{badge.text}</span>}
      </div>
    )}
  </div>
);
