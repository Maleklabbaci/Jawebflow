/**
 * JAWEBFLOW — Les publications du compte Instagram du marchand (sélecteur
 * « sous quelle publication ? » des automatisations).
 *
 *   GET /api/instagram/media[?after=curseur]
 *
 * Le jeton Instagram reste côté serveur : le navigateur ne le voit jamais.
 */
import { listMedia } from '../../_shared/ig-api.ts';
import { getMerchantInstagram, json, requireUser } from '../../_shared/ig-http.ts';

export async function onRequestGet(context: { request: Request; env: any }) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;

  const ig = await getMerchantInstagram(context.env, user.uid);
  if (!ig) return json({ error: 'Connecte d’abord ton compte Instagram (onglet Instagram).', kind: 'not_connected' }, 409);

  const after = new URL(context.request.url).searchParams.get('after') || undefined;
  const result = await listMedia(ig.token, { limit: 24, after });
  if (!result.ok) {
    return json({ error: result.error?.message || 'Instagram ne répond pas pour le moment.', kind: result.error?.kind || 'unknown' }, 502);
  }
  return json({ media: result.media, next: result.next });
}
