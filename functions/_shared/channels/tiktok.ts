/**
 * JAWEBFLOW — CANAL TIKTOK (Business Messaging API)
 * ============================================================================
 * GRATUIT : TikTok ne publie aucun tarif au message, ni palier payant, sur
 * l'ensemble de ses API (voir docs/QUELS_CANAUX.md). Le seul coût récurrent
 * est l'IA.
 *
 * ⚠️ DEUX RÉSERVES À GARDER EN TÊTE :
 *   1. L'API est en **beta restreinte** : APAC, LATAM, METAP (dont l'Algérie) et
 *      Amérique du Nord. L'EEE, la Suisse et le Royaume-Uni en sont exclus.
 *      L'éligibilité d'un compte algérien reste **à confirmer par un test**.
 *   2. TikTok exige un **compte Business**, une **candidature à la Business
 *      Messaging API** et une **revue de sécurité des données**.
 *
 * ⚠️ HONNÊTETÉ TECHNIQUE : contrairement à Meta (dont la forme des webhooks est
 * publique et documentée), le détail de la charge utile TikTok n'est accessible
 * qu'une fois l'accès accordé. Le parseur ci-dessous est donc **tolérant** : il
 * reconnaît plusieurs formes plausibles et ignore ce qu'il ne comprend pas —
 * il ne plantera jamais. **À revérifier contre la documentation officielle le
 * jour où l'accès est accordé**, et à ajuster si la forme diffère.
 */

import type { ChannelAdapter, InboundMessage, SendResult } from './types.ts';
import { hmacSha256Hex, timingSafeEqual } from './signature.ts';

const TIKTOK_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/** Limite d'un message TikTok (à confirmer à l'accès). */
export const TIKTOK_MAX_LENGTH = 1000;

/** Cherche un champ quel que soit le niveau d'imbrication (parseur tolérant). */
function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const found = pick(value, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Extrait le texte, quelle que soit la forme : `text`, `content`, ou un objet
 * imbriqué `message: { text }`. (Sans cela, `message` ressortait en
 * « [object Object] » — le genre de bug qu'on ne veut pas découvrir en prod.)
 */
function textOf(event: any): string {
  const direct = pick(event, ['text', 'content']);
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const message = event?.message ?? event?.data?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (message && typeof message === 'object') {
    const inner = pick(message, ['text', 'content']);
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  }
  return '';
}

/** Analyse un événement TikTok, ou `null` si ce n'est pas un message lisible. */
export function parseTikTokEvent(event: any): InboundMessage | null {
  if (!event || typeof event !== 'object') return null;

  const type = String(pick(event, ['event', 'event_type', 'type']) || '').toUpperCase();
  // On ne traite que la messagerie : les autres événements (commentaires,
  // statistiques) seront ajoutés quand l'accès sera confirmé.
  const isMessage = type.includes('MESSAGE') || Boolean(pick(event, ['message', 'content', 'text']));
  if (!isMessage) return null;

  const text = textOf(event);
  if (!text) return null;

  const contactId = String(
    pick(event, ['from_user_id', 'sender_id', 'from', 'open_id', 'user_id']) || '',
  );
  if (!contactId) return null;

  const profile = pick(event, ['from_user_name', 'sender_name', 'nickname', 'username', 'display_name']);

  return {
    channel: 'tiktok',
    accountId: '',
    contactId,
    contactName: profile ? String(profile) : undefined,
    text,
    messageId: String(pick(event, ['message_id', 'id', 'event_id']) || `${Date.now()}`),
    kind: 'message',
  };
}

export const tiktokChannel: ChannelAdapter = {
  id: 'tiktok',
  label: 'TikTok',
  maxLength: TIKTOK_MAX_LENGTH,

  parseInbound(payload, ctx) {
    const accountId = String(ctx?.accountId || String(pick(payload, ['business_id', 'account_id']) || ''));
    // Formes possibles : { events: [...] }, { data: [...] }, ou un objet unique.
    const list: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(payload?.data)
          ? payload.data
          : [payload];
    return list
      .map((e) => parseTikTokEvent(e))
      .filter((m): m is InboundMessage => Boolean(m))
      .map((m) => ({ ...m, accountId }));
  },

  /**
   * TikTok signe ses webhooks par HMAC-SHA256 dans l'en-tête `TikTok-Signature`
   * (nom exact à confirmer à l'accès). Sans secret → refus (échoue fermé).
   */
  async verify(rawBody, headers, env) {
    const secret = env.TIKTOK_APP_SECRET;
    if (!secret) return false;
    const header =
      headers.get('tiktok-signature') || headers.get('x-tiktok-signature') || headers.get('signature') || '';
    if (!header) return false;
    const expected = await hmacSha256Hex(String(secret), rawBody);
    // L'en-tête peut arriver sous la forme `t=…,s=<hex>` ou directement en hex.
    const candidate = header.includes('s=') ? header.split('s=').pop()!.trim() : header.trim();
    return timingSafeEqual(expected, candidate);
  },

  buildSend(target, text, env) {
    const token = env.TIKTOK_ACCESS_TOKEN || '';
    return {
      url: `${TIKTOK_BASE}/business/message/send/`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': token },
        body: JSON.stringify({
          business_id: env.TIKTOK_BUSINESS_ID || undefined,
          recipient: { user_id: target },
          message: { type: 'TEXT', content: text },
        }),
      },
    };
  },

  async send(target, text, env): Promise<SendResult> {
    if (!env.TIKTOK_ACCESS_TOKEN) {
      return { ok: false, error: 'TIKTOK_ACCESS_TOKEN absent (accès Business Messaging non accordé ?)' };
    }
    try {
      const { url, init } = this.buildSend(target, text, env);
      const res = await fetch(url, init);
      const data: any = await res.json().catch(() => null);
      if (!res.ok || (data?.code !== undefined && Number(data.code) !== 0)) {
        const msg = data?.message || `HTTP ${res.status}`;
        return { ok: false, status: res.status, error: `TikTok : ${msg}` };
      }
      return { ok: true, status: res.status, messageId: String(data?.data?.message_id || '') };
    } catch (e) {
      return { ok: false, error: `TikTok injoignable : ${(e as Error)?.message || e}` };
    }
  },
};
