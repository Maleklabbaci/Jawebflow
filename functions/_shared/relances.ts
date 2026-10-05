/**
 * JAWEBFLOW — RELANCES AUTOMATIQUES (1 h / 24 h)
 * ------------------------------------------------------------
 * Quand un client VALIDE une action (commande, visite, rendez-vous,
 * réservation, devis), on planifie deux relances automatiques : une à +1 h et
 * une à +24 h. Elles sont stockées sur la fiche du client (`relances`) et
 * envoyées par la tâche planifiée `functions/api/cron/relances.js`.
 *
 * Seules les discussions Instagram peuvent être relancées de façon proactive
 * (le widget web n'a pas de canal sortant une fois le visiteur parti).
 *
 * ⚠️ Fenêtre Meta : Instagram n'autorise un message sortant que dans les 24 h
 * suivant le dernier message du client. La relance « 1 h » passe toujours ; la
 * « 24 h » est à la limite de la fenêtre et peut être refusée par Meta — on la
 * tente quand même et on la marque envoyée pour ne pas boucler.
 */

import { dealKindLabel, dealKindOf, type DealKind } from './sales-intent.ts';

export type Relance = {
  /** '1h' | '24h' */
  id: string;
  kind: DealKind;
  /** ISO : moment prévu d'envoi. */
  at: string;
  sent: boolean;
  /** ISO : moment d'envoi réel (si envoyée). */
  sentAt?: string;
};

const HOUR = 60 * 60 * 1000;

/** Planifie les deux relances d'une demande validée. */
export function buildRelances(now: Date, kind: unknown): Relance[] {
  const base = now.getTime();
  // Accepte soit une demande complète ({ kind }), soit la nature seule ('visit'…).
  const k = dealKindOf(typeof kind === 'object' && kind !== null ? kind : { kind });
  return [
    { id: '1h', kind: k, at: new Date(base + HOUR).toISOString(), sent: false },
    { id: '24h', kind: k, at: new Date(base + 24 * HOUR).toISOString(), sent: false },
  ];
}

/** Relances non envoyées et dont l'échéance est arrivée. */
export function dueRelances(relances: unknown, now: Date): Relance[] {
  if (!Array.isArray(relances)) return [];
  return relances.filter(
    (r): r is Relance =>
      Boolean(r) && !r.sent && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)) && Date.parse(r.at) <= now.getTime(),
  );
}

/** Le mot juste pour parler de la demande dans la relance. */
function kindWord(kind: DealKind): string {
  return dealKindLabel(kind).toLowerCase();
}

/** Texte de relance, selon l'échéance et la nature de la demande. */
export function relanceText(relance: Relance): string {
  const word = kindWord(relance.kind);
  if (relance.id === '1h') {
    return `Bonjour 😊 Je reviens vers vous au sujet de votre ${word}. Avez-vous encore une question ? L'équipe vous confirme le tout très vite.`;
  }
  return `Bonjour 🙂 Petit point sur votre ${word} : l'équipe finalise la confirmation. Souhaitez-vous que je leur transmette un message, ou avez-vous une question ?`;
}
