/**
 * JAWEBFLOW — WEBHOOK TIKTOK (Business Messaging API)
 * ============================================================================
 * POST /api/webhook/tiktok?key=<clé de l'intégration>
 *
 * Canal GRATUIT (aucun tarif au message publié par TikTok), mais en **beta
 * restreinte** : APAC, LATAM, METAP (dont l'Algérie) et Amérique du Nord.
 * L'éligibilité d'un compte algérien doit être **confirmée par un test avant
 * toute promesse commerciale** (voir docs/QUELS_CANAUX.md).
 *
 * ⚠️ Le parseur de `functions/_shared/channels/tiktok.ts` est volontairement
 * tolérant : la forme exacte de la charge utile n'est documentée qu'après
 * l'obtention de l'accès. À revérifier contre la documentation officielle le
 * jour où l'accès est accordé — et à ajuster si elle diffère.
 */

import { tiktokChannel } from '../../_shared/channels/tiktok.ts';
import { handleInbound, webhookJson } from '../../_shared/channels/pipeline.ts';

export async function onRequestGet(context: { request: Request; env: any }) {
  return webhookJson({ ok: true, channel: 'tiktok' });
}

export async function onRequestPost(context: { request: Request; env: any; waitUntil?: (p: Promise<any>) => void }) {
  const { request, env } = context;
  const rawBody = await request.text();
  const url = new URL(request.url);
  const accountId = url.searchParams.get('key') || '';

  const valid = await tiktokChannel.verify?.(rawBody, request.headers, env);
  if (!valid) return webhookJson('signature invalide', 401);

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return webhookJson('JSON invalide', 400);
  }

  const messages = tiktokChannel.parseInbound(payload, { accountId });

  const run = async () => {
    for (const message of messages) {
      try {
        await handleInbound(env, tiktokChannel, message);
      } catch (e) {
        console.error('[tiktok] traitement impossible:', (e as Error)?.message || e);
      }
    }
  };

  if (typeof context.waitUntil === 'function') context.waitUntil(run());
  else await run();

  return webhookJson({ ok: true });
}
