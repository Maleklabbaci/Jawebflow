/**
 * JAWEBFLOW — POST /api/voice/session
 * ============================================================================
 * Le visiteur appuie sur le micro : on vérifie que l'appel est autorisé, puis
 * on renvoie au navigateur un **jeton éphémère** Gemini Live (2 minutes pour
 * démarrer, un seul usage). La clé Gemini reste ici, côté serveur.
 *
 * Ce qui est vérifié AVANT d'ouvrir quoi que ce soit (dans cet ordre) :
 *   0. anti-abus : 6 appels maximum par IP et par tranche de 10 minutes ;
 *   1. l'assistant existe et le widget a le droit d'être là (clé + domaine) ;
 *   2. le forfait du marchand est actif (sinon message clair au visiteur) ;
 *   3. le quota mensuel de conversations n'est pas atteint ;
 *   4. le plafond de coût réel du mois n'est pas atteint ;
 *   5. la voix est autorisée sur ce widget ET pour ce forfait.
 */

import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
} from '../../_shared/supabase.ts';
import { evaluateWidgetAccess } from '../../_shared/widget-access.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';
import {
  supabaseGetPlanLimits,
  supabaseCountMonthlyConversations,
  supabaseGetMonthlyCostUsd,
  COST_CAP_USD_PER_PLAN,
  costCapReachedMsg,
  LIMIT_BLOCK_FREE,
  limitBlockReached,
} from '../../_shared/limits.ts';
import { buildVoiceSystemPrompt } from '../../_shared/voice/prompt.ts';
import {
  createLiveToken,
  normalizedVoiceSettings,
  buildClientSetup,
  VOICE_NOT_ENABLED_MSG,
  VOICE_RATE_LIMITED_MSG,
} from '../../_shared/voice/live.ts';
import { liveTools } from '../../_shared/voice/mission.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

/** Réponse « métier » : le visiteur voit un message, pas une erreur technique. */
const blocked = (message: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, blocked: true, error: message, message, ...extra });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  try {
    const body = await context.request.json().catch(() => ({}));
    const assistantId = String(body.assistantId || '').trim();
    const origin = String(body.origin || context.request.headers.get('Origin') || '').trim();
    const widgetKey = body.widgetKey;
    const sessionId = String(body.sessionId || '').trim().slice(0, 80);

    if (!assistantId) return json({ ok: false, error: 'assistantId requis' }, 400);
    if (!supabaseConfigured(env)) {
      return json({ ok: false, error: "L'assistant n'est pas encore relié à sa base." }, 503);
    }

    // 0. Anti-abus : un appel coûte de l'argent au marchand. Six par IP et par
    //    dizaine de minutes suffisent largement à un vrai visiteur.
    const ip =
      context.request.headers.get('CF-Connecting-IP') ||
      context.request.headers.get('x-forwarded-for') ||
      'inconnue';
    if (rateLimited(`voice:${ip}:${assistantId}`, { max: 6, windowMs: 10 * 60_000 })) {
      return blocked(VOICE_RATE_LIMITED_MSG);
    }

    // 1. L'assistant + le droit du widget à être sur ce site.
    // ⏱️ Les quatre lectures partent ENSEMBLE : la durée d'un appel, c'est le
    // temps du plus lent, pas la somme de quatre allers-retours Supabase. (Avant,
    // l'assistant, les forfaits, le compteur du mois et la facture étaient lus
    // l'un après l'autre : 300 à 500 ms de plus avant même de parler à Google.)
    const [assistant, limits, used, costUsd] = await Promise.all([
      supabaseGetAssistant(env, assistantId),
      supabaseGetPlanLimits(env),
      supabaseCountMonthlyConversations(env, assistantId),
      supabaseGetMonthlyCostUsd(env, assistantId),
    ]);
    const row = assistant?.data;
    if (!row) return json({ ok: false, error: 'Assistant introuvable' }, 404);
    const config = supabaseAssistantRowToConfig(row);
    const access = evaluateWidgetAccess(config, { key: widgetKey, origin });
    if (!access.allowed) {
      return json(
        { ok: false, error: access.reason === 'key' ? 'Clé de widget invalide' : 'Domaine non autorisé' },
        403
      );
    }

    // 2-4. Mêmes règles que le chat écrit : un appel vocal consomme le forfait
    //      ET le plafond de coût du mois, comme n'importe quelle réponse.
    const plan = String(config?.plan || 'basic').toLowerCase();
    const limit = plan in limits ? limits[plan] : limits.free;
    if (limit === 0) return blocked(LIMIT_BLOCK_FREE, { plan, limitReached: true });
    if (typeof limit === 'number' && limit > 0 && used >= limit) {
      return blocked(limitBlockReached(plan, limit), { plan, used, limit, limitReached: true });
    }
    // Mêmes règles que le chat écrit : plafond de coût réel du mois (0 = pas de
    // plafond, décision du 14/10/2026).
    const costCap = COST_CAP_USD_PER_PLAN[plan] ?? COST_CAP_USD_PER_PLAN.free;
    if (costCap && costUsd >= costCap) {
      return blocked(costCapReachedMsg(plan, costUsd, costCap), {
        plan,
        limitReached: true,
        costReached: true,
        costUsd,
        costCap,
      });
    }

    // 5. La voix est un choix du marchand : sans son accord explicite, silence.
    const voice = normalizedVoiceSettings(config?.widgetConfig?.voice);
    if (!voice.enabled) return blocked(VOICE_NOT_ENABLED_MSG, { voiceDisabled: true });

    // 🎙️ Le jeton, avec les consignes du marchand à l'intérieur.
    // Le prompt est MINUSCULE et la base de connaissance NE Y EST PLUS : elle
    // reste dans la base du compte, et l'agent la consulté à la question avec
    // l'outil `chercher_information` (le serveur ne renvoie que les lignes
    // utiles). Pas de culture générale, pas d'Internet : s'il ne trouve rien,
    // il dit qu'il ne sait pas et propose de rappeler le client.
    const opening = voice.greeting
      ? `### OUVERTURE DE L'APPEL\nCommence l'appel par ces mots, exactement : « ${String(voice.greeting).slice(0, 300)} »`
      : '';
    const systemInstruction = buildVoiceSystemPrompt(config, '', opening, {
      mission: voice.mission,
      languages: voice.languages,
      knowledge: 'search',
    });
    // `fallback: true` = le navigateur vient de se faire fermer la session juste
    // après le setup : on lui redonne un jeton sur le couple historique.
    const live = await createLiveToken(env, {
      systemInstruction,
      voice: voice.voice,
      legacy: body.fallback === true,
      // 🎯 La mission du marchand voyage avec le jeton : coordonnées du client,
      // besoin, rendez-vous… L'agent note, le marchand retrouve la fiche dans
      // ses leads (marquée « appel vocal »).
      tools: liveTools(voice.mission),
    });
    if (!live.ok || !live.token) {
      if (live.detail) console.error('[voice/session] Gemini Live :', live.detail);
      return json({ ok: false, error: live.error }, 502);
    }

    return json({
      ok: true,
      wsUrl: live.wsUrl,
      model: live.model,
      apiVersion: live.apiVersion,
      // De quoi diagnostiquer sans deviner : la porte d'entrée réellement
      // utilisée (les jetons n'en ont qu'une).
      tokenApiVersion: live.tokenApiVersion,
      method: live.method,
      voice: voice.voice,
      expiresAt: live.expiresAt,
      maxSeconds: voice.maxSeconds,
      greeting: voice.greeting,
      mission: voice.mission,
      // Le navigateur envoie ce message en ouvrant la connexion : le serveur
      // décide, le visiteur ne peut rien changer.
      setup: buildClientSetup(String(live.model), voice.voice),
      sessionId: sessionId || `voice_${randomId()}`,
    });
  } catch (e) {
    console.error('[voice/session]', e);
    return json({ ok: false, error: "L'appel vocal est momentanément indisponible." }, 500);
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}
