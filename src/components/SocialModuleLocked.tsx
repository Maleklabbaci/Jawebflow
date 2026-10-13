/**
 * JAWEBFLOW — « RÉSEAUX SOCIAUX » : LA PAGE FERMÉE (côté marchand)
 * ============================================================================
 * Le chatbot du site web et les réseaux sociaux sont deux espaces séparés. Tant
 * que l'équipe n'a pas ouvert le second sur le compte, le marchand N'ENTRE PAS :
 *
 *   • pas de tour du module, pas de réglages, pas de formulaire de branchement ;
 *   • un cadenas et « Prochainement », rien d'autre, aucune action possible.
 *
 * C'est le visage commercial d'un verrou appliqué AUSSI par le serveur (403) :
 * appeler l'API directement ne l'ouvre pas davantage.
 */

import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  /** L'écran que le marchand essayait d'ouvrir — sert seulement au message. */
  channel?: string;
}

export const SocialModuleLocked: React.FC<Props> = () => (
  <div className="animate-in fade-in duration-200" data-testid="social-locked">
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm sm:px-10">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500">
        <Lock className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Prochainement</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
        Les réseaux sociaux arrivent sur votre compte. Vous n’avez rien à installer : dès que
        l’accès est ouvert, tout apparaît ici.
      </p>
    </div>
  </div>
);

export default SocialModuleLocked;
