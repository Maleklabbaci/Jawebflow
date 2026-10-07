/**
 * JAWEBFLOW — CANAL TELEGRAM
 * ============================================================================
 * Bot API (https://api.telegram.org), GRATUITE : aucun frais au message, aucun
 * plafond facturé, aucune revue d'application. C'est le seul canal qui se
 * branche en quelques heures.
 *
 * ⚠️ Positionnement produit (voir docs/QUELS_CANAUX.md) : Telegram n'apparaît
 * dans aucun classement d'usage en Algérie. On l'implémente donc comme
 * **banc d'essai de l'architecture multi-canal**, pas comme argument commercial.
 *
 * Mise en place (une fois) :
 *   1. Parler à @BotFather → /newbot → récupérer le jeton.
 *   2. Renseigner le webhook :
 *        https://api.telegram.org/bot<JETON>/setWebhook
 *          ?url=https://jawebflow.pages.dev/api/webhook/telegram&secret_token=<SECRET>
 *   3. Enregistrer la ligne dans `channel_integrations`
 *      (channel='telegram', account_id=<clé du webhook>, access_token=<jeton>).
 */

import type { ChannelAdapter, InboundMessage, SendResult } from './types.ts';
import { timingSafeEqual } from './signature.ts';

const API = 'https://api.telegram.org';

/** Limite d'un message Telegram. */
export const TELEGRAM_MAX_LENGTH = 4096;

/** Extrait un message entrant d'une « update », ou `null`. Fonction pure. */
export function parseTelegramUpdate(update: any): InboundMessage | null {
  if (!update || typeof update !== 'object') return null;

  // Bouton « inline » cliqué : on le traite comme un message.
  const callback = update.callback_query;
  if (callback?.message) {
    const text = String(callback.data || callback.message?.text || '').trim();
    if (!text) return null;
    return {
      channel: 'telegram',
      accountId: '',
      contactId: String(callback.from?.id || callback.message?.chat?.id || ''),
      contactName: String(callback.from?.first_name || callback.from?.username || '') || undefined,
      text,
      messageId: `cb:${callback.id}`,
      kind: 'postback',
    };
  }

  const message = update.message || update.edited_message;
  if (!message) return null;
  // Les bots ne se répondent pas entre eux : on ignore les messages d'un bot.
  if (message.from?.is_bot) return null;
  // Un bot ne peut pas écrire en premier dans un groupe : on ne gère que le privé.
  if (message.chat?.type && message.chat.type !== 'private') return null;

  const text = String(message.text || message.caption || '').trim();
  if (!text) return null;

  return {
    channel: 'telegram',
    accountId: '',
    contactId: String(message.chat?.id || message.from?.id || ''),
    contactName: String(message.from?.first_name || message.from?.username || '') || undefined,
    text,
    messageId: String(message.message_id),
    kind: 'message',
  };
}

export const telegramChannel: ChannelAdapter = {
  id: 'telegram',
  label: 'Telegram',
  maxLength: TELEGRAM_MAX_LENGTH,

  parseInbound(payload, ctx) {
    const updates: any[] = Array.isArray(payload) ? payload : [payload];
    const accountId = String(ctx?.accountId || '');
    return updates
      .map((u) => parseTelegramUpdate(u))
      .filter((m): m is InboundMessage => Boolean(m))
      .map((m) => ({ ...m, accountId }));
  },

  /**
   * Telegram signe ses webhooks avec l'en-tête `X-Telegram-Bot-Api-Secret-Token`,
   * fixé au moment du `setWebhook`. Sans secret configuré → refus (échoue fermé).
   */
  async verify(_rawBody, headers, env) {
    const expected = env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return false;
    const got = headers.get('x-telegram-bot-api-secret-token') || '';
    return timingSafeEqual(String(expected), got);
  },

  buildSend(target, text, env) {
    const token = env.TELEGRAM_BOT_TOKEN || '';
    return {
      url: `${API}/bot${token}/sendMessage`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: target,
          text,
          // Le bot répond à un client : jamais d'aperçu de lien imposé.
          disable_web_page_preview: true,
        }),
      },
    };
  },

  async send(target, text, env): Promise<SendResult> {
    if (!env.TELEGRAM_BOT_TOKEN) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN absent (Cloudflare → Settings → Variables)' };
    }
    try {
      const { url, init } = this.buildSend(target, text, env);
      const res = await fetch(url, init);
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        return {
          ok: false,
          status: res.status,
          error: data?.description ? `Telegram : ${data.description}` : `Telegram : HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status, messageId: String(data?.result?.message_id || '') };
    } catch (e) {
      return { ok: false, error: `Telegram injoignable : ${(e as Error)?.message || e}` };
    }
  },
};
