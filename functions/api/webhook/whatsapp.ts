/**
 * JAWEBFLOW — WEBHOOK WHATSAPP (Cloud API)
 * ============================================================================
 * GET  /api/webhook/whatsapp   → vérification Meta (hub.challenge)
 * POST /api/webhook/whatsapp   → messages entrants + ACCUSÉS DE LIVRAISON
 *
 * ⚠️ C'est le SEUL webhook qui alimente la refacturation : les accusés de
 * livraison portent `pricing.billable`, l'information qui dit si Meta a
 * facturé le message. Sans ce webhook, JawebFlow paierait les frais Meta sans
 * pouvoir les refacturer — et le forfait inclus des plans Pro/Enterprise ne
 * pourrait pas être décompté.
 *
 * Prérequis : statut Tech Provider + vérification d'entreprise + App Review
 * (`whatsapp_business_messaging`, `whatsapp_business_management`) + Embedded
 * Signup v4 (v2/v3 dépréciés depuis le 15/10/2026).
 */

import { whatsappChannel } from '../../_shared/channels/whatsapp.ts';
import { handleInbound, handleStatuses, webhookJson, META_OK } from '../../_shared/channels/pipeline.ts';

export async function onRequestGet(context: { request: Request; env: any }) {
  const url = new URL(context.request.url);
  const challenge = whatsappChannel.challenge?.(url, context.env);
  if (!challenge) return webhookJson({ ok: true, channel: 'whatsapp' });
  return new Response(challenge.body, { status: challenge.status });
}

export async function onRequestPost(context: { request: Request; env: any; waitUntil?: (p: Promise<any>) => void }) {
  const { request, env } = context;
  const rawBody = await request.text();

  const valid = await whatsappChannel.verify?.(rawBody, request.headers, env);
  if (!valid) return webhookJson('signature invalide', 401);

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return webhookJson('JSON invalide', 400);
  }

  const run = async () => {
    // 1. La facturation d'abord : c'est le geste le plus important et le moins
    //    coûteux, il ne doit jamais être perdu si l'IA échoue ensuite.
    try {
      await handleStatuses(env, whatsappChannel, payload);
    } catch (e) {
      console.error('[whatsapp] accusés de livraison non traités:', (e as Error)?.message || e);
    }

    // 2. Les réponses.
    for (const message of whatsappChannel.parseInbound(payload)) {
      try {
        await handleInbound(env, whatsappChannel, message);
      } catch (e) {
        console.error('[whatsapp] traitement impossible:', (e as Error)?.message || e);
      }
    }
  };

  if (typeof context.waitUntil === 'function') context.waitUntil(run());
  else await run();

  return webhookJson(META_OK);
}
