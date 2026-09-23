/**
 * JAWEBFLOW — LIMITES DE CONVERSATIONS PAR PLAN
 * ------------------------------------------------
 * Chaque plan inclut un quota MENSUEL de conversations IA (aligné sur la page
 * Tarifs : Basic 1 000 / Pro 5 000 / Enterprise illimité / Gratuit 0 crédit).
 * Le compteur est la table `conversation_contexts` (une ligne par échange IA),
 * écrite en arrière-plan après chaque réponse réussie.
 *
 * Les quotas sont surchargeables depuis la Console Admin (table
 * `platform_settings`, clé 'global', jsonb settings.planLimits) :
 *   { "free": 0, "basic": 1000, "pro": 5000, "enterprise": null }
 * `null` = illimité.
 */

import { supabaseRequest, supabaseConfigured, SupabaseEnv } from './supabase.ts';

export interface PlanLimits {
  free: number | null;
  basic: number | null;
  pro: number | null;
  enterprise: number | null;
  [plan: string]: number | null;
}

// 🏗️ LIMITES DÉDIÉES scans/imports de fichiers (par MOIS, par assistant).
// Le commerçant reçoit un quota propre : fini les abus de re-scans.
export const SCAN_LIMITS_PER_MONTH: Record<string, number> = {
  free: 0,     // interdit (zéro IA)
  basic: 3,    // 3 scans/imports / mois (décision du propriétaire)
  pro: 6,
  enterprise: 12,
};

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  free: 0,        // Plan Gratuit = zéro crédit IA (page Tarifs)
  basic: 1000,    // « Jusqu’à 1 000 conversations par mois »
  pro: 5000,      // « Jusqu’à 5 000 conversations par mois »
  enterprise: null, // illimité
};

export async function supabaseGetPlanLimits(env: SupabaseEnv): Promise<PlanLimits> {
  if (!supabaseConfigured(env)) return DEFAULT_PLAN_LIMITS;
  try {
    const res = await supabaseRequest(env, `platform_settings?id=eq.global&select=settings`);
    if (!res.ok) return DEFAULT_PLAN_LIMITS;
    const rows = (await res.json()) as any[];
    const custom = rows?.[0]?.settings?.planLimits;
    return custom ? { ...DEFAULT_PLAN_LIMITS, ...custom } : DEFAULT_PLAN_LIMITS;
  } catch {
    return DEFAULT_PLAN_LIMITS;
  }
}

export function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Nombre de conversations IA déjà consommées ce mois-ci par un assistant. */
export async function supabaseCountMonthlyConversations(env: SupabaseEnv, assistantId: string): Promise<number> {
  try {
    // 🧮 COMPTEUR PONDÉRÉ : 1 conversation commerciale = 8 unités, avec
    // poids par message (photo = 4, recherche produits = +2, message = 1).
    // Les unités du mois sont agrégées en base par la vue SQL
    // assistant_monthly_usage (voir supabase/migration_ai_usage.sql).
    const vRes = await supabaseRequest(
      env,
      `assistant_monthly_usage?assistant_id=eq.${encodeURIComponent(assistantId)}&month=eq.${encodeURIComponent(monthStartIso())}&select=units,messages`
    );
    if (vRes.ok) {
      const vRows = (await vRes.json().catch(() => [])) as any[];
      const units = Number(vRows?.[0]?.units || 0);
      return Math.ceil(units / 8);
    }
    // Repli si la vue n'existe pas encore : ancien comptage (1 ligne = 1 unité).
    const res = await supabaseRequest(
      env,
      `conversation_contexts?assistant_id=eq.${encodeURIComponent(assistantId)}&created_at=gte.${monthStartIso()}&select=id`,
      { headers: { Prefer: 'count=exact' } }
    );
    if (!res.ok) return 0; // en cas de pépin on ne bloque PAS le client (fail-open)
    const range = res.headers.get('content-range') || '';
    const total = parseInt(range.split('/')[1] || '', 10);
    if (!isNaN(total)) return Math.ceil(total / 8);
    const rows = (await res.json()) as any[];
    return Math.ceil((Array.isArray(rows) ? rows.length : 0) / 8);
  } catch {
    return 0;
  }
}

/** Trace une conversation IA (compteur de quota) — appelé en waitUntil. */
export async function supabaseLogConversation(
  env: SupabaseEnv,
  entry: { assistantId: string; channel: string; sessionId?: string; message: string; response: string; tokensIn?: number; tokensOut?: number; model?: string; weight?: number }
): Promise<void> {
  try {
    await supabaseRequest(env, 'conversation_contexts', {
      method: 'POST',
      body: JSON.stringify({
        assistant_id: entry.assistantId,
        channel: entry.channel,
        session_id: entry.sessionId || 'default_session',
        user_message: (entry.message || '').slice(0, 2000),
        assistant_response: (entry.response || '').slice(0, 4000),
        created_at: new Date().toISOString(),
        weight: entry.weight || 1,
        ...(entry.tokensIn ? { tokens_in: entry.tokensIn } : {}),
        ...(entry.tokensOut ? { tokens_out: entry.tokensOut } : {}),
        ...(entry.model ? { model: entry.model } : {}),
      }),
      headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    console.error('[limits] log conversation échoué:', (e as Error)?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Messages de blocage affichés au visiteur (renvoyés tels quels par /api/chat)
// ---------------------------------------------------------------------------

export const LIMIT_BLOCK_FREE =
  "Saha ! 😊 Cet assistant n'est pas encore activé : le propriétaire du site doit activer un plan IA (Basic, Pro ou Enterprise) pour débloquer les réponses automatiques. — Propulsé par JawebFlow";

export function limitBlockReached(plan: string, limit: number) {
  return `Merci pour votre message ! 🙏 La limite mensuelle de conversations de l'assistant (${limit.toLocaleString('fr-FR')} / mois — plan ${plan.toUpperCase()}) est atteinte. Le propriétaire peut augmenter son forfait à tout moment depuis son tableau de bord JawebFlow.`;
}
