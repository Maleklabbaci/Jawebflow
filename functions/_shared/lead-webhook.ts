/**
 * JAWEBFLOW — Envoi d'un « webhook » vers l'outil du marchand (CRM, Google Sheets,
 * Zapier, Make, n8n…) :
 *   • testWebhook : bouton « Tester la connexion » du tableau de bord ;
 *   • forwardLead : chaque nouveau client intéressé (site web ou Instagram) est
 *     transmis automatiquement à l'adresse enregistrée.
 */
import { supabaseConfigured, supabaseGetAssistant } from './supabase.ts';
import { checkPublicHttpUrl } from './safe-url.ts';

export interface WebhookOutcome {
  success: boolean;
  status: number;
  statusText: string;
  responseTimeMs: number;
  message: string;
  details?: string;
  responseBody?: string;
}

const TIMEOUT_MS = 8000;

export async function postJson(rawUrl: string, payload: unknown, event: string): Promise<WebhookOutcome> {
  const checked = checkPublicHttpUrl(rawUrl);
  if (checked.ok === false) {
    return { success: false, status: 0, statusText: 'Adresse refusée', responseTimeMs: 0, message: checked.reason };
  }
  const started = Date.now();
  try {
    const res = await fetch(checked.url.toString(), {
      method: 'POST',
      redirect: 'manual', // on ne suit pas les redirections (sécurité) : on les signale
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'JawebFlow-Webhook/1.0',
        'X-JawebFlow-Event': event,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    const body = (await res.text().catch(() => '')).slice(0, 2000);
    if (res.status >= 200 && res.status < 300) {
      return {
        success: true,
        status: res.status,
        statusText: res.statusText || 'OK',
        responseTimeMs: ms,
        message: `Ton outil a bien reçu le message (réponse ${res.status} en ${ms} ms).`,
        responseBody: body,
      };
    }
    const redirect = res.status >= 300 && res.status < 400;
    return {
      success: false,
      status: res.status,
      statusText: res.statusText || 'Erreur',
      responseTimeMs: ms,
      message: redirect
        ? `Ton adresse redirige ailleurs (code ${res.status}). Utilise l’adresse finale, celle où la redirection arrive.`
        : res.status === 404
          ? 'Ton outil répond « introuvable » (404) : vérifie l’adresse.'
          : res.status === 401 || res.status === 403
            ? `Ton outil refuse l’accès (code ${res.status}) : l’adresse demande peut-être une clé secrète.`
            : `Ton outil a répondu par une erreur (code ${res.status}).`,
      responseBody: body,
    };
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return {
      success: false,
      status: 0,
      statusText: timeout ? 'Délai dépassé' : 'Injoignable',
      responseTimeMs: Date.now() - started,
      message: timeout
        ? `Ton outil n’a pas répondu en ${TIMEOUT_MS / 1000} secondes.`
        : 'Impossible de joindre cette adresse : vérifie qu’elle est correcte et que ton outil est en ligne.',
      details: String(e?.message || e).slice(0, 200),
    };
  }
}

const recentlyForwarded = new Map<string, number>();

/**
 * Transmet un nouveau client intéressé à l'adresse webhook de l'assistant (si le
 * marchand en a enregistré une). Jamais bloquant : une erreur ici ne doit pas
 * gêner la conversation. Un même client n'est pas renvoyé en boucle (10 min).
 */
export async function forwardLead(
  env: any,
  assistantId: string,
  lead: { name?: string; phone?: string; city?: string; email?: string; need?: string; source: string; contactKey?: string },
): Promise<void> {
  try {
    if (!assistantId || !supabaseConfigured(env)) return;
    const key = `${assistantId}:${lead.phone || lead.email || lead.contactKey || ''}`;
    const last = recentlyForwarded.get(key) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return;

    const a = await supabaseGetAssistant(env, assistantId);
    if (!a.ok) return;
    const url = String(a.data?.config?.webhookUrl || '').trim();
    if (!url) return;
    recentlyForwarded.set(key, Date.now());

    const now = new Date().toISOString();
    const result = await postJson(
      url,
      {
        event: 'lead.captured',
        deliveryId: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: now,
        source: 'JawebFlow',
        assistant: { id: assistantId, businessName: a.data?.business_name || a.data?.config?.businessName || '' },
        data: {
          fullName: lead.name || '',
          email: lead.email || '',
          phone: lead.phone || '',
          city: lead.city || '',
          need: lead.need || '',
          channel: lead.source,
          capturedAt: now,
        },
      },
      'lead.captured',
    );
    if (!result.success) console.warn(`[webhook-client] envoi du lead refusé (${result.status}) : ${result.message}`);
  } catch (e: any) {
    console.warn('[webhook-client] transmission du lead impossible:', e?.message || e);
  }
}

/**
 * Comme forwardLead, mais sans jamais ralentir la réponse au client :
 *  • avec `waitUntil` (Cloudflare) : s'exécute en arrière-plan ;
 *  • sinon : on attend au plus 2,5 s (le reste continue tout seul).
 */
export function forwardLeadInBackground(
  env: any,
  assistantId: string,
  lead: Parameters<typeof forwardLead>[2],
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<unknown> | void {
  const work = forwardLead(env, assistantId, lead);
  if (typeof waitUntil === 'function') {
    waitUntil(work);
    return;
  }
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2500))]);
}
