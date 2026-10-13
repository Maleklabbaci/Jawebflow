/**
 * L'IDENTITÉ DES CANAUX — en un seul endroit.
 *
 * Le même client peut arriver par le widget du site, Instagram, Messenger,
 * WhatsApp, Telegram ou TikTok. Les valeurs écrites en base ne sont pas
 * toujours homogènes (« instagram », « Instagram », « site web »,
 * « web_widget »…) : cette table est la seule source de vérité pour
 * l'affichage, afin que le marchand voie TOUJOURS le bon nom — et jamais
 * « Mon site » pour un message WhatsApp.
 */

export type ChannelKey =
  | 'web'
  | 'instagram'
  | 'messenger'
  | 'whatsapp'
  | 'telegram'
  | 'tiktok'
  | 'voice'
  | 'scan';

export interface ChannelIdentity {
  key: ChannelKey;
  /** Nom complet, pour le détail d'une fiche. */
  label: string;
  /** Nom court, pour un badge dans un tableau ou une liste. */
  short: string;
  emoji: string;
  /** Classes du badge (fond + texte + bordure), accordées au réseau. */
  badgeClass: string;
}

const CHANNELS: Record<ChannelKey, ChannelIdentity> = {
  web: {
    key: 'web',
    label: 'Widget du site web',
    short: 'Site web',
    emoji: '🌐',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    short: 'Instagram',
    emoji: '📸',
    badgeClass: 'border-pink-200 bg-pink-50 text-pink-700',
  },
  messenger: {
    key: 'messenger',
    label: 'Facebook Messenger',
    short: 'Messenger',
    emoji: '💬',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp',
    short: 'WhatsApp',
    emoji: '🟢',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  telegram: {
    key: 'telegram',
    label: 'Telegram',
    short: 'Telegram',
    emoji: '✈️',
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    short: 'TikTok',
    emoji: '🎵',
    badgeClass: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  voice: {
    key: 'voice',
    label: 'Assistant vocal (appel)',
    short: 'Vocal',
    emoji: '📞',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  scan: {
    key: 'scan',
    label: 'Scanner du site',
    short: 'Scanner',
    emoji: '🔎',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

/** Toutes les écritures rencontrées dans le produit, ramenées à un canal. */
const ALIASES: Record<string, ChannelKey> = {
  web: 'web',
  website: 'web',
  widget: 'web',
  web_widget: 'web',
  'web widget': 'web',
  'site': 'web',
  'site web': 'web',
  site_web: 'web',
  instagram: 'instagram',
  ig: 'instagram',
  insta: 'instagram',
  messenger: 'messenger',
  facebook: 'messenger',
  fb: 'messenger',
  'facebook messenger': 'messenger',
  whatsapp: 'whatsapp',
  'whats app': 'whatsapp',
  wa: 'whatsapp',
  telegram: 'telegram',
  tg: 'telegram',
  tiktok: 'tiktok',
  'tik tok': 'tiktok',
  voice: 'voice',
  vocal: 'voice',
  'agent vocal': 'voice',
  appel: 'voice',
  call: 'voice',
  scan: 'scan',
  scanner: 'scan',
  crawler: 'scan',
};

/** Le canal d'une valeur brute, ou `null` si elle est vide / inconnue. */
export function channelKey(raw?: string | null): ChannelKey | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (ALIASES[value]) return ALIASES[value];
  // Valeurs préfixées : « canal: wa », « source/whatsapp », « ig-dm »… on
  // regarde les deux bouts, celui qui porte le nom du réseau étant variable.
  const morceaux = value.split(/[:/|>#_-]/).map((m) => m.trim()).filter(Boolean);
  for (const morceau of [morceaux[morceaux.length - 1], morceaux[0]]) {
    if (morceau && ALIASES[morceau]) return ALIASES[morceau];
  }
  return null;
}

export function channelIdentity(raw?: string | null): ChannelIdentity | null {
  const key = channelKey(raw);
  return key ? CHANNELS[key] : null;
}

/**
 * Le nom à afficher pour une valeur de canal. Si elle est inconnue mais non
 * vide, on la montre telle quelle (on n'invente jamais un canal) ; sinon on
 * rend le libellé de repli (l'origine, ou « Canal inconnu »).
 */
export function channelLabel(raw?: string | null, fallback = 'Canal inconnu'): string {
  const identity = channelIdentity(raw);
  if (identity) return identity.label;
  const value = String(raw || '').trim();
  return value || fallback;
}

/**
 * Le canal d'un CLIENT : son canal, sinon son origine, sinon le site web —
 * tous les prospects créés avant les messageries venaient du widget. Cette
 * règle est partagée par l'affichage et le filtre : le nom affiché est donc
 * toujours exactement celui qui filtre.
 */
export function clientChannel(channel?: string | null, source?: string | null): ChannelIdentity {
  return channelIdentity(channel) || channelIdentity(source) || CHANNELS.web;
}

/** Les canaux d'un client, dans l'ordre du menu — pour un filtre par exemple. */
export const CLIENT_CHANNELS: ChannelIdentity[] = [
  CHANNELS.web,
  CHANNELS.instagram,
  CHANNELS.messenger,
  CHANNELS.whatsapp,
  CHANNELS.telegram,
  CHANNELS.tiktok,
  CHANNELS.voice,
];
