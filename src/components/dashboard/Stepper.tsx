/**
 * Fil d'étapes simple et moderne, partagé par les « assistants pas à pas »
 * (mettre la bulle sur mon site, connecter Instagram, créer une automatisation).
 *
 *   ①──②──③     Sur téléphone : « Étape 2 sur 3 · Ton code » + une barre de progression.
 *
 * Une étape passée (✓) est cliquable ; on ne peut pas sauter vers une étape pas encore atteinte.
 */
import React from 'react';
import { Check } from 'lucide-react';

export interface StepDef {
  id: string;
  label: string;
}

export const Stepper: React.FC<{
  steps: StepDef[];
  /** Index de l'étape affichée (0 = première). */
  current: number;
  onSelect?: (index: number) => void;
  /** Dernière étape accessible (par défaut : l'étape affichée). */
  maxReachable?: number;
}> = ({ steps, current, onSelect, maxReachable }) => {
  const reach = Math.max(current, maxReachable ?? current);
  const pct = steps.length > 1 ? Math.round((current / (steps.length - 1)) * 100) : 100;
  return (
    <div data-testid="stepper">
      <ol aria-label="Étapes" className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= reach;
          return (
            <li key={s.id} className={`flex items-center gap-2 ${i < steps.length - 1 ? 'flex-1' : ''}`}>
              <button
                type="button"
                data-step={s.id}
                disabled={!reachable || active}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect?.(i)}
                className={`flex items-center gap-2 rounded-full py-1 pr-3 text-sm transition-colors ${reachable && !active ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    active
                      ? 'bg-gradient-to-br from-[#a23dff] to-[#5a2cff] text-white shadow-[0_8px_18px_-8px_rgba(110,50,255,0.7)]'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={active ? 'font-semibold text-slate-900' : done ? 'font-medium text-slate-700' : 'text-slate-400'}>{s.label}</span>
              </button>
              {i < steps.length - 1 && <span className={`h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </li>
          );
        })}
      </ol>

      {/* Téléphone : texte + barre */}
      <div className="sm:hidden">
        <p className="text-xs font-semibold text-slate-500">
          Étape {current + 1} sur {steps.length} · <span className="text-slate-900">{steps[current]?.label}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gradient-to-r from-[#a23dff] to-[#5a2cff] transition-all" style={{ width: `${Math.max(8, pct)}%` }} />
        </div>
      </div>
    </div>
  );
};
