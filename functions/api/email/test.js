/**
 * JAWEBFLOW — EMAIL DE TEST (client)
 * ------------------------------------------------------------
 * POST /api/email/test   (Authorization: Bearer <jeton Supabase>)
 *
 * Envoie TOUT DE SUITE au client connecté un exemple de son résumé
 * quotidien, avec ses VRAIES stats des dernières 24 h. Sert à vérifier
 * que les emails arrivent (boîte + spams) et à montrer la valeur.
 */

import { verifySupabaseIdToken, supabaseRequest, supabaseConfigured } from '../../_shared/supabase.ts';
import { sendEmail, emailConfigured } from '../../_shared/email.ts';
import { collectClientStats, buildDigestHtml } from '../../_shared/digest.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}

export async function onRequestPost(context) {
  const env = context.env;
  if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);
  if (!emailConfigured(env)) return json({ ok: false, error: 'email non configuré (l\'admin doit ajouter BREVO_API_KEY)' }, 500);

  const authUser = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
  if (!authUser?.uid || !authUser.email) return json({ ok: false, error: 'non authentifié' }, 401);

  const aRes = await supabaseRequest(env, `assistants?user_id=eq.${encodeURIComponent(authUser.uid)}&select=id`);
  const assistants = aRes.ok ? await aRes.json() : [];
  const stats = await collectClientStats(env, (assistants || []).map((a) => a.id));

  const uRes = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(authUser.uid)}&select=display_name`);
  const uRows = uRes.ok ? await uRes.json() : [];
  const displayName = uRows?.[0]?.display_name || authUser.email.split('@')[0];

  const ok = await sendEmail(
    env,
    authUser.email,
    `📊 (Exemple) Votre résumé JawebFlow : ${stats.conversations} conversation(s), ${stats.prospects} contact(s)`,
    buildDigestHtml(displayName, stats, true)
  );
  return ok ? json({ ok: true }) : json({ ok: false, error: 'envoi impossible — réessaie plus tard' }, 502);
}
