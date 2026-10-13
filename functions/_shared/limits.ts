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

// 💸 PLAFOND DE COÛT RÉEL — DÉCISION DU 13/10/2026 : plus de plafond en
// dollars sur Basic et Pro. C'est le QUOTA DE CONVERSATIONS qui arrête tout
// (Basic : 500 conversations = 50 minutes d'appel OU 1 000 messages ;
// Pro : 1 500 conversations = 150 minutes OU 3 000 messages). Le client a
// donc TOUT son forfait, et jamais une pause au milieu à cause d'un montant.
// 0 = aucun plafond. Enterprise, qui n'a pas encore de quota chiffré (vendu
// « sur devis »), garde un fusible en attendant sa limite négociée.
export const COST_CAP_USD_PER_PLAN: Record<string, number> = {
  free: 0,        // bloqué par le quota à 0, pas par un montant
  basic: 0,       // aucun plafond : le quota décide
  pro: 0,         // aucun plafond : le quota décide
  enterprise: 30, // fusible temporaire, en attendant un quota « sur devis »
};
export const GEMINI_PRICE_IN_PER_MTOK = 0.25;  // $ / million tokens entrée
export const GEMINI_PRICE_OUT_PER_MTOK = 1.5;  // $ / million tokens sortie

/** La voix (Gemini Live) se facture à l'AUDIO : 3 $/M entrée, 12 $/M sortie. */
export const LIVE_PRICE_IN_PER_MTOK = 3;
export const LIVE_PRICE_OUT_PER_MTOK = 12;

/**
 * Coût d'un relevé, au bon tarif selon le modèle. Un appel vocal coûte ~10× le
 * tarif texte : sans cette distinction, le coût affiché au marchand (et le
 * fusible Enterprise) passait à côté des appels.
 */
export function costUsdFromTokensForModel(
  tokensIn: number,
  tokensOut: number,
  model?: string | null,
): number {
  const m = String(model || '').toLowerCase();
  if (m.includes('live')) {
    return (
      (Number(tokensIn || 0) * LIVE_PRICE_IN_PER_MTOK + Number(tokensOut || 0) * LIVE_PRICE_OUT_PER_MTOK) /
      1_000_000
    );
  }
  return costUsdFromTokens(tokensIn, tokensOut);
}

export function costUsdFromTokens(tokensIn: number, tokensOut: number): number {
  return (Number(tokensIn || 0) * GEMINI_PRICE_IN_PER_MTOK + Number(tokensOut || 0) * GEMINI_PRICE_OUT_PER_MTOK) / 1_000_000;
}

export function costCapReachedMsg(plan: string, cost: number, cap: number) {
  // Message 100 % humain : ni $, ni modèle, ni technique — le marchand ET ses
  // clients doivent comprendre d'un coup d'œil (le forfait est fini, ça reprend).
  return `Cet assistant a terminé son forfait pour ce mois-ci. 😊 Il reprend automatiquement le 1er du mois prochain — le propriétaire peut aussi l'activer davantage à tout moment depuis son tableau de bord JawebFlow.`;
}

/**
 * 🧮 TAILLE D'UNE CONVERSATION (décision du 14/10/2026) : **1 message du client
 * + sa réponse = 1 conversation** (2 messages). C'est la définition commerciale
 * retenue : le client compte ses échanges, pas nos appels à Gemini.
 *
 * Conséquence sur les compteurs : un message du client = 1 unité = 1
 * conversation (la réponse appartient au même échange).
 *
 * La voix garde son barème : 1 minute d'appel = 10 conversations = 10 unités.
 * Les deux canaux pèsent alors le même ordre de grandeur en argent — 10
 * conversations écrites coûtent 3,60 DA, la même minute d'appel 6,18 DA.
 */
export const UNITS_PER_CONVERSATION = 1;

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  free: 0,        // Plan Gratuit = zéro crédit IA (page Tarifs)
  basic: 500,     // « 500 conversations par mois » (1 000 messages)
  pro: 1500,      // « 1 500 conversations par mois » (3 000 messages)
  enterprise: null, // illimité
};

/** Coût RÉEL du mois d'un assistant : somme des tokens (vue) × tarif officiel. */
export async function supabaseGetMonthlyCostUsd(env: SupabaseEnv, assistantId: string): Promise<number> {
  if (!supabaseConfigured(env) || !assistantId) return 0;
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const res = await supabaseRequest(
      env,
      `assistant_monthly_usage?assistant_id=eq.${encodeURIComponent(assistantId)}&month=gte.${monthStart.toISOString()}&select=tokens_in,tokens_out`
    );
    const rows = res.ok ? (await res.json().catch(() => [])) as any[] : [];
    return costUsdFromTokens(Number(rows?.[0]?.tokens_in || 0), Number(rows?.[0]?.tokens_out || 0));
  } catch {
    return 0; // fail-open : ne jamais bloquer un client pour un pépin réseau
  }
}

/** Vérifie le plafond de coût réel du plan. exceeded=true => l'IA se met en pause. */
export async function monthlyCostBlock(
  env: SupabaseEnv,
  assistantId: string,
  plan: string
): Promise<{ exceeded: boolean; cost: number; cap: number; msg?: string }> {
  const cap = COST_CAP_USD_PER_PLAN[plan] ?? COST_CAP_USD_PER_PLAN.free;
  if (!cap) return { exceeded: false, cost: 0, cap };
  const cost = await supabaseGetMonthlyCostUsd(env, assistantId);
  if (cost >= cap) {
    return { exceeded: true, cost, cap, msg: costCapReachedMsg(plan, cost, cap) };
  }
  return { exceeded: false, cost, cap };
}

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
    // 🧮 COMPTEUR PONDÉRÉ : 1 conversation commerciale = UNITS_PER_CONVERSATION
    // unités (5), avec poids par message (photo = 4, recherche produits = +2,
    // message = 1). Les poids ne changent pas : seule la taille de la
    // conversation a été réduite, ce qui abaisse le coût du forfait.
    // Les unités du mois sont agrégées en base par la vue SQL
    // assistant_monthly_usage (voir supabase/migration_ai_usage.sql).
    const vRes = await supabaseRequest(
      env,
      `assistant_monthly_usage?assistant_id=eq.${encodeURIComponent(assistantId)}&month=eq.${encodeURIComponent(monthStartIso())}&select=units,messages`
    );
    if (vRes.ok) {
      const vRows = (await vRes.json().catch(() => [])) as any[];
      const units = Number(vRows?.[0]?.units || 0);
      return Math.ceil(units / UNITS_PER_CONVERSATION);
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
    if (!isNaN(total)) return Math.ceil(total / UNITS_PER_CONVERSATION);
    const rows = (await res.json()) as any[];
    return Math.ceil((Array.isArray(rows) ? rows.length : 0) / UNITS_PER_CONVERSATION);
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
