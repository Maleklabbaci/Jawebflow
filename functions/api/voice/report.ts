/**
 * JAWEBFLOW — POST /api/voice/report
 * ============================================================================
 * Fin d'appel : on range la durée et les tokens réellement consommés dans
 * `conversation_contexts` (canal « voice »), exactement comme un échange écrit.
 *
 * BARÈME (décision du 14/10/2026) : 1 minute d'appel = 10 conversations, soit
 * 10 unités de quota (1 unité = 1 conversation, décision du même jour). Une
 * minute d'appel consomme donc autant de forfait que 50 messages écrits, et
 * 8 appels d'une minute valent 80 conversations — plus 1.
 *
 * Pourquoi c'est important : le quota de conversations du marchand se calcule
 * sur cette table. Sans ce relevé, la voix serait invisible — donc gratuite
 * pour le visiteur et payée par le marchand sans qu'il le sache.
 *
 * Le navigateur est la seule source possible pour la durée (l'audio ne passe
 * pas par nos serveurs) : les valeurs sont donc bornées, jamais crues sur
 * parole, et une IP ne peut pas inonder la table.
 */

import { supabaseConfigured, supabaseGetAssistant } from '../../_shared/supabase.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';
import { supabaseLogConversation } from '../../_shared/limits.ts';
import { MAX_SESSION_SECONDS } from '../../_shared/voice/live.ts';
import { SITE_ASSISTANT_ID } from '../../_shared/site-chat.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

/** Bornes : on préfère perdre un peu de précision que fausser une facture. */
const MAX_TOKENS = 400_000;

/** 1 minute d'appel = 10 conversations = 10 × 1 unité de quota. */
const WEIGHT_PER_MINUTE = 10;

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

    // 🏠 L'appel du SITE VITRINE n'a pas de marchand derrière lui : aucun quota
    // à décompter, aucune conversation à facturer. On garde seulement la trace
    // dans les logs (durée) pour pouvoir regarder la consommation réelle.
    if (assistantId === SITE_ASSISTANT_ID) {
      const siteSeconds = clampInt(body.seconds, 0, MAX_SESSION_SECONDS);
      console.log('[voice/report] appel du site vitrine :', siteSeconds, 's');
      return json({ ok: true, site: true, seconds: siteSeconds });
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
      // 1 minute = 10 unités (10 conversations). Une seconde entamée compte
      // une minute pleine (voir `minutes`), et un appel ne peut pas dépasser
      // 15 minutes : le poids maximal d'un relevé est donc 750 unités.
      weight: WEIGHT_PER_MINUTE * minutes,
    });

    return json({ ok: true, seconds, minutes });
  } catch (e) {
    console.error('[voice/report]', e);
    return json({ ok: false, error: 'Relevé impossible' }, 500);
  }
}
