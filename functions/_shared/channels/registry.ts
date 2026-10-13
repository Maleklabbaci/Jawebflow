/**
 * JAWEBFLOW — REGISTRE DES CANAUX
 * ============================================================================
 * Un seul endroit qui sait quels canaux existent. Ajouter un canal = écrire son
 * adaptateur puis l'ajouter ici : les webhooks, le pipeline, les quotas et la
 * base de connaissances n'ont pas besoin de le connaître.
 */

import type { ChannelAdapter, ChannelId } from './types.ts';
import { telegramChannel } from './telegram.ts';
import { messengerChannel } from './messenger.ts';
import { whatsappChannel } from './whatsapp.ts';
import { tiktokChannel } from './tiktok.ts';

/** Canaux actuellement implémentés côté serveur. */
export const CHANNELS: Record<string, ChannelAdapter> = {
  [telegramChannel.id]: telegramChannel,
  [messengerChannel.id]: messengerChannel,
  [whatsappChannel.id]: whatsappChannel,
  [tiktokChannel.id]: tiktokChannel,
};

export function getChannel(id: string): ChannelAdapter | null {
  return CHANNELS[String(id || '').toLowerCase()] || null;
}

/** Un canal coûte-t-il de l'argent au message ? (seul WhatsApp, à ce jour) */
export function channelCostsMoney(id: ChannelId | string): boolean {
  return String(id).toLowerCase() === 'whatsapp';
}

/** Libellé humain d'un canal (journal, diagnostics, interface). */
export function channelLabel(id: string): string {
  const adapter = getChannel(id);
  if (adapter) return adapter.label;
  if (String(id).toLowerCase() === 'instagram') return 'Instagram';
  if (String(id).toLowerCase() === 'web') return 'Widget web';
  return String(id);
}
