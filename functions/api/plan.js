/**
 * JAWEBFLOW — ENREGISTREMENT DU PLAN PAYÉ (CHECKOUT)
 * ------------------------------------------------------------
 * POST /api/plan   { plan: "free" | "basic" | "pro" | "enterprise" }
 * Auth : jeton Supabase du client (Authorization: Bearer <access_token>).
 *
 * Le paiement fait foi sur TOUTE la fiche du client, pas seulement sur
 * l'assistant actif : on met à jour users.plan ET tous les assistants du
 * client (merge du jsonb config). Ainsi ses futurs assistants naîtront
 * directement avec le plan payé.
 */

import { verifySupabaseIdToken, supabaseRequest, supabaseConfigured } from '../_shared/supabase.ts';

const VALID_PLANS = new Set(['free', 'basic', 'pro', 'enterprise']);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: cors });

  try {
    const { plan } = await context.request.json();
    const env = context.env;

    if (!VALID_PLANS.has(plan)) return json({ ok: false, error: 'plan invalide' }, 400);
    if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

    const authUser = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!authUser?.uid) return json({ ok: false, error: 'non authentifié' }, 401);

    // 1. Fiche client : users.plan (repris par défaut par ses futurs assistants)
    await supabaseRequest(
      env,
      `users?id=eq.${encodeURIComponent(authUser.uid)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ plan, updated_at: new Date().toISOString() }),
      }
    );

    // 2. Tous ses assistants existants (lecture -> fusion -> écriture)
    let updated = 0;
    const res = await supabaseRequest(
      env,
      `assistants?user_id=eq.${encodeURIComponent(authUser.uid)}&select=id,config`
    );
    if (res.ok) {
      const rows = await res.json();
      for (const row of rows || []) {
        const patch = await supabaseRequest(
          env,
          `assistants?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              config: { ...(row.config || {}), plan },
              updated_at: new Date().toISOString(),
            }),
          }
        );
        if (patch.ok) updated += 1;
      }
    }

    console.log(`[plan] ${authUser.uid} -> ${plan} (${updated} assistant(s) mis à jour)`);
    return json({ ok: true, plan, updated });
  } catch (e) {
    console.error('[plan] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
