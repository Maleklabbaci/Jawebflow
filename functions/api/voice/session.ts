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
  supabaseListKnowledge,
  supabaseListKnowledgeEntries,
} from '../../_shared/supabase.ts';
import { evaluateWidgetAccess } from '../../_shared/widget-access.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';
import {
  supabaseGetPlanLimits,
  supabaseCountMonthlyConversations,
  LIMIT_BLOCK_FREE,
  limitBlockReached,
  monthlyCostBlock,
} from '../../_shared/limits.ts';
import { buildVoiceSystemPrompt, voiceKnowledgeText } from '../../_shared/voice/prompt.ts';
import {
  createLiveToken,
  normalizedVoiceSettings,
  buildClientSetup,
  VOICE_NOT_ENABLED_MSG,
  VOICE_RATE_LIMITED_MSG,
} from '../../_shared/voice/live.ts';

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
    const assistant = await supabaseGetAssistant(env, assistantId);
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
    const limits = await supabaseGetPlanLimits(env);
    const limit = plan in limits ? limits[plan] : limits.free;
    if (limit === 0) return blocked(LIMIT_BLOCK_FREE, { plan, limitReached: true });
    if (typeof limit === 'number' && limit > 0) {
      const used = await supabaseCountMonthlyConversations(env, assistantId);
      if (used >= limit) return blocked(limitBlockReached(plan, limit), { plan, used, limit, limitReached: true });
    }
    const costCheck = await monthlyCostBlock(env, assistantId, plan);
    if (costCheck.exceeded) {
      return blocked(String(costCheck.msg), {
        plan,
        limitReached: true,
        costReached: true,
        costUsd: costCheck.cost,
        costCap: costCheck.cap,
      });
    }

    // 5. La voix est un choix du marchand : sans son accord explicite, silence.
    const voice = normalizedVoiceSettings(config?.widgetConfig?.voice);
    if (!voice.enabled) return blocked(VOICE_NOT_ENABLED_MSG, { voiceDisabled: true });

    // 🎙️ Le jeton, avec les consignes du marchand à l'intérieur.
    // Au téléphone l'agent a un prompt MINUSCULE : quelques règles + la base
    // de connaissance du compte, rien d'autre. Pas de culture générale, pas de
    // recherche sur Internet : s'il ne trouve pas dans ses fiches, il dit
    // qu'il ne sait pas et propose de rappeler le client.
    const knowledgeText = await loadVoiceKnowledge(env, assistantId, config);
    const opening = voice.greeting
      ? `### OUVERTURE DE L'APPEL\nCommence l'appel par ces mots, exactement : « ${String(voice.greeting).slice(0, 300)} »`
      : '';
    const systemInstruction = buildVoiceSystemPrompt(config, knowledgeText, opening);
    const live = await createLiveToken(env, {
      systemInstruction,
      voice: voice.voice,
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
      voice: voice.voice,
      expiresAt: live.expiresAt,
      maxSeconds: voice.maxSeconds,
      greeting: voice.greeting,
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

/**
 * La base de connaissance du compte, en texte compact — les trois sources dans
 * l'ordre : les fiches du compte (manuelles, scan, imports, apprentissage), les
 * notes anciennes (`knowledge_notes`), puis les pages scannées du site. Si les
 * trois sont vides, on renvoie une chaîne vide : l'agent ne saura rien et le
 * dira honnêtement au client.
 */
async function loadVoiceKnowledge(env: any, assistantId: string, config: any): Promise<string> {
  try {
    const base = await supabaseListKnowledgeEntries(env, assistantId);
    if (base.available) {
      const text = voiceKnowledgeText(base.entries);
      if (text) return text;
    }
  } catch (e) {
    console.error('[voice/session] fiches de connaissance :', e);
  }
  try {
    const notes = voiceKnowledgeText(config?.knowledgeNotes);
    if (notes) return notes;
  } catch { /* colonne jsonb absente : on continue */ }
  try {
    return voiceKnowledgeText(await supabaseListKnowledge(env, assistantId));
  } catch (e) {
    console.error('[voice/session] pages scannées :', e);
    return '';
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}
