/**
 * JAWEBFLOW — SLICKPAY : CRÉATION D'UN PAIEMENT (CHECKOUT)
 * ------------------------------------------------------------
 * POST /api/slickpay  { plan, billingCycle, cardType?, name?, phone? }
 * Auth : jeton Supabase du client (Authorization: Bearer <access_token>).
 *
 * Le montant est calculé CÔTÉ SERVEUR (jamais depuis le navigateur), un
 * paiement SlickPay est créé chez notre marchand, et une facture `pending`
 * est enregistrée dans Supabase (id = INV-<idSlickPay>).
 * Réponse : { ok, url } — `url` = page de paiement SATIM (CIB / EDAHABIA)
 * où le client est redirigé.
 *
 * Conf : variable d'environnement Cloudflare SLICKPAY_API_KEY (clé publique
 * du dashboard slick-pay.com, en Bearer). Optionnel : SLICKPAY_BASE_URL
 * (défaut = production ; https://devapi.slick-pay.com/api/v2 pour tester en sandbox).
 * Optionnel : SLICKPAY_ACCOUNT_ID = sous-compte marchand dédié à JawebFlow.
 */

import { verifySupabaseIdToken, supabaseRequest, supabaseConfigured } from '../_shared/supabase.ts';

// Tarifs officiels DZD (source de vérité serveur — alignés sur la page Tarifs)
const PLAN_AMOUNTS_DZD = { basic: 6850, pro: 18700, enterprise: 47100 };
const PLAN_AMOUNTS_USD = { basic: 29, pro: 79, enterprise: 199 };
const PLAN_LABELS = { basic: 'Basic', pro: 'Pro / Business', enterprise: 'Enterprise' };

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
    const env = context.env;
    const apiKey = env.SLICKPAY_API_KEY;
    const base = (env.SLICKPAY_BASE_URL || env.SLICKPAY_API_BASE || 'https://prodapi.slick-pay.com/api/v2').replace(/\/+$/, '');

    const body = await context.request.json();
    const plan = String(body?.plan || '').toLowerCase();
    const billingCycle = body?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const cardType = String(body?.cardType || 'cib').toUpperCase();

    if (!(plan in PLAN_AMOUNTS_DZD)) return json({ ok: false, error: 'plan invalide' }, 400);
    if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);

    const authUser = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!authUser?.uid) return json({ ok: false, error: 'non authentifié' }, 401);

    // Clé SlickPay absente => le frontend retombe sur le mode manuel
    // (validation directe par l'admin), la plateforme continue de marcher.
    if (!apiKey) return json({ ok: false, mode: 'manual', error: 'SLICKPAY_API_KEY non configurée' });

    // 1. Montant officiel (annuel = mensuel x12 avec -20%, arrondi à 10 DA)
    const monthly = PLAN_AMOUNTS_DZD[plan];
    const amountDzd = billingCycle === 'yearly' ? Math.round((monthly * 9.6) / 10) * 10 : monthly;

    // 2. Création du paiement chez SlickPay (serveur -> serveur)
    const nameParts = String(body?.name || '').trim().split(/\s+/).filter(Boolean);
    const payload = {
      amount: amountDzd,
      email: authUser.email || undefined,
      firstname: nameParts[0] || 'Client',
      lastname: nameParts.slice(1).join(' ') || 'JawebFlow',
    };
    if (body?.phone) payload.phone = String(body.phone);
    // Compte marchand dédié (optionnel) : si tu partages ta clé SlickPay avec
    // un autre SaaS, SLICKPAY_ACCOUNT_ID route les paiements JawebFlow vers le
    // bon sous-compte (paramètre `account` de l'API SlickPay).
    if (env.SLICKPAY_ACCOUNT_ID) payload.account = env.SLICKPAY_ACCOUNT_ID;

    const spRes = await fetch(`${base}/users/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const sp = await spRes.json().catch(() => null);
    if (!spRes.ok || !sp?.success || !sp?.url) {
      console.error('[slickpay] création refusée:', spRes.status, JSON.stringify(sp).slice(0, 300));
      return json({ ok: false, error: sp?.message || 'paiement SlickPay indisponible' }, 502);
    }

    // 3. Facture `pending` dans Supabase — l'id encode l'id SlickPay, ce qui
    //    permet au webhook de retrouver tout sans colonne supplémentaire.
    const transferId = String(sp.id || '');
    const invoiceId = `INV-${transferId}`;
    await supabaseRequest(env, 'invoices', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: invoiceId,
        customerEmail: authUser.email || '',
        customerName: String(body?.name || '') || null,
        planName: PLAN_LABELS[plan],
        amountDzd,
        amountUsd: billingCycle === 'yearly' ? Math.round(PLAN_AMOUNTS_USD[plan] * 0.8 * 12) : PLAN_AMOUNTS_USD[plan],
        paymentMethod: `SlickPay (${cardType})`,
        status: 'pending',
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        validatedByAdmin: false,
      }),
    });

    console.log(`[slickpay] paiement créé ${invoiceId} : ${amountDzd} DA (${plan}/${billingCycle}) pour ${authUser.email}`);
    return json({ ok: true, url: sp.url, invoiceId, amountDzd });
  } catch (e) {
    console.error('[slickpay] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
