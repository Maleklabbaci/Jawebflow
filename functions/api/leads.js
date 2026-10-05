/**
 * JAWEBFLOW — Lecture et mise à jour du suivi des prospects d'un assistant.
 * La table prospects reste en RLS service_role uniquement : l'API vérifie
 * toujours le propriétaire de l'assistant avant de renvoyer ou modifier une fiche.
 */
import {
  verifySupabaseIdToken,
  supabaseGetAssistant,
  supabaseListProspects,
  supabaseCountProspects,
  supabaseUpsertProspect,
  supabaseRequest,
} from '../_shared/supabase.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function authorize(context, assistantId) {
  const env = context.env;
  const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
  if (!caller) return { error: 'Authentification requise', status: 401 };
  const assistant = await supabaseGetAssistant(env, assistantId);
  if (!assistant.ok || assistant.data?.user_id !== caller.uid) {
    return { error: 'Accès refusé à cet assistant', status: 403 };
  }
  return { caller };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const assistantId = String(url.searchParams.get('assistantId') || '').trim();
    if (!assistantId) return new Response(JSON.stringify({ error: 'assistantId requis' }), { status: 400, headers: cors });
    const auth = await authorize(context, assistantId);
    if ('error' in auth) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: cors });

    // Pagination : une grande société a des milliers de clients — on ne les
    // tronque plus à 200. Le tableau de bord charge page par page.
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
    const [prospects, total] = await Promise.all([
      supabaseListProspects(context.env, assistantId, { limit, offset }),
      supabaseCountProspects(context.env, assistantId),
    ]);
    return new Response(JSON.stringify({ prospects, total, offset, limit, hasMore: offset + prospects.length < total }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[leads] erreur', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erreur serveur' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const assistantId = String(body?.assistantId || '').trim();
    const prospectId = String(body?.prospectId || '').trim();
    const action = String(body?.action || '').trim();
    const followUpStatus = String(body?.followUpStatus || '').trim();
    const orderId = String(body?.orderId || '').trim();
    const orderStatus = String(body?.orderStatus || '').trim();
    if (!assistantId || !prospectId || prospectId.length > 200) {
      return new Response(JSON.stringify({ error: 'assistantId et prospectId requis' }), { status: 400, headers: cors });
    }
    if (orderId.length > 200) return new Response(JSON.stringify({ error: 'Identifiant de commande invalide' }), { status: 400, headers: cors });
    if (followUpStatus && followUpStatus !== 'done') return new Response(JSON.stringify({ error: 'Statut de suivi invalide' }), { status: 400, headers: cors });
    if (Boolean(orderId) !== Boolean(orderStatus)) return new Response(JSON.stringify({ error: 'orderId et orderStatus doivent être fournis ensemble' }), { status: 400, headers: cors });
    if (orderStatus && !new Set(['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']).has(orderStatus)) {
      return new Response(JSON.stringify({ error: 'Statut de commande invalide' }), { status: 400, headers: cors });
    }
    if (action && !['takeover', 'resume'].includes(action)) return new Response(JSON.stringify({ error: 'Action de suivi invalide' }), { status: 400, headers: cors });
    if (Number(Boolean(followUpStatus)) + Number(Boolean(orderId)) + Number(Boolean(action)) !== 1) {
      return new Response(JSON.stringify({ error: 'Une seule action de suivi est acceptée à la fois' }), { status: 400, headers: cors });
    }

    const auth = await authorize(context, assistantId);
    if ('error' in auth) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: cors });

    const found = await supabaseRequest(
      context.env,
      `prospects?id=eq.${encodeURIComponent(prospectId)}&assistant_id=eq.${encodeURIComponent(assistantId)}&select=id,data`,
    );
    const rows = found.ok ? await found.json().catch(() => []) : [];
    const prospect = Array.isArray(rows) ? rows[0] : null;
    if (!prospect) return new Response(JSON.stringify({ error: 'Prospect introuvable' }), { status: 404, headers: cors });
    const data = prospect.data || {};

    if (followUpStatus === 'done') {
      const completedAt = new Date().toISOString();
      await supabaseUpsertProspect(context.env, prospectId, assistantId, {
        followUpStatus: 'done',
        followUpCompletedAt: completedAt,
        nextAction: 'Suivi terminé',
      });
      return new Response(JSON.stringify({ ok: true, prospectId, followUpStatus: 'done', completedAt }), { status: 200, headers: cors });
    }

    if (orderId && orderStatus) {
      const allowedStatuses = new Set(['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);
      if (!allowedStatuses.has(orderStatus)) return new Response(JSON.stringify({ error: 'Statut de commande invalide' }), { status: 400, headers: cors });
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const order = orders.find((candidate) => candidate?.id === orderId);
      if (!order) return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: cors });
      // Une COMMANDE suit préparation → expédition → livraison. Une VISITE, un
      // RENDEZ-VOUS, une RÉSERVATION ou un DEVIS n'ont pas de colis à expédier :
      // ils passent directement de « confirmé » à « réalisé » (delivered).
      const isOrder = String(order.kind || 'order') === 'order';
      const transitions = isOrder
        ? {
          pending_merchant_confirmation: ['confirmed', 'cancelled'],
          confirmed: ['preparing', 'cancelled'],
          preparing: ['shipped', 'cancelled'],
          shipped: ['delivered'],
          delivered: [],
          cancelled: [],
        }
        : {
          pending_merchant_confirmation: ['confirmed', 'cancelled'],
          confirmed: ['delivered', 'cancelled'],
          delivered: [],
          cancelled: [],
        };
      if (!transitions[order.status]?.includes(orderStatus)) {
        return new Response(JSON.stringify({ error: `Transition impossible : ${order.status} → ${orderStatus}` }), { status: 409, headers: cors });
      }
      const updatedAt = new Date().toISOString();
      const updatedOrders = orders.map((candidate) => candidate?.id === orderId ? { ...candidate, status: orderStatus, updatedAt } : candidate);
      await supabaseUpsertProspect(context.env, prospectId, assistantId, { orders: updatedOrders });
      return new Response(JSON.stringify({ ok: true, prospectId, orderId, orderStatus, updatedAt }), { status: 200, headers: cors });
    }

    if (action === 'takeover' || action === 'resume') {
      const sessionId = String(data.sessionId || (data.igUserId ? `ig_${data.igUserId}` : '')).trim();
      if (!sessionId) return new Response(JSON.stringify({ error: 'Aucune conversation disponible pour ce prospect' }), { status: 409, headers: cors });
      const now = new Date().toISOString();
      const muteUrl = `bot_mutes?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionId)}`;
      const muteResult = action === 'takeover'
        ? await supabaseRequest(context.env, 'bot_mutes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
            body: JSON.stringify({ assistant_id: assistantId, session_id: sessionId }),
          })
        : await supabaseRequest(context.env, muteUrl, { method: 'DELETE' });
      if (!muteResult.ok) throw new Error('Impossible de modifier le mode de réponse du bot.');
      const handoffStatus = action === 'takeover' ? 'human' : 'bot';
      await supabaseUpsertProspect(context.env, prospectId, assistantId, { handoffStatus, handoffAt: now, lastInteractionAt: now });
      return new Response(JSON.stringify({ ok: true, prospectId, handoffStatus, sessionId }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Action de suivi invalide' }), { status: 400, headers: cors });
  } catch (err) {
    console.error('[leads] mise à jour impossible', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erreur serveur' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}
