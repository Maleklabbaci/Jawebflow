/**
 * JAWEBFLOW — WEBHOOK FACEBOOK MESSENGER
 * ============================================================================
 * GET  /api/webhook/messenger   → vérification Meta (hub.challenge)
 * POST /api/webhook/messenger   → messages + accusés de livraison
 *
 * Canal GRATUIT (aucun frais au message chez Meta). Voir
 * `functions/_shared/channels/messenger.ts` pour les prérequis (App Review
 * `pages_messaging`, webhook à pointer sur cette URL, champs `messages` +
 * `messaging_postbacks`).
 *
 * Le handler ne fait que « vérifier → router » : toute la logique vit dans le
 * pipeline partagé, donc elle est la même que sur les autres canaux.
 */

import { messengerChannel } from '../../_shared/channels/messenger.ts';
import { handleInbound, handleStatuses, webhookJson, META_OK } from '../../_shared/channels/pipeline.ts';

export async function onRequestGet(context: { request: Request; env: any }) {
  const url = new URL(context.request.url);
  const challenge = messengerChannel.challenge?.(url, context.env);
  if (!challenge) return webhookJson({ ok: true, channel: 'messenger' });
  return new Response(challenge.body, { status: challenge.status });
}

export async function onRequestPost(context: { request: Request; env: any; waitUntil?: (p: Promise<any>) => void }) {
  const { request, env } = context;
  const rawBody = await request.text();

  // Échec fermé : sans secret ou avec une signature invalide, on refuse.
  const valid = await messengerChannel.verify?.(rawBody, request.headers, env);
  if (!valid) return webhookJson('signature invalide', 401);

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return webhookJson('JSON invalide', 400);
  }

  const run = async () => {
    const messages = messengerChannel.parseInbound(payload);
    for (const message of messages) {
      try {
        await handleInbound(env, messengerChannel, message);
      } catch (e) {
        console.error('[messenger] traitement impossible:', (e as Error)?.message || e);
      }
    }
    // Les accusés de livraison (préparation d'une future facturation Meta).
    try {
      await handleStatuses(env, messengerChannel, payload);
    } catch { /* best-effort */ }
  };

  // Meta attend une réponse rapide : on répond tout de suite, on travaille après.
  if (typeof context.waitUntil === 'function') context.waitUntil(run());
  else await run();

  return webhookJson(META_OK);
}
