/**
 * JAWEBFLOW — DEMANDES DE CONTACT & DEVIS
 * ------------------------------------------------------------
 * POST /api/contact   (public — formulaire de la page Contact)
 *
 * Body : { name, company, email, phone, sector, message }
 *
 * Ce que fait cet endpoint (dans cet ordre) :
 *   1. il VALIDE la demande (sinon 400 : le bouton ne prétend jamais avoir envoyé) ;
 *   2. il envoie l'email à l'équipe via Brevo (`CONTACT_INBOX`, sinon
 *      `EMAIL_SENDER`) — la réponse contient « delivered.email » ;
 *   3. si l'email n'est pas configuré ou que Brevo refuse, il tente une
 *      sauvegarde de secours dans Supabase (`contact_requests`) ;
 *   4. si les deux échouent, il répond 503 : l'interface affiche alors le
 *      téléphone et l'email directs pour que le client ne reste pas sans issue.
 *
 * Variables d'environnement Cloudflare : BREVO_API_KEY, EMAIL_SENDER,
 * EMAIL_SENDER_NAME, CONTACT_INBOX (optionnel).
 */
import { supabaseRequest, supabaseConfigured } from '../_shared/supabase.ts';
import { sendEmail, emailConfigured } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestPost(context) {
  const env = context.env;
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Requête illisible.' }, 400);
  }

  const name = clean(body.name, 120);
  const company = clean(body.company, 160);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 40);
  const sector = clean(body.sector, 60) || 'autre';
  const message = clean(body.message, 4000);

  if (!name || !company || !email || !phone) {
    return json({ ok: false, error: 'Nom, entreprise, email et téléphone sont obligatoires.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ ok: false, error: 'Adresse email invalide.' }, 400);
  }
  if (phone.replace(/\D/g, '').length < 8) {
    return json({ ok: false, error: 'Numéro de téléphone invalide.' }, 400);
  }

  const receivedAt = new Date().toISOString();
  const record = { name, company, email, phone, sector, message, source: 'site_contact', received_at: receivedAt };

  // 1) Sauvegarde de secours : la demande ne doit jamais se perdre, même si l'email échoue.
  let stored = false;
  if (supabaseConfigured(env)) {
    try {
      const res = await supabaseRequest(env, 'contact_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(record),
      });
      stored = res.ok;
      if (!res.ok) console.warn('[contact] sauvegarde Supabase refusée:', res.status);
    } catch (err) {
      console.warn('[contact] sauvegarde Supabase impossible:', err?.message || err);
    }
  }

  // 2) Email à l'équipe (c'est ce qui déclenche une réponse commerciale réelle).
  let emailed = false;
  if (emailConfigured(env)) {
    const inbox = clean(env.CONTACT_INBOX, 160) || clean(env.EMAIL_SENDER, 160);
    const html = `
      <div style="font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1b1647;line-height:1.7">
        <h2 style="margin:0 0 6px">Nouvelle demande depuis le site</h2>
        <p style="margin:0 0 16px;color:#64648a">Reçue le ${escapeHtml(receivedAt)}</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Nom</td><td><strong>${escapeHtml(name)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Entreprise</td><td><strong>${escapeHtml(company)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Email</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Téléphone</td><td>${escapeHtml(phone)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64648a">Secteur</td><td>${escapeHtml(sector)}</td></tr>
        </table>
        <p style="margin:18px 0 6px;color:#64648a">Message</p>
        <div style="padding:12px 14px;background:#f4f2fb;border-radius:12px;white-space:pre-wrap">${escapeHtml(message) || '(aucun message)'}</div>
      </div>`;
    emailed = await sendEmail(env, inbox, `Contact site — ${company} (${name})`, html);
  }

  if (!emailed && !stored) {
    console.error('[contact] demande NON délivrée (email non configuré et sauvegarde KO)');
    return json({
      ok: false,
      error: 'Envoi indisponible pour le moment. Écrivez-nous directement à contact@jawebflow.dz ou par téléphone.',
      fallback: { email: 'contact@jawebflow.dz', phone: '+213 550 00 00 00' },
    }, 503);
  }

  return json({ ok: true, delivered: { email: emailed, stored } });
}
