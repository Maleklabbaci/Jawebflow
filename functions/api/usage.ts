/**
 * JAWEBFLOW — USAGE & STATS DU CLIENT (tableau de bord client)
 * ------------------------------------------------------------
 * GET /api/usage   (Authorization: Bearer <jeton Supabase du client>)
 *
 * Retourne tout ce dont le client a besoin pour SE voir :
 *   - plan actif + limite de conversations du mois + consommation réelle ;
 *   - jours restants avant renouvellement (dernière facture payée + 30 j) ;
 *   - stats simples : prospects captés, questions en attente d'apprentissage.
 * Tout est calculé côté serveur (RLS : conversation_contexts est privé).
 */

import { verifySupabaseIdToken, supabaseRequest, supabaseConfigured } from '../_shared/supabase.ts';
import { supabaseGetPlanLimits, monthStartIso, DEFAULT_PLAN_LIMITS, COST_CAP_USD_PER_PLAN, costUsdFromTokens } from '../_shared/limits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestGet(context: any) {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: cors });

  try {
    const env = context.env;
    if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

    const authUser = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!authUser?.uid) return json({ ok: false, error: 'non authentifié' }, 401);
    const uid = authUser.uid;

    // Plan du client (fiche users.plan) et réglages des quotas
    const [uRes, limits] = await Promise.all([
      supabaseRequest(env, `users?id=eq.${encodeURIComponent(uid)}&select=plan,created_at`).then(r => r.ok ? r.json() : []),
      supabaseGetPlanLimits(env),
    ]);
    const userRow = Array.isArray(uRes) ? uRes[0] : null;
    const plan = String(userRow?.plan || 'basic').toLowerCase();
    const limit = plan in limits ? limits[plan] : limits.free ?? 0;

    // Ses assistants
    const aRes = await supabaseRequest(env, `assistants?user_id=eq.${encodeURIComponent(uid)}&select=id`);
    const assistants = aRes.ok ? await aRes.json() : [];
    const ids: string[] = (assistants || []).map((a: any) => a.id);

    // Consommation du mois (tous ses assistants confondus)
    let conversationsThisMonth = 0;
    if (ids.length) {
      const filter = ids.map(i => `assistant_id.eq.${encodeURIComponent(i)}`).join(',');
      const res = await supabaseRequest(
        env,
        `conversation_contexts?or=(${filter})&created_at=gte.${monthStartIso()}&select=id`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (res.ok) {
        const range = res.headers.get('content-range') || '';
        const total = parseInt(range.split('/')[1] || '', 10);
        conversationsThisMonth = isNaN(total) ? ((await res.json()) as any[]).length : total;
      }
    }

    // Prospects captés + questions en attente (apprentissage)
    let prospects = 0;
    let openQuestions = 0;
    if (ids.length) {
      const pFilter = ids.map(i => `assistant_id.eq.${encodeURIComponent(i)}`).join(',');
      const pRes = await supabaseRequest(
        env,
        `prospects?or=(${pFilter})&select=id`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (pRes.ok) {
        const range = pRes.headers.get('content-range') || '';
        const total = parseInt(range.split('/')[1] || '', 10);
        prospects = isNaN(total) ? ((await pRes.json()) as any[]).length : total;
      }
      const qFilter = ids.map(i => `assistant_id.eq.${encodeURIComponent(i)}`).join(',');
      const qRes = await supabaseRequest(
        env,
        `learning_questions?or=(${qFilter})&status=eq.open&select=id`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (qRes.ok) {
        const range = qRes.headers.get('content-range') || '';
        const total = parseInt(range.split('/')[1] || '', 10);
        openQuestions = isNaN(total) ? ((await qRes.json()) as any[]).length : total;
      }
    }

    // Renouvellement : dernière facture PAYÉE du client -> cycle de 30 jours
    let daysLeft: number | null = null;
    let lastPaidDate: string | null = null;
    if (authUser.email) {
      const iRes = await supabaseRequest(
        env,
        `invoices?customerEmail=eq.${encodeURIComponent(authUser.email)}&status=eq.paid&select=*&order=createdAt.desc&limit=1`
      );
      if (iRes.ok) {
        const rows = await iRes.json();
        const paid = rows?.[0];
        if (paid) {
          lastPaidDate = paid.createdAt || paid.date || null;
          if (lastPaidDate) {
            const start = new Date(lastPaidDate).getTime();
            if (!isNaN(start)) {
              daysLeft = Math.max(0, 30 - Math.floor((Date.now() - start) / 86400000));
            }
          }
        }
      }
    }

    // 💸 Coût IA RÉEL du mois (Vrais tokens × tarif officiel Gemini)
    let costUsd = 0;
    if (ids.length) {
      const filter = ids.map(i => `assistant_id.eq.${encodeURIComponent(i)}`).join(',');
      const tRes = await supabaseRequest(
        env,
        `conversation_contexts?or=(${filter})&created_at=gte.${monthStartIso()}&select=tokens_in,tokens_out&limit=5000`
      );
      if (tRes.ok) {
        for (const r of (await tRes.json().catch(() => [])) as any[]) {
          costUsd += costUsdFromTokens(Number(r.tokens_in || 0), Number(r.tokens_out || 0));
        }
      }
    }
    const costCap = COST_CAP_USD_PER_PLAN[plan] ?? 0;

    return json({
      ok: true,
      plan,
      limit,
      used: conversationsThisMonth,
      costUsd: Math.round(costUsd * 10000) / 10000,
      costCap,
      prospects,
      openQuestions,
      daysLeft,
      lastPaidDate,
      assistantCount: ids.length,
    });
  } catch (e: any) {
    console.error('[usage] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
