/**
 * JAWEBFLOW — Bouton « Tester la connexion » (Mettre sur mon site → Options avancées).
 *
 *   POST /api/webhook/test-ping  { webhookUrl, testType, payload }
 *
 * Envoie un message d'essai à l'adresse du marchand (CRM, Zapier, Make…) et
 * raconte ce qui s'est passé, en français. Réservé aux marchands connectés.
 */
import { postJson } from '../../_shared/lead-webhook.ts';
import { json, requireUser } from '../../_shared/ig-http.ts';

export async function onRequestPost(context: { request: Request; env: any }) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;

  const body: any = await context.request.json().catch(() => ({}));
  const webhookUrl = String(body?.webhookUrl || '');
  const testType = body?.testType === 'lead_test' ? 'lead_test' : 'ping';
  const event = testType === 'lead_test' ? 'lead.captured.test' : 'webhook.ping';

  // Le message d'essai vient de l'écran du marchand, mais reste borné (taille, forme).
  let payload: unknown = body?.payload;
  const size = (() => { try { return JSON.stringify(payload ?? null).length; } catch { return Infinity; } })();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || size > 20_000) {
    payload = { event, timestamp: new Date().toISOString(), source: 'JawebFlow Platform Webhook Verifier', data: { test: true } };
  }

  const outcome = await postJson(webhookUrl, payload, event);
  return json({ ...outcome, sentPayload: payload }, 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
