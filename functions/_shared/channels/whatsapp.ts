/**
 * JAWEBFLOW — CANAL WHATSAPP (Cloud API)
 * ============================================================================
 * LE SEUL CANAL PAYANT. Barème Meta du 01/10/2026, marché « Rest of Africa »
 * (l'Algérie y est rattachée — voir docs/COUTS_WHATSAPP.md) :
 *
 *   • messages ENTRANTS (le client écrit) ......... GRATUITS, illimités
 *   • réponses de service ......................... 0,0046 $ APRÈS
 *                                                   1 000 gratuites/numéro/mois
 *   • templates marketing ......................... 0,0259 $ — AUCUNE franchise
 *   • fenêtre « free entry point » après une pub ... TOUT GRATUIT (jusqu'à 7 j)
 *
 * CE QUE CE FICHIER APPORTE DE DÉCISIF : la lecture de l'objet `pricing` que
 * Meta renvoie dans chaque accusé de livraison :
 *     "pricing": { "billable": true,  "category": "service" }      → facturé
 *     "pricing": { "billable": false, "type": "free_customer_service" } → gratuit
 * On ne devine donc JAMAIS : la refacturation du client est la copie exacte de
 * ce que Meta facture (voir `metering.ts`).
 *
 * Prérequis : statut Tech Provider, vérification d'entreprise, App Review des
 * permissions `whatsapp_business_messaging` + `whatsapp_business_management`,
 * et Embedded Signup v4 (v2/v3 dépréciés depuis le 15/10/2026).
 */

import type { ChannelAdapter, InboundMessage, SendResult, StatusEvent } from './types.ts';
import { metaChallenge, verifyMetaSignature } from './signature.ts';

export const WA_GRAPH_VERSION = 'v23.0';
export const WA_GRAPH_BASE = `https://graph.facebook.com/${WA_GRAPH_VERSION}`;

/** Limite d'un message WhatsApp. */
export const WHATSAPP_MAX_LENGTH = 4096;

/**
 * Le message vient-il d'une publicité « click-to-WhatsApp » ?
 * `referral` est présent sur le premier message quand le client arrive par une pub.
 */
export function cameFromAd(message: any): boolean {
  return Boolean(message?.referral?.source_url || message?.referral?.source_id || message?.referral?.source_type);
}

/** Extrait le texte utile d'un message WhatsApp (texte, bouton, réponse rapide). */
export function whatsappText(message: any): string {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.text?.body === 'string') return message.text.body.trim();
  if (typeof message.button?.text === 'string') return message.button.text.trim();
  if (typeof message.interactive?.button_reply?.title === 'string') return message.interactive.button_reply.title.trim();
  if (typeof message.interactive?.list_reply?.title === 'string') return message.interactive.list_reply.title.trim();
  // Un média sans légende : on garde une trace pour que l'IA puisse demander.
  if (typeof message.image?.caption === 'string') return message.image.caption.trim();
  if (message.image) return '[image]';
  if (message.audio) return '[audio]';
  if (message.document) return '[document]';
  return '';
}

export const whatsappChannel: ChannelAdapter = {
  id: 'whatsapp',
  label: 'WhatsApp',
  maxLength: WHATSAPP_MAX_LENGTH,

  parseInbound(payload) {
    const out: InboundMessage[] = [];
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        // `metadata.phone_number_id` = le numéro de l'ENTREPRISE (clé de routage).
        const accountId = String(value?.metadata?.phone_number_id || '');
        const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
        const nameById = new Map<string, string>();
        for (const c of contacts) if (c?.wa_id) nameById.set(String(c.wa_id), String(c?.profile?.name || ''));

        const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          const text = whatsappText(message);
          if (!text) continue;
          const contactId = String(message?.from || '');
          if (!contactId) continue;
          out.push({
            channel: 'whatsapp',
            accountId,
            contactId,
            contactName: nameById.get(contactId) || undefined,
            text,
            messageId: String(message?.id || ''),
            kind: 'message',
            fromAd: cameFromAd(message),
          });
        }
      }
    }
    return out;
  },

  /**
   * ACCUSÉS DE LIVRAISON = LA FACTURE.
   * `pricing.billable` dit si Meta a facturé ce message. C'est la seule source
   * fiable : on ne compte ni les messages envoyés, ni les échecs.
   */
  parseStatuses(payload): StatusEvent[] {
    const out: StatusEvent[] = [];
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const accountId = String(value?.metadata?.phone_number_id || '');
        const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const status of statuses) {
          // On ne compte que la livraison : `sent`/`failed` ne sont pas facturés.
          if (String(status?.status || '') !== 'delivered') continue;
          const pricing = status?.pricing || {};
          out.push({
            channel: 'whatsapp',
            accountId,
            messageId: String(status?.id || ''),
            billable: pricing?.billable === true,
            category: String(pricing?.category || ''),
          });
        }
      }
    }
    return out;
  },

  async verify(rawBody, headers, env) {
    return verifyMetaSignature(rawBody, headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET || env.INSTAGRAM_APP_SECRET);
  },

  challenge(url, env) {
    return metaChallenge(url, env);
  },

  buildSend(target, text, env) {
    const token = env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || '';
    return {
      url: `${WA_GRAPH_BASE}/${phoneNumberId}/messages`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: target,
          type: 'text',
          // `preview_url: false` : on ne transforme pas le lien du client en aperçu.
          text: { preview_url: false, body: text },
        }),
      },
    };
  },

  async send(target, text, env): Promise<SendResult> {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID absent' };
    }
    // Fenêtre de 24 h : hors fenêtre, un message libre est refusé par Meta.
    // On prévient clairement au lieu de laisser un échec silencieux.
    try {
      const { url, init } = this.buildSend(target, text, env);
      const res = await fetch(url, init);
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        const code = data?.error?.code;
        const msg = data?.error?.message || `HTTP ${res.status}`;
        const hint = code === 131047
          ? " (fenêtre de 24 h fermée : le client doit réécrire pour rouvrir la conversation)"
          : '';
        return { ok: false, status: res.status, error: `WhatsApp : ${msg}${hint}` };
      }
      return { ok: true, status: res.status, messageId: String(data?.messages?.[0]?.id || '') };
    } catch (e) {
      return { ok: false, error: `WhatsApp injoignable : ${(e as Error)?.message || e}` };
    }
  },
};
