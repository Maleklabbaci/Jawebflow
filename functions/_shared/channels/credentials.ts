/**
 * JAWEBFLOW — VÉRIFICATION DES IDENTIFIANTS D'UN CANAL
 * ============================================================================
 * Personne ne veut coller un jeton et découvrir trois jours plus tard que rien
 * ne marche. Avant d'enregistrer une connexion, on appelle la plateforme pour
 * vérifier que le jeton est valide **et qu'il correspond bien au compte
 * annoncé** — le cas le plus fréquent d'erreur étant un jeton de la mauvaise
 * page (ou du mauvais numéro).
 *
 * Renvoie toujours un message en français, lisible par le marchand : c'est ce
 * texte qui s'affiche dans le tableau de bord.
 */

import type { ChannelEnv, ChannelId } from './types.ts';

export interface CredentialCheck {
  ok: boolean;
  /** Message affiché au marchand (succès comme échec). */
  message: string;
  /** Nom du compte côté plateforme, s'il est connu. */
  accountName?: string;
  /**
   * `false` = la plateforme ne permet pas de tester (TikTok avant l'accès) :
   * on enregistre quand même, en le disant clairement.
   */
  verified: boolean;
}

export interface Credentials {
  accountId: string;
  token: string;
}

const GRAPH = 'https://graph.facebook.com/v23.0';

async function getJson(url: string, token?: string): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: { message: (e as Error)?.message || String(e) } } };
  }
}

/** Cause lisible d'un refus Meta (jeton expiré, permission manquante…). */
function metaError(data: any, fallback: string): string {
  const e = data?.error;
  if (!e) return fallback;
  const msg = String(e.message || fallback);
  if (e.code === 190) return `Jeton expiré ou révoqué (Meta) : ${msg}`;
  if (e.code === 200 || e.code === 10) return `Permissions insuffisantes (Meta) : ${msg}`;
  return `Meta a refusé : ${msg}`;
}

/**
 * Teste les identifiants d'un canal. Ne lève jamais : renvoie un verdict.
 */
export async function verifyChannelCredentials(
  channel: ChannelId | string,
  creds: Credentials,
  env: ChannelEnv = {},
): Promise<CredentialCheck> {
  const token = String(creds.token || '').trim();
  const accountId = String(creds.accountId || '').trim();
  if (!token) return { ok: false, verified: false, message: 'Le jeton est vide.' };

  // ── Telegram : le jeton du bot suffit, et `getMe` dit à qui il appartient ──
  if (channel === 'telegram') {
    const { status, data } = await getJson(`https://api.telegram.org/bot${token}/getMe`);
    if (status === 401 || data?.ok === false) {
      return { ok: false, verified: false, message: `Telegram a refusé ce jeton : ${data?.description || `HTTP ${status}`}` };
    }
    if (status !== 200 || !data?.ok) {
      return { ok: false, verified: false, message: `Telegram injoignable (HTTP ${status || 'réseau'}). Réessayez dans un instant.` };
    }
    const username = data.result?.username ? `@${data.result.username}` : 'ce bot';
    if (!accountId) {
      return { ok: false, verified: true, message: `Jeton valide (${username}), mais la clé de liaison manque.` };
    }
    return { ok: true, verified: true, message: `Jeton valide : ${username}.`, accountName: username };
  }

  // ── WhatsApp : on interroge LE numéro annoncé, avec le jeton ──────────────
  if (channel === 'whatsapp') {
    if (!accountId) {
      return { ok: false, verified: false, message: "L'identifiant du numéro (Phone number ID) est requis." };
    }
    const { status, data } = await getJson(`${GRAPH}/${encodeURIComponent(accountId)}?fields=id,display_phone_number,verified_name`, token);
    if (status !== 200 || data?.error || !data?.id) {
      return { ok: false, verified: false, message: metaError(data, `Numéro introuvable avec ce jeton (HTTP ${status}).`) };
    }
    if (String(data.id) !== accountId) {
      return { ok: false, verified: true, message: `Ce jeton ne correspond pas à ce numéro (il donne accès à ${data.id}).` };
    }
    const name = data.verified_name || data.display_phone_number;
    return {
      ok: true,
      verified: true,
      message: `Numéro vérifié${name ? ` : ${name}` : ''}.`,
      accountName: name ? String(name) : undefined,
    };
  }

  // ── Messenger : un jeton de page répond `/me` avec l'identité de LA page ──
  if (channel === 'messenger') {
    const { status, data } = await getJson(`${GRAPH}/me?fields=id,name`, token);
    if (status !== 200 || data?.error || !data?.id) {
      return { ok: false, verified: false, message: metaError(data, `Page introuvable avec ce jeton (HTTP ${status}).`) };
    }
    if (accountId && String(data.id) !== accountId) {
      return {
        ok: false,
        verified: true,
        message: `Ce jeton est celui d'une autre page (${data.name || data.id}). Vérifiez l'identifiant de la page.`,
      };
    }
    return { ok: true, verified: true, message: `Page vérifiée : ${data.name || data.id}.`, accountName: data.name ? String(data.name) : undefined };
  }

  // ── TikTok : aucune API de test tant que l'accès Business Messaging n'est
  //    pas accordé. On enregistre, en le disant franchement.
  if (channel === 'tiktok') {
    return {
      ok: true,
      verified: false,
      message: "Enregistré sans test : TikTok n'expose aucun appel de vérification avant l'accès Business Messaging. Le premier message reçu confirmera la connexion.",
    };
  }

  return { ok: false, verified: false, message: `Canal inconnu : ${channel}` };
}

/** Adresse à donner à la plateforme pour qu'elle envoie les messages. */
export const WEBHOOK_PATHS: Record<string, string> = {
  messenger: '/api/webhook/messenger',
  whatsapp: '/api/webhook/whatsapp',
  telegram: '/api/webhook/telegram',
  tiktok: '/api/webhook/tiktok',
};

export const WEBHOOK_ORIGIN = 'https://jawebflow.pages.dev';

/** URL complète du webhook (celle qu'on colle dans la plateforme). */
export function webhookUrl(channel: string, accountId?: string): string {
  const path = WEBHOOK_PATHS[channel] || `/api/webhook/${channel}`;
  // Telegram et TikTok ne transmettent aucun identifiant de compte : on route
  // par une clé placée dans l'URL.
  const needsKey = channel === 'telegram' || channel === 'tiktok';
  return `${WEBHOOK_ORIGIN}${path}${needsKey && accountId ? `?key=${encodeURIComponent(accountId)}` : ''}`;
}
