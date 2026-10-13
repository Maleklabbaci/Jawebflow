/**
 * JAWEBFLOW — CONTRAT DES CANAUX
 * ============================================================================
 * Un « canal » est une messagerie dans laquelle un client peut écrire à une
 * entreprise : widget web, Instagram, Messenger, WhatsApp, TikTok, Telegram.
 *
 * Règle de conception (voir DEV.md §2) : la logique de chaque canal doit être
 * une **fonction pure**, testable sans réseau. Le réseau ne vit que dans
 * `send()`, appelé en dernier.
 *
 * Ce découpage est ce qui permet d'ajouter un canal sans recopier 1 500 lignes
 * de webhook : le webhook ne fait plus que « vérifier → analyser → router »,
 * et toute la mécanique commune (quotas, base de connaissances, IA, prospects)
 * vit dans `pipeline.ts`.
 */

export type ChannelId = 'web' | 'instagram' | 'messenger' | 'whatsapp' | 'tiktok' | 'telegram';

/** Un message entrant, normalisé — la seule forme que connaît le moteur. */
export interface InboundMessage {
  channel: ChannelId;
  /** Identifiant du compte de l'ENTREPRISE sur ce canal (page, numéro, bot…). */
  accountId: string;
  /** Identifiant de la personne qui écrit. */
  contactId: string;
  /** Nom affiché si la plateforme le fournit (Messenger, Telegram). */
  contactName?: string;
  text: string;
  /** Identifiant unique de l'événement — sert d'anti-doublon. */
  messageId: string;
  /**
   * Vrai si la conversation vient d'une publicité « click-to-message ».
   * Chez Meta, la fenêtre ouverte par une pub est gratuite (jusqu'à 7 jours
   * depuis le 28/09/2026) — donc sans frais, même pour un template marketing.
   */
  fromAd?: boolean;
  /** Nature de l'événement : un message, ou un bouton cliqué. */
  kind?: 'message' | 'postback';
}

/**
 * Un accusé de livraison. Chez Meta, il porte l'objet `pricing` qui dit si le
 * message a été FACTURÉ — c'est la source de vérité pour refacturer le client
 * au centime près (voir `metering.ts`).
 */
export interface StatusEvent {
  channel: ChannelId;
  accountId: string;
  messageId: string;
  /** `true` = Meta a facturé ce message. */
  billable: boolean;
  /** marketing | utility | service | authentication … */
  category?: string;
}

export interface SendResult {
  ok: boolean;
  status?: number;
  /** Message d'erreur déjà lisible par un humain (français). */
  error?: string;
  /** Identifiant du message envoyé, si la plateforme le renvoie. */
  messageId?: string;
}

export interface ChannelEnv {
  [key: string]: any;
}

export interface ChannelAdapter {
  id: ChannelId;
  /** Libellé humain, pour les diagnostics et l'interface. */
  label: string;
  /**
   * Longueur maximale d'un message sur cette plateforme. Le pipeline découpe
   * les réponses trop longues avec `splitForLimit` (une réponse d'IA de 1 500
   * caractères ne part jamais en erreur 400 chez la plateforme).
   */
  maxLength?: number;

  /**
   * Extrait les messages entrants d'une charge utile brute.
   * FONCTION PURE : aucun appel réseau, testable directement.
   * `ctx.accountId` permet aux plateformes qui ne l'envoient pas (Telegram) de
   * l'obtenir autrement — par la clé présente dans l'URL du webhook.
   */
  parseInbound(payload: any, ctx?: { accountId?: string }): InboundMessage[];

  /** Extrait les accusés de livraison (facturation). Fonction pure. */
  parseStatuses?(payload: any, ctx?: { accountId?: string }): StatusEvent[];

  /**
   * Vérifie l'authenticité de la requête. Renvoie `false` si le secret n'est
   * pas configuré : on échoue fermé, jamais ouvert.
   */
  verify?(rawBody: string, headers: Headers, env: ChannelEnv): Promise<boolean>;

  /**
   * Répond au challenge de vérification du webhook (Meta).
   * Renvoie `null` si la requête n'est pas un challenge.
   */
  challenge?(url: URL, env: ChannelEnv): { status: number; body: string } | null;

  /** Construit la requête d'envoi. FONCTION PURE (aucun appel réseau). */
  buildSend(target: string, text: string, env: ChannelEnv): { url: string; init: RequestInit };

  /** Envoie réellement le message (seule fonction qui touche le réseau). */
  send(target: string, text: string, env: ChannelEnv): Promise<SendResult>;
}

/** Découpe un texte trop long selon la limite de la plateforme. */
export function splitForLimit(text: string, maxLength: number): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxLength) return [clean];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > maxLength) {
    // Coupe de préférence sur un saut de ligne, sinon sur un espace, sinon net.
    const slice = rest.slice(0, maxLength);
    const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '));
    const at = cut > maxLength * 0.5 ? cut + 1 : maxLength;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
