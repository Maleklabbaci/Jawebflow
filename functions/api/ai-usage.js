/**
 * JAWEBFLOW — 💸 COÛT IA CE MOIS (console admin)
 * GET /api/ai-usage   (Authorization: Bearer <jeton ADMIN>)
 * Agrège les tokens réellement consommés (usageMetadata Gemini, colonnes
 * tokens_in/tokens_out de conversation_contexts) par assistant, et estime
 * le coût au tarif officiel gemini-3.1-flash-lite (0.25 $/M in · 1.50 $/M out).
 */
import { verifySupabaseIdToken, supabaseRequest } from '../_shared/supabase.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

const PRICE_IN = 0.25, PRICE_OUT = 1.5; // $ / 1M tokens — flash-lite
const CONV_DIVIDER = 8; // 1 conversation commerciale = 8 unités (photo=4, recherche=+2, msg=1)

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}

export async function onRequestGet(context) {
  const env = context.env;
  try {
    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) return json({ ok: false, error: 'non authentifié' }, 401);
    const uRes = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(caller.uid)}&select=role`);
    const role = uRes.ok ? ((await uRes.json().catch(() => [])) || [])[0]?.role : null;
    if (role !== 'admin' && role !== 'superadmin') return json({ ok: false, error: "réservé à l'admin" }, 403);

    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);

    const rRes = await supabaseRequest(env, `conversation_contexts?created_at=gte.${monthStart.toISOString()}&select=assistant_id,tokens_in,tokens_out,weight&order=created_at.desc&limit=5000`);
    const rows = rRes.ok ? await rRes.json().catch(() => []) : [];

    const nRes = await supabaseRequest(env, 'assistants?select=id,business_name&limit=500');
    const names = {};
    for (const a of (nRes.ok ? await nRes.json().catch(() => []) : [])) names[a.id] = a.business_name || a.id;

    const per = {};
    for (const r of rows || []) {
      const k = r.assistant_id || '?';
      per[k] = per[k] || { assistantId: k, name: names[k] || k, messages: 0, tokensIn: 0, tokensOut: 0 };
      per[k].messages++;
      per[k].units = (per[k].units || 0) + Number(r.weight || 1);
      per[k].tokensIn += Number(r.tokens_in || 0);
      per[k].tokensOut += Number(r.tokens_out || 0);
    }
    const list = Object.values(per).map(p => ({
      ...p,
      conversations: Math.ceil((p.units || 0) / CONV_DIVIDER),
      costUsd: +(p.tokensIn / 1e6 * PRICE_IN + p.tokensOut / 1e6 * PRICE_OUT).toFixed(4),
      name: String(p.name).slice(0, 40),
    })).sort((a, b) => b.costUsd - a.costUsd);

    const totals = list.reduce((t, p) => ({
      messages: t.messages + p.messages,
      conversations: t.conversations + p.conversations,
      tokensIn: t.tokensIn + p.tokensIn,
      tokensOut: t.tokensOut + p.tokensOut,
      costUsd: +(t.costUsd + p.costUsd).toFixed(4),
    }), { messages: 0, conversations: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });

    return json({ ok: true, month: monthStart.toISOString().slice(0, 7), rows: list.slice(0, 50), totals, note: 'coût estimé au tarif flash-lite ; les messages sans tokens mesurés (avant ce déploiement) ne sont pas comptés' });
  } catch (e) {
    return json({ ok: false, error: e?.message || 'erreur serveur' }, 500);
  }
}
