/**
 * JAWEBFLOW — WEBHOOK TELEGRAM
 * ============================================================================
 * POST /api/webhook/telegram?key=<clé de l'intégration>
 *
 * Canal GRATUIT, sans revue d'application : c'est le **banc d'essai** de
 * l'architecture multi-canal (voir docs/QUELS_CANAUX.md — Telegram n'apparaît
 * dans aucun classement d'usage en Algérie, on ne le vend donc pas).
 *
 * Pourquoi une clé dans l'URL ? Telegram n'envoie pas d'identifiant de compte
 * dans ses « updates ». Chaque assistant ayant son propre bot, on route par la
 * clé stockée dans `channel_integrations.account_id`.
 *
 * Mise en place :
 *   curl "https://api.telegram.org/bot<JETON>/setWebhook" \
 *        -d "url=https://jawebflow.pages.dev/api/webhook/telegram?key=<CLÉ>" \
 *        -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */

import { telegramChannel } from '../../_shared/channels/telegram.ts';
import { handleInbound, webhookJson } from '../../_shared/channels/pipeline.ts';

export async function onRequestGet(context: { request: Request; env: any }) {
  return webhookJson({ ok: true, channel: 'telegram' });
}

export async function onRequestPost(context: { request: Request; env: any; waitUntil?: (p: Promise<any>) => void }) {
  const { request, env } = context;
  const rawBody = await request.text();
  const url = new URL(request.url);
  const accountId = url.searchParams.get('key') || '';

  // Échec fermé : sans secret configuré, aucun webhook n'est accepté.
  const valid = await telegramChannel.verify?.(rawBody, request.headers, env);
  if (!valid) return webhookJson('signature invalide', 401);

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return webhookJson('JSON invalide', 400);
  }

  const messages = telegramChannel.parseInbound(payload, { accountId });

  const run = async () => {
    for (const message of messages) {
      try {
        await handleInbound(env, telegramChannel, message);
      } catch (e) {
        console.error('[telegram] traitement impossible:', (e as Error)?.message || e);
      }
    }
  };

  if (typeof context.waitUntil === 'function') context.waitUntil(run());
  else await run();

  // Telegram se contente d'un 200 vide.
  return webhookJson({ ok: true });
}
