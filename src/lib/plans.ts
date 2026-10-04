/**
 * JAWEBFLOW — CE QUE CHAQUE FORFAIT DONNE VRAIMENT
 * ------------------------------------------------------------------
 * ⚠️ SOURCE DE VÉRITÉ CÔTÉ CLIENT. Ces chiffres sont ceux appliqués par le
 * moteur (voir `functions/_shared/limits.ts`) :
 *
 *   • `conversations`  → `DEFAULT_PLAN_LIMITS`   (plafond mensuel par assistant)
 *       le compteur est en UNITÉS : message simple = 1 · recherche produit +2 ·
 *       photo +4 · 1 « conversation » = 8 unités.
 *   • `scans`          → `SCAN_LIMITS_PER_MONTH`  (imports/analyses de site / mois)
 *   • `costCapUsd`     → `COST_CAP_USD_PER_PLAN`  (garde-fou interne : au-delà,
 *       l'assistant se met en pause et reprend le 1er du mois suivant).
 *
 * Un test (`tests/pricing-truth.test.tsx`) compare ces valeurs à celles du
 * moteur : si quelqu'un change une limite d'un seul côté, le test échoue.
 * La page Tarifs et l'écran « Abonnement » du tableau de bord lisent CE fichier,
 * donc ils ne peuvent plus promettre autre chose que ce qui est facturé.
 */

export type PlanId = 'free' | 'basic' | 'pro' | 'enterprise';

export interface PlanTruth {
  /** Conversations incluses par mois (null = sans quota). */
  conversations: number | null;
  /** Imports / analyses de votre site par mois. */
  scans: number;
  /** Garde-fou de coût réel du mois (en dollars), jamais facturé au client. */
  costCapUsd: number;
  /** Réponses automatiques de l'IA activées ? */
  aiReplies: boolean;
  /** Coordonnées des clients intéressés enregistrées automatiquement ? */
  capturesLeads: boolean;
  /** Connexion Instagram (réponses dans les DM) ? */
  instagram: boolean;
}

export const PLAN_TRUTH: Record<PlanId, PlanTruth> = {
  free: { conversations: 0, scans: 0, costCapUsd: 0, aiReplies: false, capturesLeads: false, instagram: true },
  basic: { conversations: 1000, scans: 3, costCapUsd: 3, aiReplies: true, capturesLeads: true, instagram: true },
  pro: { conversations: 5000, scans: 6, costCapUsd: 9, aiReplies: true, capturesLeads: true, instagram: true },
  enterprise: { conversations: null, scans: 12, costCapUsd: 30, aiReplies: true, capturesLeads: true, instagram: true },
};

/** Nombre de conversations du mois, écrit à la française (« 1 000 »). */
export function conversationsLabel(plan: PlanId): string {
  const value = PLAN_TRUTH[plan].conversations;
  return value === null ? 'Sans quota de conversations' : value.toLocaleString('fr-FR');
}

/** Comment le compteur fonctionne réellement (affiché sous les tarifs). */
export const QUOTA_EXPLAINER =
  'Une réponse simple compte 1 unité, une recherche de produit dans votre catalogue en compte 3 et une photo envoyée par le client en compte 5. Une « conversation » équivaut à 8 unités : votre quota couvre donc en pratique plusieurs milliers de réponses.';
