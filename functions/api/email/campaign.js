/**
 * JAWEBFLOW — CAMPAGNES EMAIL 100 % VIASOCKET (TON Gmail) — AUCUN BREVO
 * ------------------------------------------------------------
 * Deux rôles :
 *
 *  A) CONSOLE ADMIN — POST /api/email/campaign (Authorization: Bearer <jeton ADMIN>)
 *     Body : { action: 'preview' | 'prepare' | 'cancel', subject, html,
 *              audience: 'test' | 'all' | 'paid', testEmail? }
 *     - preview : compte les destinataires + 8 exemples (rien n'est mémorisé)
 *     - prepare : valide puis MÉMORISE la campagne (platform_settings,
 *       clé settings.pendingCampaign). Rien n'est envoyé par le serveur.
 *     - cancel  : efface la campagne préparée (désarmement manuel)
 *
 *  B) FLUX VIASOCKET — GET/POST /api/email/campaign?token=CRON_SECRET&mode=json
 *     Renvoie la campagne préparée + les destinataires :
 *       { ok, campaign:{subject,audience}, count, recipients:[{email,name,subject,html}] }
 *     puis DÉSARME la campagne immédiatement (envoi unique — jamais 2 fois).
 *     C'est le flux ViaSocket qui envoie chaque email avec TON Gmail
 *     (boucle : recipients -> Gmail to={{email}} subject={{subject}} body={{html}}).
 *
 * Anti-spam intégré : JAMAIS d'envoi aux prospects (gens sans compte),
 * uniquement les titulaires de comptes JawebFlow (admins exclus).
 * Pied de désabonnement « STOP » ajouté automatiquement.
 * Plafond 400 destinataires par campagne (Gmail gratuit ≈ 500/jour).
 */

import { verifySupabaseIdToken, supabaseRequest, supabaseConfigured } from '../../_shared/supabase.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const MAX_RECIPIENTS = 400; // Gmail gratuit : ~500 envois/jour — marge de sécurité

const UNSUB_FOOTER = `
<div style="margin-top:26px;padding-top:14px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center">
Vous recevez cet email en tant que client de la plateforme JawebFlow.<br>
Pour ne plus recevoir de communications, répondez simplement « STOP » à cet email.
</div>`;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}

/* ── Mémoire de la campagne préparée (platform_settings.settings.pendingCampaign) ── */

async function loadSettings(env) {
  const res = await supabaseRequest(env, 'platform_settings?id=eq.global&select=settings');
  if (!res.ok) return {};
  const rows = await res.json().catch(() => []);
  return (rows && rows[0] && rows[0].settings) || {};
}

async function saveSettings(env, settings) {
  const res = await supabaseRequest(env, 'platform_settings?id=eq.global', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ settings }),
  });
  return res.ok;
}

/* ── Destinataires : uniquement des COMPTES EXISTANTS (jamais les prospects), admins exclus ── */

async function buildRecipients(env, audience, testEmail) {
  if (audience === 'test') {
    const to = String(testEmail || '').trim().toLowerCase();
    return to.includes('@') ? [{ email: to, name: 'Test admin' }] : [];
  }
  let path = 'users?role=not.in.(admin,superadmin)&select=email,display_name';
  if (audience === 'paid') path += '&plan=in.(basic,pro,enterprise)';
  const res = await supabaseRequest(env, path);
  const rows = res.ok ? await res.json() : [];
  const seen = new Set();
  return (rows || [])
    .map(r => ({ email: String(r?.email || '').trim().toLowerCase(), name: String(r?.display_name || '').trim() }))
    .filter(r => r.email.includes('@') && !seen.has(r.email) && seen.add(r.email));
}

/* ── B) FLUX VIASOCKET : ?token=CRON_SECRET&mode=json ── */

async function handleCron(context) {
  const env = context.env;
  const url = new URL(context.request.url);
  const token = url.searchParams.get('token') || (context.request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ ok: false, error: 'token invalide' }, 401);
  if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

  try {
    const settings = await loadSettings(env);
    const draft = settings.pendingCampaign;
    if (!draft || !draft.subject || !draft.html) {
      return json({ ok: true, count: 0, message: 'aucune campagne préparée — rien à envoyer' });
    }

    const recipients = await buildRecipients(env, draft.audience === 'test' ? 'test' : draft.audience, draft.testEmail);
    const list = recipients.slice(0, MAX_RECIPIENTS);

    // DÉSARMEMENT IMMÉDIAT : même si ViaSocket relance le flux, la campagne
    // ne peut partir DEUX FOIS (sécurité anti double-envoi).
    const cleared = { ...settings };
    delete cleared.pendingCampaign;
    await saveSettings(env, cleared);

    const fullHtml = draft.html + UNSUB_FOOTER;
    console.log(`[campagne] servie à ViaSocket : « ${draft.subject} » -> ${list.length} destinataire(s) (${draft.audience})`);
    return json({
      ok: true,
      campaign: { subject: draft.subject, audience: draft.audience, preparedAt: draft.preparedAt || null },
      count: list.length,
      recipients: list.map(r => ({ email: r.email, name: r.name, subject: draft.subject, html: fullHtml })),
    });
  } catch (e) {
    console.error('[campagne][viasocket] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}

export async function onRequestGet(context) {
  return handleCron(context);
}

export async function onRequestPost(context) {
  // ViaSocket appelle TOUJOURS avec ?token=...&mode=json (URL prête à coller).
  // La console admin, elle, n'utilise JAMAIS de token dans l'URL (Bearer admin).
  if (new URL(context.request.url).searchParams.get('token')) return handleCron(context);

  const env = context.env;
  try {
    if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

    // 1. Admin uniquement (rôle vérifié en base, jamais confiance au client)
    const authUser = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!authUser?.uid) return json({ ok: false, error: 'non authentifié' }, 401);
    const uRes = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(authUser.uid)}&select=role,email`);
    const uRows = uRes.ok ? await uRes.json() : [];
    const role = uRows?.[0]?.role;
    const adminEmail = String(uRows?.[0]?.email || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') return json({ ok: false, error: "réservé à l'admin" }, 403);

    // 2. Paramètres
    const body = await context.request.json().catch(() => ({}));
    const action = String(body?.action || (body?.preview === true ? 'preview' : 'prepare'));
    const subject = String(body?.subject || '').trim().slice(0, 150);
    const html = String(body?.html || '').trim().slice(0, 40000);
    const audience = ['test', 'all', 'paid'].includes(String(body?.audience)) ? String(body?.audience) : 'all';
    const testEmail = String(body?.testEmail || (audience === 'test' ? adminEmail : '')).trim().toLowerCase();

    // Annulation (désarmement manuel)
    if (action === 'cancel') {
      const settings = await loadSettings(env);
      delete settings.pendingCampaign;
      const ok = await saveSettings(env, settings);
      return json(ok ? { ok: true, cancelled: true } : { ok: false, error: 'annulation impossible' }, ok ? 200 : 500);
    }

    if (!subject || !html) return json({ ok: false, error: 'sujet et message obligatoires' }, 400);

    // 3. Destinataires (comptes existants uniquement — jamais les prospects)
    const recipients = await buildRecipients(env, audience, testEmail);
    if (!recipients.length) return json({ ok: false, error: 'aucun destinataire pour cette audience' }, 400);
    if (recipients.length > MAX_RECIPIENTS) {
      return json({ ok: false, error: `trop de destinataires (${recipients.length}) : le plafond Gmail est ${MAX_RECIPIENTS} par campagne` }, 400);
    }

    // Aperçu : combien + exemples (rien n'est mémorisé)
    if (action === 'preview') {
      return json({
        ok: true,
        preview: true,
        count: recipients.length,
        sample: recipients.slice(0, 8).map(r => (r.name ? `${r.email} (${r.name})` : r.email)),
      });
    }

    // Préparation : on MÉMORISE la campagne — ViaSocket fera l'envoi avec ton Gmail
    const settings = await loadSettings(env);
    settings.pendingCampaign = { subject, html, audience, testEmail: audience === 'test' ? testEmail : undefined, count: recipients.length, preparedAt: new Date().toISOString() };
    const ok = await saveSettings(env, settings);
    if (!ok) return json({ ok: false, error: 'mémorisation impossible' }, 500);

    console.log(`[campagne] armée : « ${subject} » -> ${recipients.length} destinataire(s) (${audience})`);
    return json({
      ok: true,
      prepared: true,
      count: recipients.length,
      audience,
      next: audience === 'test'
        ? "Test armé sur ton email. Ouvre ViaSocket -> flux Campagne -> clique Test : l'email part de TON Gmail. La campagne se désarme après l'envoi."
        : `Campagne armée pour ${recipients.length} client(s). Lance ton flux ViaSocket Campagne : les emails partent de TON Gmail, puis la campagne se désarme (jamais 2 fois).`,
    });
  } catch (e) {
    console.error('[campagne] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
