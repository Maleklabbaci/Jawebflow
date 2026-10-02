/**
 * JAWEBFLOW — « Parler à mon IA » : compteur de messages par jour et par marchand.
 *
 * Protège contre les abus (l'IA coûte à chaque message) et permet de suivre la consommation.
 * Table `copilot_usage` (voir supabase/migration_ig_automations.sql, section 6). FACULTATIF :
 * si la table n'existe pas encore, on n'applique que la limite « par tranche de 10 minutes »
 * (en mémoire) et le chat fonctionne normalement.
 */
import { supabaseRequest } from './supabase.ts';
import { isMissingTable } from './ig-http.ts';

export const DEFAULT_DAILY_MAX = 150;

export interface Usage {
  messages: number;
  tokensIn: number;
  tokensOut: number;
}

export const dayKey = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export function dailyMax(env: any): number {
  const n = Math.floor(Number(env?.COPILOT_DAILY_MAX));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_MAX;
}

/** Consommation du jour, ou `null` si le compteur n'est pas disponible (table absente / erreur). */
export async function readUsage(env: any, uid: string, day: string): Promise<Usage | null> {
  try {
    const res = await supabaseRequest(env, `copilot_usage?user_id=eq.${encodeURIComponent(uid)}&day=eq.${day}&select=messages,tokens_in,tokens_out`);
    if (!res.ok) {
      if (!isMissingTable(res.status, await res.text())) console.error('[copilot] lecture du compteur refusée:', res.status);
      return null;
    }
    const row = ((await res.json()) as any[])[0];
    return { messages: Number(row?.messages) || 0, tokensIn: Number(row?.tokens_in) || 0, tokensOut: Number(row?.tokens_out) || 0 };
  } catch (e: any) {
    console.error('[copilot] lecture du compteur impossible:', e?.message || e);
    return null;
  }
}

/** Ajoute ce message au compteur du jour (jamais bloquant : une erreur est seulement journalisée). */
export async function addUsage(env: any, uid: string, day: string, current: Usage, delta: Usage): Promise<void> {
  try {
    const res = await supabaseRequest(env, 'copilot_usage?on_conflict=user_id,day', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: uid,
        day,
        messages: current.messages + delta.messages,
        tokens_in: current.tokensIn + delta.tokensIn,
        tokens_out: current.tokensOut + delta.tokensOut,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) console.error('[copilot] écriture du compteur refusée:', res.status);
  } catch (e: any) {
    console.error('[copilot] écriture du compteur impossible:', e?.message || e);
  }
}
