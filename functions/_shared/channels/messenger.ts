/**
 * JAWEBFLOW — CANAL FACEBOOK MESSENGER (+ commentaires de Page)
 * ============================================================================
 * PRIORITÉ COMMERCIALE N°1 en Algérie (voir docs/QUELS_CANAUX.md) :
 *   • 29 300 000 utilisateurs Messenger en Algérie (61 % de la population),
 *     contre 15 400 000 sur Instagram — le plus grand canal du pays ;
 *   • **Meta ne facture RIEN** : la Send API n'a aucun frais au message.
 *     Le seul coût récurrent est l'IA (2,97 DA par conversation).
 *
 * Prérequis Meta (gratuits, mais à obtenir) :
 *   • permission `pages_messaging` en accès avancé (+ `pages_manage_engagement`
 *     pour répondre aux commentaires) → App Review + vérification d'entreprise ;
 *   • webhook pointé sur https://jawebflow.pages.dev/api/webhook/messenger
 *     avec les champs `messages`, `messaging_postbacks` (et `feed` pour les
 *     commentaires de Page) ;
 *   • page Facebook du client connectée via OAuth (jeton de page).
 *
 * ⚠️ À terme, Meta a annoncé une facturation pour « Marketing Messages on
 * Messenger » (messages PUBLICITAIRES). Le service client reste gratuit. Le
 * compteur `metering.ts` enregistre donc déjà `billable` pour ce canal, afin
 * d'être prêt le jour où Meta facturera — sans rien changer au code.
 */

import type { ChannelAdapter, InboundMessage, SendResult, StatusEvent } from './types.ts';
import { metaChallenge, verifyMetaSignature } from './signature.ts';

export const MESSENGER_GRAPH_VERSION = 'v23.0';
export const MESSENGER_GRAPH_BASE = `https://graph.facebook.com/${MESSENGER_GRAPH_VERSION}`;

/** Limite d'un message Messenger. */
export const MESSENGER_MAX_LENGTH = 2000;

/** Analyse un événement `messaging`. Fonction pure. */
export function parseMessengerEvent(event: any): InboundMessage | null {
  if (!event || typeof event !== 'object') return null;
  const senderId = String(event.sender?.id || '');
  if (!senderId || event.message?.is_echo) return null; // `is_echo` = notre propre message

  // Bouton / réponse rapide cliquée → traité comme un message.
  if (event.postback) {
    const text = String(event.postback.title || event.postback.payload || '').trim();
    if (!text) return null;
    return {
      channel: 'messenger',
      accountId: '',
      contactId: senderId,
      text,
      messageId: `pb:${event.timestamp || Date.now()}:${text.slice(0, 24)}`,
      kind: 'postback',
      fromAd: Boolean(event.postback.referral),
    };
  }

  // Réponse rapide : `message.quick_reply.payload` porte l'intention.
  const text = String(event.message?.text || event.message?.quick_reply?.payload || '').trim();
  if (!text) return null;

  return {
    channel: 'messenger',
    accountId: '',
    contactId: senderId,
    text,
    messageId: String(event.message?.mid || `m:${event.timestamp || Date.now()}`),
    kind: 'message',
    // Une conversation née d'une publicité « click-to-message » ouvre une
    // fenêtre gratuite chez Meta (jusqu'à 7 jours).
    fromAd: Boolean(event.message?.referral || event.referral),
  };
}

export const messengerChannel: ChannelAdapter = {
  id: 'messenger',
  label: 'Facebook Messenger',
  maxLength: MESSENGER_MAX_LENGTH,

  parseInbound(payload) {
    const out: InboundMessage[] = [];
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const accountId = String(entry?.id || '');
      const events: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of events) {
        const parsed = parseMessengerEvent(event);
        if (parsed) out.push({ ...parsed, accountId });
      }
    }
    return out;
  },

  /**
   * Accusés de livraison Messenger. Aujourd'hui Meta ne facture rien sur
   * Messenger, donc `billable` reste faux — mais le jour où Meta active
   * « Marketing Messages », l'objet `pricing` arrivera de la même façon que
   * sur WhatsApp et le compteur suivra sans modification.
   */
  parseStatuses(payload): StatusEvent[] {
    const out: StatusEvent[] = [];
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const events: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of events) {
        const delivery = event?.delivery;
        if (!delivery) continue;
        const ids: string[] = Array.isArray(delivery.mids) ? delivery.mids : [];
        for (const mid of ids) {
          out.push({
            channel: 'messenger',
            accountId: String(entry?.id || ''),
            messageId: String(mid),
            billable: delivery?.pricing?.billable === true,
            category: delivery?.pricing?.category,
          });
        }
      }
    }
    return out;
  },

  async verify(rawBody, headers, env) {
    return verifyMetaSignature(rawBody, headers.get('x-hub-signature-256'), env.MESSENGER_APP_SECRET || env.INSTAGRAM_APP_SECRET);
  },

  challenge(url, env) {
    return metaChallenge(url, env);
  },

  buildSend(target, text, env) {
    const token = env.MESSENGER_PAGE_ACCESS_TOKEN || env.META_PAGE_ACCESS_TOKEN || '';
    return {
      url: `${MESSENGER_GRAPH_BASE}/me/messages`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipient: { id: target },
          messaging_type: 'RESPONSE',
          message: { text },
        }),
      },
    };
  },

  async send(target, text, env): Promise<SendResult> {
    if (!(env.MESSENGER_PAGE_ACCESS_TOKEN || env.META_PAGE_ACCESS_TOKEN)) {
      return { ok: false, error: 'MESSENGER_PAGE_ACCESS_TOKEN absent (Cloudflare → Settings → Variables)' };
    }
    try {
      const { url, init } = this.buildSend(target, text, env);
      const res = await fetch(url, init);
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        return { ok: false, status: res.status, error: `Messenger : ${msg}` };
      }
      return { ok: true, status: res.status, messageId: String(data?.message_id || '') };
    } catch (e) {
      return { ok: false, error: `Messenger injoignable : ${(e as Error)?.message || e}` };
    }
  },
};
