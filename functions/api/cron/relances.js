/**
 * JAWEBFLOW — CRON : RELANCES AUTOMATIQUES (1 h / 24 h)
 * ------------------------------------------------------------
 * GET/POST /api/cron/relances?token=CRON_SECRET
 *
 * À appeler toutes les ~10 minutes par un planificateur externe (cron-job.org,
 * ViaSocket, n8n…). Parcourt les connexions Instagram, trouve les clients dont
 * une relance planifiée (1 h / 24 h après une demande validée) est arrivée à
 * échéance, envoie le message de relance en DM, puis la marque envoyée.
 *
 * Seules les discussions Instagram sont relancées (le widget web n'a pas de
 * canal sortant). Voir functions/_shared/relances.ts pour la fenêtre Meta 24 h.
 */

import { supabaseRequest, supabaseConfigured, listAllProspects, supabaseUpsertProspect } from '../../_shared/supabase.ts';
import { dueRelances, relanceText } from '../../_shared/relances.ts';
import { sendMessage } from '../../_shared/ig-api.ts';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

async function handle(context) {
  const env = context.env;
  const url = new URL(context.request.url);
  const token = url.searchParams.get('token') || (context.request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ ok: false, error: 'token invalide' }, 401);
  if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

  const now = new Date();
  // Toutes les connexions Instagram ayant un assistant + un jeton.
  const intRes = await supabaseRequest(env, 'instagram_integrations?select=assistant_id,access_token,instagram_user_id&limit=200');
  if (!intRes.ok) return json({ ok: false, error: 'lecture instagram_integrations impossible' }, 500);
  const integrations = (await intRes.json()) || [];

  let sent = 0;
  let failed = 0;
  const details = [];

  for (const integration of integrations) {
    const assistantId = integration?.assistant_id;
    const igToken = integration?.access_token;
    if (!assistantId || !igToken) continue;

    const prospects = await listAllProspects(env, assistantId);
    for (const prospect of prospects) {
      const psid = prospect.igUserId;
      if (prospect.channel !== 'instagram' || !psid) continue;
      const due = dueRelances(prospect.relances, now);
      if (!due.length) continue;

      const updatedRelances = (prospect.relances || []).map((r) => {
        const isDue = due.some((d) => d.id === r.id);
        return isDue ? { ...r, sent: true, sentAt: now.toISOString() } : r;
      });

      for (const relance of due) {
        try {
          const result = await sendMessage(igToken, 'me', { recipientId: psid }, { text: relanceText(relance) });
          if (result.ok) {
            sent += 1;
            details.push({ prospect: prospect.id, relance: relance.id, ok: true });
          } else {
            // Fenêtre 24 h dépassée ou refus Meta : on marque envoyée pour ne
            // pas réessayer en boucle, mais on le trace.
            failed += 1;
            details.push({ prospect: prospect.id, relance: relance.id, ok: false, error: result.error?.message || 'refus' });
          }
        } catch (error) {
          failed += 1;
          details.push({ prospect: prospect.id, relance: relance.id, ok: false, error: String(error?.message || error) });
        }
      }

      try {
        await supabaseUpsertProspect(env, prospect.id, assistantId, { relances: updatedRelances });
      } catch (error) {
        console.warn('[relances] fiche non mise à jour:', error?.message || error);
      }
    }
  }

  return json({ ok: true, sent, failed, details: details.slice(0, 100) });
}

export async function onRequestGet(context) { return handle(context); }
export async function onRequestPost(context) { return handle(context); }
