/**
 * JAWEBFLOW — SLICKPAY : WEBHOOK DE CONFIRMATION (VÉRIFICATION SERVEUR)
 * ------------------------------------------------------------
 * POST /api/webhooks/slickpay  { invoiceId }   (invoiceId = "INV-<idSlickPay>")
 *
 * La doc SlickPay recommande explicitement une vérification CÔTÉ SERVEUR du
 * statut du paiement avant de livrer (ici : activer le plan). Cet endpoint
 * joue ce rôle :
 *   1. relit NOTRE facture (montant/plan = source de vérité, jamais la requête) ;
 *   2. interroge SlickPay serveur->serveur : paiement `completed` ?
 *   3. si payé : facture -> 'paid', users.plan -> plan, TOUS les assistants
 *      du client basculent sur le plan (futurs compris via users.plan).
 *
 * Idempotent : re-vérifier une facture déjà payée ne change rien.
 * Sécurité : un transfert inconnu ou non payé ne déclenche JAMAIS d'activation.
 */

import { supabaseRequest, supabaseConfigured } from '../../_shared/supabase.ts';

const PLAN_BY_LABEL = {
  basic: 'basic',
  pro: 'pro',
  'pro / business': 'pro',
  enterprise: 'enterprise',
  entreprise: 'enterprise',
};

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
      'Access-Control-Allow-Headers': 'Content-Type',
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

    if (!supabaseConfigured(env) || !apiKey) {
      return json({ ok: false, error: 'service non configuré' }, 500);
    }

    const { invoiceId } = await context.request.json();
    if (!invoiceId || !String(invoiceId).startsWith('INV-')) {
      return json({ ok: false, error: 'invoiceId invalide' }, 400);
    }
    const transferId = String(invoiceId).slice(4);

    // 1. Notre facture d'abord (montant/plan : jamais ceux de la requête)
    const invRes = await supabaseRequest(
      env,
      `invoices?id=eq.${encodeURIComponent(String(invoiceId))}&select=*`
    );
    if (!invRes.ok) return json({ ok: false, error: 'facture illisible' }, 500);
    const invRows = await invRes.json();
    const invoice = invRows?.[0];
    if (!invoice) return json({ ok: false, error: 'facture inconnue' }, 404);

    const planId = PLAN_BY_LABEL[String(invoice.planName || '').toLowerCase()] || 'basic';

    if (invoice.status === 'paid') {
      return json({ ok: true, paid: true, already: true, plan: planId, invoiceId });
    }

    // 2. Statut réel chez SlickPay (serveur -> serveur, avec NOTRE clé)
    const spRes = await fetch(
      `${base}/users/transfers/${encodeURIComponent(transferId)}`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } }
    );
    if (!spRes.ok) {
      console.error('[slickpay][webhook] details refusés:', spRes.status);
      return json({ ok: false, error: 'vérification SlickPay impossible' }, 502);
    }
    const sp = await spRes.json().catch(() => null);
    let details = sp?.data;
    if (typeof details === 'string') { try { details = JSON.parse(details); } catch { /* reste brut */ } }
    const status = String(details?.status || '').toLowerCase();
    const completed = sp?.completed === 1 || sp?.completed === true ||
      status === 'success' || status === 'completed' || status === 'paid' || status === 'accomplie';

    if (!completed) {
      return json({ ok: true, paid: false, status: status || 'pending', invoiceId });
    }

    // 3. Payé ! Facture -> payée, puis activation du plan sur toute la fiche.
    await supabaseRequest(
      env,
      `invoices?id=eq.${encodeURIComponent(String(invoiceId))}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid', validatedByAdmin: true }),
      }
    );

    let updated = 0;
    const uRes = await supabaseRequest(
      env,
      `users?email=eq.${encodeURIComponent(invoice.customerEmail || '')}&select=id`
    );
    const uRows = await uRes.json().catch(() => []);
    const client = uRows?.[0];
    if (client?.id) {
      await supabaseRequest(
        env,
        `users?id=eq.${encodeURIComponent(client.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ plan: planId, updated_at: new Date().toISOString() }),
        }
      );
      const aRes = await supabaseRequest(
        env,
        `assistants?user_id=eq.${encodeURIComponent(client.id)}&select=id,config`
      );
      if (aRes.ok) {
        const rows = await aRes.json().catch(() => []);
        for (const row of rows || []) {
          const patch = await supabaseRequest(
            env,
            `assistants?id=eq.${encodeURIComponent(row.id)}`,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                config: { ...(row.config || {}), plan: planId },
                updated_at: new Date().toISOString(),
              }),
            }
          );
          if (patch.ok) updated += 1;
        }
      }
    }

    console.log(`[slickpay][webhook] ${invoiceId} PAYÉ -> plan ${planId} (${updated} assistant(s) mis à jour)`);
    return json({ ok: true, paid: true, plan: planId, invoiceId, updated });
  } catch (e) {
    console.error('[slickpay][webhook] échec:', e?.message || e);
    return json({ ok: false, error: 'erreur serveur' }, 500);
  }
}
