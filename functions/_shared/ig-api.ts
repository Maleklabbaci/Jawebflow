/**
 * JAWEBFLOW — Appels à l'API Instagram (« Instagram Login » → graph.instagram.com).
 *
 * Tout ce que le robot envoie à Instagram passe par ici :
 *   • réponse PUBLIQUE à un commentaire         POST /{comment_id}/replies
 *   • réponse PRIVÉE à un commentaire           POST /{ig_id}/messages  (recipient.comment_id)
 *   • message privé classique                   POST /{ig_id}/messages  (recipient.id)
 *   • profil d'un contact / abonné ?            GET  /{igsid}?fields=name,username,is_user_follow_business
 *   • liste des publications (sélecteur)        GET  /me/media
 *   • abonnement aux notifications              POST/GET /me/subscribed_apps
 *
 * Règles Meta à connaître (vérifiées dans la doc officielle) :
 *   • Réponse privée : UNE seule par commentaire, dans les 7 jours.
 *   • Message privé « classique » : seulement dans les 24 h qui suivent le
 *     dernier message de la personne.
 *   • Texte : 1000 octets UTF-8 maximum. Bouton : 3 maximum, 20 caractères.
 */
import { supabaseConfigured, supabaseRequest } from './supabase.ts';
import { appendLinks, byteLength, LIMITS, truncateToBytes, type LinkButton } from './ig-automation-core.ts';

export const IG_GRAPH_VERSION = 'v25.0';
export const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;

/** Notifications que JawebFlow demande à Meta (du plus complet au plus prudent). */
export const SUBSCRIBE_FIELD_SETS: string[][] = [
  ['messages', 'messaging_postbacks', 'comments'],
  ['messages', 'messaging_postbacks'],
  ['messages'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Erreurs Meta → explications en français
// ─────────────────────────────────────────────────────────────────────────────
export type MetaErrorKind =
  | 'token'
  | 'permission'
  | 'window'
  | 'already_replied'
  | 'not_found'
  | 'rate_limit'
  | 'unreachable'
  | 'invalid'
  | 'temporary'
  | 'network'
  | 'unknown';

export interface MetaError {
  kind: MetaErrorKind;
  code?: number;
  subcode?: number;
  /** Phrase prête à afficher au marchand. */
  message: string;
  /** Message d'origine de Meta (pour les journaux techniques). */
  raw: string;
  retryable: boolean;
}

const KIND_MESSAGES: Record<MetaErrorKind, string> = {
  token: 'La connexion Instagram a expiré ou a été retirée : reconnecte ton compte dans l’onglet Instagram.',
  permission: 'Instagram n’a pas autorisé cette action : reconnecte ton compte en acceptant bien « gérer les commentaires ».',
  window: 'Trop tard : Instagram n’autorise le message privé que dans les 7 jours qui suivent le commentaire.',
  already_replied: 'Un message privé a déjà été envoyé pour ce commentaire (Instagram n’en autorise qu’un).',
  not_found: 'Le commentaire n’existe plus (supprimé ou masqué).',
  rate_limit: 'Instagram a limité les envois pour le moment (trop de messages d’un coup). Ce message n’a pas été envoyé.',
  unreachable: 'Cette personne ne peut pas recevoir de message (compte bloqué, restreint ou supprimé).',
  invalid: 'Instagram a refusé le message (format non accepté).',
  temporary: 'Instagram a rencontré un problème temporaire. Ce message n’a pas été envoyé.',
  network: 'Instagram n’a pas répondu à temps. Ce message n’a peut-être pas été envoyé.',
  unknown: 'Instagram a refusé l’envoi.',
};

export function classifyMetaError(status: number, body: any, networkError?: unknown): MetaError {
  if (networkError) {
    return { kind: 'network', message: KIND_MESSAGES.network, raw: String((networkError as any)?.message || networkError).slice(0, 200), retryable: false };
  }
  const e = body?.error && typeof body.error === 'object' ? body.error : {};
  const code = Number.isFinite(Number(e.code)) ? Number(e.code) : undefined;
  const subcode = Number.isFinite(Number(e.error_subcode)) ? Number(e.error_subcode) : undefined;
  const raw = String(e.message || e.error_user_msg || body?.message || body?.raw || `HTTP ${status}`).slice(0, 300);
  const m = raw.toLowerCase();

  let kind: MetaErrorKind = 'unknown';
  if (code === 190 || code === 102 || status === 401 || /access token|session (has )?expired|token.*(invalid|expired)/.test(m)) kind = 'token';
  else if (/outside of allowed window|outside the allowed window|allowed window|more than 7 days|7 days/.test(m) || subcode === 2534022) kind = 'window';
  else if (/already|only one (message|reply)|duplicate/.test(m) && /repl|comment|message/.test(m)) kind = 'already_replied';
  else if (code === 551 || /not available right now|can'?t be reached|cannot be reached|user (has )?blocked|no matching user/.test(m)) kind = 'unreachable';
  else if (code === 100 && (subcode === 33 || /does not exist|cannot be loaded|unsupported (get|post)|object with id|invalid (comment|media)/.test(m))) kind = 'not_found';
  else if (code === 10 || code === 200 || code === 299 || code === 3 || /permission|not authorized|capability|consent/.test(m)) kind = 'permission';
  else if ([4, 17, 32, 613, 80002, 80006, 368].includes(code as number) || /rate limit|too many|request limit|temporarily blocked/.test(m)) kind = 'rate_limit';
  else if (code === 100) kind = 'invalid';
  else if (status >= 500 || code === 1 || code === 2) kind = 'temporary';

  return { kind, code, subcode, message: KIND_MESSAGES[kind], raw, retryable: kind === 'temporary' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Appel générique
// ─────────────────────────────────────────────────────────────────────────────
export interface MetaResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: MetaError;
}

interface RequestOpts {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  /** Absolu (ex. refresh_access_token n'a pas de version). */
  absolute?: boolean;
  retry?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function igRequest<T = any>(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, opts: RequestOpts = {}): Promise<MetaResult<T>> {
  const url = new URL(opts.absolute ? path : `${IG_GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const hasBody = opts.body !== undefined;

  const attempt = async (): Promise<MetaResult<T>> => {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
      if (res.ok && !(data && typeof data === 'object' && data.error)) return { ok: true, status: res.status, data };
      return { ok: false, status: res.status, data, error: classifyMetaError(res.status, data) };
    } catch (e) {
      return { ok: false, status: 0, data: null as any, error: classifyMetaError(0, null, e) };
    }
  };

  let result = await attempt();
  if (!result.ok && result.error?.retryable && opts.retry !== false) {
    await sleep(600);
    result = await attempt();
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages (texte, boutons)
// ─────────────────────────────────────────────────────────────────────────────
export type OutButton =
  | { type: 'web_url'; title: string; url: string }
  | { type: 'postback'; title: string; payload: string };

export interface OutgoingMessage {
  text: string;
  buttons?: OutButton[];
}

export const urlButtons = (buttons: LinkButton[]): OutButton[] =>
  buttons.map((b) => ({ type: 'web_url' as const, title: b.title, url: b.url }));

function templateMessage(m: OutgoingMessage) {
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: m.text.slice(0, 640),
        buttons: (m.buttons || []).slice(0, LIMITS.maxButtons).map((b) =>
          b.type === 'web_url'
            ? { type: 'web_url', url: b.url, title: b.title.slice(0, LIMITS.maxButtonTitle) }
            : { type: 'postback', title: b.title.slice(0, LIMITS.maxButtonTitle), payload: b.payload },
        ),
      },
    },
  };
}

export type MessageTarget = { recipientId: string } | { commentId: string };

export interface SendResult extends MetaResult {
  /** 'template' = avec de vrais boutons ; 'text' = texte simple (liens écrits en clair). */
  mode: 'template' | 'text';
  recipientId?: string;
  messageId?: string;
}

/**
 * Envoie un message. S'il y a des boutons, on essaie d'abord le « vrai » format
 * à boutons ; si Instagram le refuse pour une raison de FORMAT, on renvoie un
 * texte simple avec les liens écrits en clair (le client reçoit quand même tout).
 * Si le refus vient d'autre chose (jeton, délai, permission…), inutile de réessayer.
 */
export async function sendMessage(
  token: string,
  igUserId: string,
  target: MessageTarget,
  msg: OutgoingMessage,
  opts: { plainFallback?: string } = {},
): Promise<SendResult> {
  const recipient = 'commentId' in target ? { comment_id: target.commentId } : { id: target.recipientId };
  const post = (message: unknown) => igRequest(token, 'POST', `/${encodeURIComponent(igUserId || 'me')}/messages`, { body: { recipient, message } });
  const done = (r: MetaResult, mode: 'template' | 'text'): SendResult => ({
    ...r,
    mode,
    recipientId: r.data?.recipient_id,
    messageId: r.data?.message_id,
  });

  const buttons = msg.buttons || [];
  if (buttons.length && msg.text.length <= 640) {
    const r = await post(templateMessage(msg));
    if (r.ok) return done(r, 'template');
    if (r.error && r.error.kind !== 'invalid' && r.error.kind !== 'unknown') return done(r, 'template');
    console.warn('[ig-api] boutons refusés par Instagram, envoi en texte simple :', r.error?.raw);
  }
  const plain =
    opts.plainFallback ??
    appendLinks(
      msg.text,
      buttons.filter((b): b is Extract<OutButton, { type: 'web_url' }> => b.type === 'web_url').map((b) => ({ title: b.title, url: b.url })),
    );
  const r = await post({ text: byteLength(plain) > LIMITS.hardDmBytes ? truncateToBytes(plain, LIMITS.hardDmBytes) : plain });
  return done(r, 'text');
}

/** Réponse PUBLIQUE sous un commentaire. */
export function replyToComment(token: string, commentId: string, message: string) {
  return igRequest<{ id?: string }>(token, 'POST', `/${encodeURIComponent(commentId)}/replies`, { body: { message } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Profil, publications, abonnements
// ─────────────────────────────────────────────────────────────────────────────
export interface ContactProfile {
  name?: string;
  username?: string;
  isUserFollowBusiness?: boolean;
}

/** Profil d'une personne qui a ÉCRIT au compte (sinon Meta répond « consentement requis »). */
export async function getContactProfile(token: string, igsid: string): Promise<{ profile: ContactProfile | null; error?: MetaError }> {
  const r = await igRequest(token, 'GET', `/${encodeURIComponent(igsid)}`, {
    query: { fields: 'name,username,is_user_follow_business' },
    timeoutMs: 3500,
    retry: false,
  });
  if (!r.ok) return { profile: null, error: r.error };
  return {
    profile: {
      name: typeof r.data?.name === 'string' ? r.data.name : undefined,
      username: typeof r.data?.username === 'string' ? r.data.username : undefined,
      isUserFollowBusiness: typeof r.data?.is_user_follow_business === 'boolean' ? r.data.is_user_follow_business : undefined,
    },
  };
}

export interface MediaItem {
  id: string;
  caption: string;
  type: string;
  thumbnail: string;
  permalink: string;
  timestamp: string;
  comments: number;
}

export async function listMedia(token: string, opts: { limit?: number; after?: string } = {}): Promise<{ ok: boolean; media: MediaItem[]; next: string | null; error?: MetaError }> {
  const r = await igRequest(token, 'GET', '/me/media', {
    query: {
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count',
      limit: Math.min(Math.max(opts.limit || 24, 1), 50),
      after: opts.after || undefined,
    },
  });
  if (!r.ok) return { ok: false, media: [], next: null, error: r.error };
  const media: MediaItem[] = (Array.isArray(r.data?.data) ? r.data.data : []).map((m: any) => ({
    id: String(m.id),
    caption: String(m.caption || '').slice(0, 140),
    type: String(m.media_product_type === 'REELS' ? 'REEL' : m.media_type || 'IMAGE'),
    thumbnail: String(m.thumbnail_url || m.media_url || ''),
    permalink: String(m.permalink || ''),
    timestamp: String(m.timestamp || ''),
    comments: Number(m.comments_count) || 0,
  }));
  return { ok: true, media, next: r.data?.paging?.next ? String(r.data?.paging?.cursors?.after || '') || null : null };
}

export async function getSubscribedFields(token: string, igUserId?: string): Promise<{ ok: boolean; fields: string[] | null; error?: MetaError }> {
  const accountPath = igUserId ? `/${encodeURIComponent(igUserId)}` : '/me';
  const r = await igRequest(token, 'GET', `${accountPath}/subscribed_apps`);
  if (!r.ok) return { ok: false, fields: null, error: r.error };
  const entries: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
  const fields = entries.flatMap((e) => (Array.isArray(e?.subscribed_fields) ? e.subscribed_fields.map(String) : []));
  return { ok: true, fields: entries.length ? [...new Set(fields)] : [] };
}

/**
 * Abonne le compte aux notifications (messages, boutons, commentaires).
 * Essaie la liste complète ; si Meta la refuse (ex. « commentaires » pas encore
 * activés dans l'application Meta), retombe sur une liste plus courte pour ne
 * JAMAIS casser la réception des messages privés.
 */
export async function subscribeAccount(token: string, igUserId?: string): Promise<{ success: boolean; fields: string[]; status: number; data: any; error?: MetaError }> {
  let last: MetaResult | null = null;
  // Meta documente l’IG professional account ID pour cette edge. `/me` reste
  // utile pour les anciens tokens, mais peut être rejeté avec Instagram Login.
  const accountPath = igUserId ? `/${encodeURIComponent(igUserId)}` : '/me';
  for (const fields of SUBSCRIBE_FIELD_SETS) {
    const r = await igRequest(token, 'POST', `${accountPath}/subscribed_apps`, { query: { subscribed_fields: fields.join(',') } });
    last = r;
    if (r.ok && r.data?.success !== false) return { success: true, fields, status: r.status, data: r.data };
    if (r.error?.kind === 'token' || r.error?.kind === 'network') break; // inutile d'insister
  }
  return { success: false, fields: [], status: last?.status || 0, data: last?.data, error: last?.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renouvellement automatique du jeton (valable ~60 jours)
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_REFRESH_AGE_MS = 50 * 24 * 60 * 60 * 1000; // ~50 jours

/**
 * Tant que le jeton est valide, Meta permet de le renouveler. Un compte actif
 * ne se déconnecte donc jamais : on renouvelle dès que le jeton a ~50 jours,
 * et on met à jour la base. Modifie `integration.igToken` en place.
 */
export async function refreshInstagramTokenIfNeeded(
  env: any,
  integration: { igToken: string; accessToken?: string; integrationId: string; lastConnectedAt?: string },
): Promise<void> {
  try {
    if (!supabaseConfigured(env)) return;
    const last = integration.lastConnectedAt ? Date.parse(integration.lastConnectedAt) : NaN;
    if (Number.isFinite(last) && Date.now() - last < TOKEN_REFRESH_AGE_MS) return; // encore frais

    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(integration.igToken)}`,
      { method: 'GET', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      console.warn(`[instagram] renouvellement du jeton refusé (HTTP ${res.status}) — le jeton actuel reste utilisé tant qu'il est valide.`);
      return;
    }
    const data: any = await res.json().catch(() => ({}));
    if (!data?.access_token) return;

    integration.igToken = String(data.access_token);
    integration.accessToken = String(data.access_token);
    await supabaseRequest(env, `instagram_integrations?user_id=eq.${encodeURIComponent(integration.integrationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        access_token: integration.igToken,
        last_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    console.log('[instagram] jeton Meta renouvelé automatiquement (validité ~60 jours relancée, sans action du client).');
  } catch (e: any) {
    console.warn('[instagram] renouvellement du jeton impossible:', e?.message || e);
  }
}
