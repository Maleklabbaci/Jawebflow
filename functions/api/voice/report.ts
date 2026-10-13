/**
 * JAWEBFLOW — POST /api/voice/report
 * ============================================================================
 * Fin d'appel : on range la durée et les tokens réellement consommés dans
 * `conversation_contexts` (canal « voice »), exactement comme un échange écrit.
 *
 * Pourquoi c'est important : le plafond de coût mensuel du marchand
 * (Basic 3 $ · Pro 9 $ · Enterprise 30 $) et son quota de conversations se
 * calculent sur cette table. Sans ce relevé, la voix serait invisible — donc
 * gratuite pour le visiteur et payée par le marchand sans qu'il le sache.
 *
 * Le navigateur est la seule source possible pour la durée (l'audio ne passe
 * pas par nos serveurs) : les valeurs sont donc bornées, jamais crues sur
 * parole, et une IP ne peut pas inonder la table.
 */

import { supabaseConfigured, supabaseGetAssistant } from '../../_shared/supabase.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';
import { supabaseLogConversation } from '../../_shared/limits.ts';
import { MAX_SESSION_SECONDS } from '../../_shared/voice/live.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

/** Bornes : on préfère perdre un peu de précision que fausser une facture. */
const MAX_TOKENS = 400_000;

const clampInt = (value: unknown, min: number, max: number): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  try {
    const body = await context.request.json().catch(() => ({}));
    const assistantId = String(body.assistantId || '').trim();
    if (!assistantId) return json({ ok: false, error: 'assistantId requis' }, 400);
    if (!supabaseConfigured(env)) return json({ ok: false, error: 'Base non configurée' }, 503);

    const ip =
      context.request.headers.get('CF-Connecting-IP') ||
      context.request.headers.get('x-forwarded-for') ||
      'inconnue';
    if (rateLimited(`voice-report:${ip}`, { max: 30, windowMs: 10 * 60_000 })) {
      return json({ ok: false, error: 'Trop de relevés' }, 429);
    }

    const assistant = await supabaseGetAssistant(env, assistantId);
    if (!assistant?.data) return json({ ok: false, error: 'Assistant introuvable' }, 404);

    const seconds = clampInt(body.seconds, 0, MAX_SESSION_SECONDS);
    const tokensIn = clampInt(body.tokensIn, 0, MAX_TOKENS);
    const tokensOut = clampInt(body.tokensOut, 0, MAX_TOKENS);
    const transcript = String(body.transcript || '').slice(0, 4000);
    const sessionId = String(body.sessionId || '').trim().slice(0, 80) || 'voice_session';
    const minutes = Math.max(1, Math.round(seconds / 60));

    await supabaseLogConversation(env, {
      assistantId,
      channel: 'voice',
      sessionId,
      message: `Appel vocal — ${minutes} min (${seconds} s)`,
      response: transcript || 'Appel vocal sans transcription.',
      tokensIn,
      tokensOut,
      model: String(body.model || '').slice(0, 60) || undefined,
      // Un appel = une conversation du forfait, comme un échange écrit. Le
      // plafond de coût (tokens) reste, lui, le vrai garde-fou financier.
      weight: 1,
    });

    return json({ ok: true, seconds, minutes });
  } catch (e) {
    console.error('[voice/report]', e);
    return json({ ok: false, error: 'Relevé impossible' }, 500);
  }
}
