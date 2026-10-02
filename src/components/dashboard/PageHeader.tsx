/**
 * En-tête de page unique pour tout l'espace client :
 * titre en GRAS, sous-titre en LÉGER. À utiliser en haut de chaque écran.
 */
import React from 'react';

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="dash-title text-2xl">{title}</h2>
      {subtitle && <p className="dash-subtitle mt-1 max-w-2xl text-[15px]">{subtitle}</p>}
    </div>
    {action}
  </div>
);
