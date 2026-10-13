/**
 * JAWEBFLOW — DEMANDE D'ACTIVATION DU MODULE RÉSEAUX SOCIAUX
 * ============================================================================
 * POST /api/channels/request-access
 *
 * Le marchand clique sur « Demander l'activation » depuis son tableau de bord
 * (espace « Réseaux sociaux », qui affiche un cadenas). Cette fonction :
 *
 *   1. vérifie le jeton du marchand (on veut savoir QUI demande) ;
 *   2. limite les envois (3 par jour et par compte) — un bouton ne doit pas
 *      pouvoir inonder la boîte de réception ;
 *   3. garde une trace dans `social_requests` (une demande ne se perd pas,
 *      même si l'e-mail n'est pas configuré) ;
 *   4. prévient l'équipe par e-mail à `contact@jawebflow.dz`.
 *
 * Réponse : `{ ok: true, emailed: true|false, stored: true|false }`.
 * Si ni l'e-mail ni la trace n'ont pu être écrits, on le dit au marchand au
 * lieu de lui afficher un faux « c'est envoyé ».
 */

import {
  supabaseRequest,
  supabaseConfigured,
  verifySupabaseIdToken,
} from '../../_shared/supabase.ts';
import { sendEmail, emailConfigured } from '../../_shared/email.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';

/** L'adresse de l'équipe : surchargeable par CONTACT_INBOX en production. */
const TEAM_INBOX = 'contact@jawebflow.dz';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export async function onRequestPost(context: any) {
  const env = context.env || {};

  const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
  if (!caller) return json({ error: 'Authentification requise' }, 401);

  if (rateLimited(`social-request:${caller.uid}`, { max: 3, windowMs: 24 * 60 * 60 * 1000 })) {
    return json({ error: 'Demande déjà envoyée aujourd’hui. Nous vous répondons très vite.' }, 429);
  }

  const body = await context.request.json().catch(() => ({} as any));
  const askedMessage = clean(body?.message, 1000);

  // Fiche du client : sert à l'équipe pour ouvrir le module SANS avoir à
  // chercher qui est qui (nom, entreprise, formule actuelle).
  let profile: { plan?: string; company?: string; name?: string } = {};
  if (supabaseConfigured(env)) {
    try {
      const res = await supabaseRequest(
        env,
        `users?id=eq.${encodeURIComponent(caller.uid)}&select=plan,company_name,display_name&limit=1`,
      );
      if (res.ok) {
        const rows = (await res.json()) as any[];
        const row = rows?.[0] || {};
        profile = {
          plan: clean(row.plan, 40) || 'free',
          company: clean(row.company_name, 160),
          name: clean(row.display_name, 120),
        };
      }
    } catch (err: any) {
      console.warn('[social-request] fiche client illisible:', err?.message || err);
    }
  }

  const email = clean(caller.email, 160);
  const label = profile.company || profile.name || email || caller.uid;
  const receivedAt = new Date().toISOString();

  // 1) La trace : la demande ne doit jamais se perdre.
  let stored = false;
  if (supabaseConfigured(env)) {
    try {
      const res = await supabaseRequest(env, 'social_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: caller.uid,
          email,
          company: profile.company || profile.name || null,
          message: askedMessage || 'Demande d’activation du module Réseaux sociaux.',
          status: 'pending',
          created_at: receivedAt,
        }),
      });
      stored = res.ok;
      if (!res.ok) console.warn('[social-request] trace non enregistrée:', res.status);
    } catch (err: any) {
      console.warn('[social-request] trace impossible:', err?.message || err);
    }
  }

  // 2) L'e-mail : c'est lui qui déclenche l'activation.
  let emailed = false;
  if (emailConfigured(env)) {
    const inbox = clean(env.CONTACT_INBOX, 160) || clean(env.EMAIL_SENDER, 160) || TEAM_INBOX;
    const html = `
      <div style="font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1b1647;line-height:1.7">
        <h2 style="margin:0 0 6px">🔒 Demande d'activation — module Réseaux sociaux</h2>
        <p style="margin:0 0 16px;color:#64648a">Reçue le ${escapeHtml(receivedAt)}</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Client</td><td><strong>${escapeHtml(label)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">E-mail</td><td>${escapeHtml(email) || '—'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Formule</td><td>${escapeHtml(profile.plan || 'free')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Compte</td><td><code>${escapeHtml(caller.uid)}</code></td></tr>
        </table>
        <p style="margin:18px 0 6px;color:#64648a">Message du client</p>
        <div style="padding:12px 14px;background:#f4f2fb;border-radius:12px;white-space:pre-wrap">${escapeHtml(askedMessage) || '(aucun message)'}</div>
        <p style="margin:18px 0 0;color:#64648a;font-size:13px">
          Pour ouvrir le module : console admin → onglet <strong>Clients</strong> → bouton
          « 🔒 Réseaux sociaux » de sa ligne. (Ou en SQL :
          <code>update public.users set social_enabled = true where id = '${escapeHtml(caller.uid)}';</code>)
        </p>
      </div>`;
    try {
      emailed = await sendEmail(env, inbox, `Demande Réseaux sociaux — ${label}`, html);
    } catch (err: any) {
      console.warn('[social-request] email impossible:', err?.message || err);
    }
  }

  if (!emailed && !stored) {
    console.error('[social-request] demande NON délivrée (email non configuré et trace KO)');
    return json(
      {
        error:
          "Envoi impossible pour le moment. Écrivez-nous directement à contact@jawebflow.dz — nous ouvrons votre module.",
        fallback: { email: TEAM_INBOX },
      },
      502,
    );
  }

  return json({ ok: true, emailed, stored });
}
