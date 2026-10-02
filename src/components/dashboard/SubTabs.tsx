/**
 * Petits onglets en pastille, pour les écrans regroupés
 * (Mon assistant : Informations / Mon site / Comportement…, Canaux : Mon site / Instagram / Automatisations).
 */
import React from 'react';

export interface SubTab<T extends string = string> {
  id: T;
  label: string;
}

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<SubTab<T>>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Sous-sections" className="mb-6 flex flex-wrap gap-2" data-testid="sub-tabs">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={t.id}
            onClick={() => onChange(t.id)}
            className={`rounded-full px-4 py-2 text-sm transition-colors cursor-pointer ${
              on
                ? 'bg-white font-semibold text-[#5a2cff] shadow-[0_6px_18px_-10px_rgba(90,44,255,0.55)]'
                : 'font-normal text-slate-500 hover:bg-white/70 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
