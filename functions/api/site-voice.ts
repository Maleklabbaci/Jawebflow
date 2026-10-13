/**
 * JAWEBFLOW — POST /api/site-voice
 * ============================================================================
 * L'APPEL du site vitrine : le visiteur appuie sur le téléphone (ou le bot
 * l'appelle, en mode « voix seulement ») et il parle à l'assistant.
 *
 * Pourquoi une route à part de `/api/voice/session` (celle des clients) :
 *   • il n'y a pas de marchand derrière le site vitrine : pas de clé de widget,
 *     pas de domaine à vérifier, pas de forfait ni de quota à décompter ;
 *   • la connaissance vient de `platform_settings` (la base rédigée dans la
 *     console), pas d'un assistant ;
 *   • on garde exactement les mêmes garde-fous anti-abus : 6 appels / 10 min /
 *     IP, un jeton éphémère à usage unique, et 15 minutes maximum par appel.
 *
 * Réponse (identique au moteur d'appel `public/cdn/voice.js`) :
 *   `{ ok, wsUrl, setup, voice, maxSeconds, greeting, expiresAt, sessionId }`
 */
import { rateLimited } from '../_shared/rate-limit.ts';
import { readSiteChatConfig, buildSiteVoicePrompt, siteVoiceMaxSeconds, SITE_ASSISTANT_ID } from '../_shared/site-chat.ts';
import { createLiveToken, buildClientSetup, VOICE_RATE_LIMITED_MSG } from '../_shared/voice/live.ts';
import { liveTools } from '../_shared/voice/mission.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

/** Réponse « métier » : le visiteur voit un message, jamais une erreur technique. */
const blocked = (message: string) => json({ ok: false, blocked: true, error: message, message });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  try {
    const body = await context.request.json().catch(() => ({} as any));

    // 0. Anti-abus : un appel coûte de l'argent. Six par IP et par dizaine de
    //    minutes suffisent largement à un vrai visiteur.
    const ip =
      context.request.headers.get('CF-Connecting-IP') ||
      (context.request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'inconnue';
    if (rateLimited(`site-voice:${ip}`, { max: 6, windowMs: 10 * 60_000 })) {
      return blocked(VOICE_RATE_LIMITED_MSG);
    }

    const { config } = await readSiteChatConfig(env);

    if (!config.enabled) {
      return blocked('Le chat du site est fermé pour le moment : écrivez-nous, nous répondons tout de suite.');
    }

    const voice = config.widget.voice;
    if (!voice?.enabled) {
      return blocked("L'appel n'est pas activé sur le site : écrivez-nous dans le chat, nous répondons tout de suite.");
    }

    // `fallback: true` = le navigateur vient de se faire fermer la session juste
    // après le setup : on lui redonne un jeton sur le couple historique.
    const live = await createLiveToken(env, {
      systemInstruction: buildSiteVoicePrompt(config),
      voice: voice.voice,
      legacy: body?.fallback === true,
      // 🎯 L'agent peut NOTER la demande du visiteur (nom, téléphone, besoin) :
      // la fiche arrive dans la console. L'outil ne lui donne aucune
      // connaissance en plus — il ne sert qu'à enregistrer.
      tools: liveTools(voice.mission),
    });
    if (!live.ok || !live.token) {
      if (live.detail) console.error('[site-voice] Gemini Live :', live.detail);
      return json({ ok: false, error: live.error }, 502);
    }

    const sessionId = String(body?.sessionId || '').trim().slice(0, 80) || `site_voice_${Date.now().toString(36)}`;

    return json({
      ok: true,
      assistantId: SITE_ASSISTANT_ID,
      wsUrl: live.wsUrl,
      model: live.model,
      apiVersion: live.apiVersion,
      // De quoi diagnostiquer sans deviner : la porte d'entrée et la version du
      // service des jetons (le navigateur les affiche en cas d'échec).
      tokenApiVersion: live.tokenApiVersion,
      method: live.method,
      voice: voice.voice,
      expiresAt: live.expiresAt,
      maxSeconds: siteVoiceMaxSeconds(config),
      greeting: voice.greeting || '',
      setup: buildClientSetup(String(live.model), voice.voice),
      // Ce que l'agent doit obtenir (le CTA) : le panneau d'appel l'affiche.
      mission: voice.mission,
      sessionId,
    });
  } catch (e: any) {
    console.error('[site-voice]', e?.message || e);
    return json({ ok: false, error: "L'appel est momentanément indisponible. Écrivez-nous dans le chat." }, 500);
  }
}
