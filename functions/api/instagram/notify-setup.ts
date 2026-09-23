/**
 * JAWEBFLOW — Activation des alertes Instagram (le compte JawebFlow notifie).
 * GET  /api/instagram/notify-setup                                → { enabled, handle }
 * POST { assistantId }                                            → { code, link } (à envoyer en DM au compte JawebFlow)
 * POST admin { action:'register', handle, token, igUserId }        → enregistre le compte JawebFlow (une fois, par l'équipe)
 */
import { verifySupabaseIdToken, supabaseRequest } from '../../_shared/supabase.ts';
import { createActivationCode, getNotifyConfig, isMerchantLinked, registerNotifyAccount } from '../../_shared/merchant-notify.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}

export async function onRequestGet(context: any) {
  try {
    const me = await verifySupabaseIdToken(context.env, context.request.headers.get('Authorization'));
    if (!me?.uid) return json({ ok: false, error: 'non authentifié' }, 401);
    const [cfg, linked] = await Promise.all([getNotifyConfig(context.env), isMerchantLinked(context.env, me.uid)]);
    return json({ ok: true, enabled: linked, handle: cfg.handle || null });
  } catch {
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env;
    const me = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!me?.uid) return json({ ok: false, error: 'non authentifié' }, 401);
    const body = await context.request.json().catch(() => ({}));

    // Enregistrement du compte JawebFlow (une fois, réservé à l'équipe)
    if (body?.action === 'register') {
      const r = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(me.uid)}&select=role`);
      const role = r.ok ? ((await r.json().catch(() => [])) || [])[0]?.role : null;
      if (role !== 'admin' && role !== 'superadmin') return json({ ok: false, error: "réservé à l'équipe JawebFlow" }, 403);
      if (!body.handle || !body.token || !body.igUserId) return json({ ok: false, error: 'handle, token et igUserId requis' }, 400);
      await registerNotifyAccount(env, String(body.handle), String(body.token), String(body.igUserId));
      return json({ ok: true, registered: true });
    }

    const aid = String(body?.assistantId || '');
    if (!aid) return json({ ok: false, error: 'assistantId requis' }, 400);
    const a = await supabaseRequest(env, `assistants?id=eq.${encodeURIComponent(aid)}&select=user_id`);
    const owner = a.ok ? ((await a.json().catch(() => [])) || [])[0]?.user_id : null;
    if (owner !== me.uid) return json({ ok: false, error: 'accès refusé' }, 403);
    const { code, link } = await createActivationCode(env, me.uid, aid);
    if (!link) return json({ ok: false, error: "Le compte Instagram JawebFlow n'est pas encore configuré — contacte le support." }, 501);
    return json({ ok: true, code, link });
  } catch {
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
