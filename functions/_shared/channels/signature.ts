/**
 * JAWEBFLOW — SIGNATURE DES WEBHOOKS META (Messenger / WhatsApp / Instagram)
 * ============================================================================
 * Meta signe chaque requête avec `X-Hub-Signature-256` : HMAC-SHA256 du corps
 * BRUT, avec l'App Secret. Le corps brut est indispensable — resérialiser le
 * JSON changerait l'empreinte.
 *
 * ⚠️ Ces fonctions échouent FERMÉ : sans secret configuré, la signature est
 * considérée invalide. Un webhook non vérifié permettrait à n'importe qui de
 * faire répondre (et dépenser) l'assistant d'un client — c'est le correctif
 * documenté dans AUDIT.md §3.4.
 */

/** Comparaison à durée constante (évite une attaque par mesure de temps). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 hexadécimal du corps, avec le secret donné. */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vérifie `X-Hub-Signature-256`. Renvoie `false` (jamais `true`) si le secret
 * est absent ou si l'en-tête ne correspond pas.
 */
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret?: string): Promise<boolean> {
  if (!appSecret) return false;
  const value = String(header || '');
  if (!value.startsWith('sha256=')) return false;
  const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
  return timingSafeEqual(expected, value);
}

/** Signature au format `sha256=<hex>` — utile pour les tests. */
export async function metaSignature(secret: string, body: string): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, body)}`;
}

/**
 * Réponse au challenge de vérification Meta (`GET ?hub.mode=subscribe…`).
 * Renvoie `null` si ce n'est pas un challenge.
 */
export function metaChallenge(
  url: URL,
  env: { INSTAGRAM_VERIFY_TOKEN?: string; META_VERIFY_TOKEN?: string; VERIFY_TOKEN?: string },
): { status: number; body: string } | null {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || challenge === null) return null;
  // Un seul jeton accepté : celui configuré. Sinon 503 (échec fermé).
  const expected = env.META_VERIFY_TOKEN || env.INSTAGRAM_VERIFY_TOKEN || env.VERIFY_TOKEN || null;
  if (!expected) return { status: 503, body: 'verify token non configuré' };
  if (token !== expected) return { status: 403, body: 'jeton de vérification invalide' };
  return { status: 200, body: challenge };
}
