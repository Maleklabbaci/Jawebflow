/**
 * JAWEBFLOW — CRON : RÉSUMÉS QUOTIDIENS PAR EMAIL (RÉELS)
 * ------------------------------------------------------------
 * GET/POST /api/cron/summaries?token=CRON_SECRET
 *
 * Appelé UNE FOIS PAR JOUR (21h) par un planificateur externe gratuit
 * (cron-job.org). Parcourt TOUS les clients, calcule les stats des 24
 * dernières heures de chaque assistant, et envoie le résumé par email
 * (Brevo) — uniquement aux clients qui ont eu de l'activité (pas de spam).
 *
 * Configuration Cloudflare : BREVO_API_KEY, EMAIL_SENDER, EMAIL_SENDER_NAME,
 * CRON_SECRET (un mot de passe long, pour que personne d'autre ne déclenche).
 */

import { supabaseRequest, supabaseConfigured } from '../../_shared/supabase.ts';
import { sendEmail, emailConfigured } from '../../_shared/email.ts';
import { collectClientStats, buildDigestHtml } from '../../_shared/digest.ts';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

async function handle(context) {
  const env = context.env;
  const url = new URL(context.request.url);
  const token = url.searchParams.get('token') || (context.request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ ok: false, error: 'token invalide' }, 401);
  }
  if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);
  // TOUS les clients, page par page (500 par page — scale jusqu'à plusieurs
  // milliers sans changer une ligne ; garde-fou à 5000 par passage).
  const users = [];
  {
    const PAGE = 500;
    let offset = 0;
    let firstPageFailed = false;
    while (true) {
      const uRes = await supabaseRequest(env, `users?select=id,email,display_name&order=created_at.desc&limit=${PAGE}&offset=${offset}`);
      if (!uRes.ok) { if (offset === 0) firstPageFailed = true; break; }
      const rows = await uRes.json();
      users.push(...(rows || []));
      if (!rows || rows.length < PAGE || offset + PAGE >= 5000) break;
      offset += PAGE;
    }
    if (firstPageFailed) return json({ ok: false, error: 'lecture users impossible' }, 500);
  }

  // MODE JSON (pour ViaSocket, Make, n8n...) : ?mode=json
  // => on ne fait qu'iterator : l'outil d'automatisation envoie les emails
  //    lui-même avec sa propre boîte (Gmail, SMTP...). Aucun Brevo requis.
  if (url.searchParams.get('mode') === 'json') {
    const clients = [];
    for (const user of users || []) {
      if (!user?.email) continue;
      try {
        const aRes = await supabaseRequest(env, `assistants?user_id=eq.${encodeURIComponent(user.id)}&select=id`);
        const assistants = aRes.ok ? await aRes.json() : [];
        const ids = (assistants || []).map((a) => a.id);
        if (!ids.length) continue;
        const stats = await collectClientStats(env, ids);
        if (stats.conversations === 0 && stats.prospects === 0) continue; // pas d'activité = pas d'email
        clients.push({
          email: user.email,
          name: user.display_name || '',
          subject: `📊 Votre assistant aujourd'hui : ${stats.conversations} conversation(s), ${stats.prospects} contact(s)`,
          conversations: stats.conversations,
          prospects: stats.prospects,
          openQuestions: stats.openQuestions,
          html: buildDigestHtml(user.display_name, stats),
        });
      } catch { /* on continue avec les suivants */ }
    }
    return json({ ok: true, mode: 'json', count: clients.length, clients });
  }
  if (!emailConfigured(env)) return json({ ok: false, error: 'email non configuré (BREVO_API_KEY / EMAIL_SENDER)' }, 500);


  let sent = 0, skipped = 0, failed = 0;
  for (const user of users || []) {
    if (!user?.email) { skipped++; continue; }
    try {
      const aRes = await supabaseRequest(env, `assistants?user_id=eq.${encodeURIComponent(user.id)}&select=id`);
      const assistants = aRes.ok ? await aRes.json() : [];
      const ids = (assistants || []).map((a) => a.id);
      if (!ids.length) { skipped++; continue; }

      const stats = await collectClientStats(env, ids);
      // Pas d'activité = pas d'email (zéro spam, zéro gaspillage du quota)
      if (stats.conversations === 0 && stats.prospects === 0) { skipped++; continue; }

      const html = buildDigestHtml(user.display_name, stats);
      const ok = await sendEmail(env, user.email, `📊 Votre assistant aujourd'hui : ${stats.conversations} conversation(s), ${stats.prospects} contact(s)`, html);
      if (ok) sent++; else failed++;
    } catch {
      failed++;
    }
  }

  console.log(`[cron] résumés quotidiens : ${sent} envoyé(s), ${skipped} ignoré(s), ${failed} échec(s)`);
  return json({ ok: true, sent, skipped, failed });
}

export async function onRequestGet(context) { return handle(context); }
export async function onRequestPost(context) { return handle(context); }
