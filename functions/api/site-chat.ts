/**
 * JAWEBFLOW — LE CHATBOT DU SITE VITRINE (API PUBLIQUE)
 * ============================================================================
 * GET  /api/site-chat   → les réglages PUBLICS de la bulle (aucune donnée interne)
 * POST /api/site-chat   → une réponse du chatbot à une question de visiteur
 *
 * Qui appelle quoi :
 *   • `src/components/FloatingLiveWidget.tsx` (site vitrine) fait le GET au
 *     chargement, puis un POST à chaque message ;
 *   • la console admin (`/api/admin/site-chat`) écrit les réglages.
 *
 * Ce que cette route ne fait JAMAIS :
 *   • deviner un prix : la connaissance vient des réglages écrits à la main ;
 *   • répondre sans clé Gemini : dans ce cas elle renvoie la phrase de secours
 *     réglée dans la console (le visiteur a toujours une réponse utile) ;
 *   • laisser un robot vider le quota : 20 messages / 10 minutes / visiteur.
 */
import {
  readSiteChatConfig,
  publicSiteChat,
  buildSiteChatPrompt,
  buildSiteChatContext,
  siteContactFacts,
} from '../_shared/site-chat.ts';
import { selectKnowledgeSections, ragReport, SITE_KB_TURN_BUDGET_CHARS } from '../_shared/rag.ts';
import { isOffTopicQuestion, questionIsVague } from '../_shared/prompt.ts';
import { rateLimited } from '../_shared/rate-limit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestGet(context: any) {
  const { config } = await readSiteChatConfig(context.env || {});
  return json({ ok: true, ...publicSiteChat(config) });
}

const clientIp = (request: Request) =>
  request.headers.get('CF-Connecting-IP') ||
  (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
  request.headers.get('x-real-ip') ||
  'inconnu';

export async function onRequestPost(context: any) {
  const env = context.env || {};
  const { config } = await readSiteChatConfig(env);

  if (!config.enabled) {
    return json({ ok: false, error: 'Le chat du site est fermé pour le moment.' }, 403);
  }

  const ip = clientIp(context.request);
  if (rateLimited(`site-chat:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 })) {
    return json(
      {
        ok: false,
        error: 'Trop de messages d’un coup — réessayez dans quelques minutes, ou écrivez-nous directement.',
        contact: config.contact,
      },
      429,
    );
  }

  const body = await context.request.json().catch(() => ({} as any));
  const message = String(body?.message ?? '').replace(/\u0000/g, '').trim().slice(0, 1000);
  if (!message) return json({ ok: false, error: 'Message vide.' }, 400);

  // Historique court : 6 derniers échanges, pour que le bot garde le fil.
  const history: Array<{ role: 'user' | 'model'; text: string }> = Array.isArray(body?.history)
    ? body.history
        .filter((h: any) => h && (h.role === 'user' || h.role === 'model' || h.role === 'bot'))
        .slice(-6)
        .map((h: any) => ({
          role: h.role === 'user' ? ('user' as const) : ('model' as const),
          text: String(h.text ?? '').slice(0, 800),
        }))
    : [];

  const apiKey = env.GEMINI_API_KEY;
  const model = config.ai.model || env.SITE_CHAT_MODEL || env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  // IA coupée ou clé absente : on répond avec la phrase de secours réglée dans
  // la console — jamais d'erreur brute affichée au visiteur.
  if (!config.ai.enabled || !apiKey) {
    return json({
      ok: true,
      text: config.ai.fallbackReply,
      fallback: true,
      contact: config.contact,
    });
  }

  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  // 🧠 RAG : on ne garde que les sections de la base qui parlent de la question.
  // Une base courte (le cas normal) part entière : aucun risque de perte.
  // ⚠️ Pas de cache explicite ici : le prompt du site fait ~1 300 jetons, très
  // au-dessous du plancher de Google (4 096) — le RAG est le bon levier.
  // 🚫 HORS SUJET (foot, politique, météo, culture générale…) : on n'envoie
  // AUCUN extrait de la base. Sans ça, la base entière partait avec la question
  // et l'assistant répondait « à côté » au lieu de refuser poliment.
  // Question VAGUE (« salut », « et alors ? ») : au contraire, on garde la base
  // entière — le visiteur écrit sans contexte et mérite une vraie réponse.
  const offTopic = isOffTopicQuestion(message);
  const knowledge = offTopic
    ? { text: '', kept: [], dropped: ['hors sujet'], chars: 0, omittedChars: String(config.ai.knowledge || '').length, estimatedTokens: 0, total: String(config.ai.knowledge || '').length, mode: 'relevance' as const }
    : selectKnowledgeSections(config.ai.knowledge, message, {
        budgetChars: SITE_KB_TURN_BUDGET_CHARS,
        fallbackToHead: questionIsVague(message),
        minScore: 1,
      });
  if (knowledge.omittedChars > 0) console.info(`[site-chat] ${ragReport(knowledge, 'base du site')}`);

  // 🧩 ARCHITECTURE (15/10/2026) :
  //   • instructions système = RÈGLES SEULEMENT (identité, ton, langues, interdits),
  //     jamais une donnée du commerce → texte stable, cacheable, sans fuite ;
  //   • données du client = dans LE MESSAGE, tour par tour, après sélection RAG.
  // C'est l'étanchéité par construction : chaque message ne transporte que ce que
  // la base du client a donné pour cette question-là, et rien d'autre.
  const systemPrompt = buildSiteChatPrompt(config);
  const clientContext = buildSiteChatContext(knowledge.text, siteContactFacts(config));
  const lastTurn = contents[contents.length - 1];
  if (lastTurn?.role === 'user' && Array.isArray(lastTurn.parts)) {
    lastTurn.parts.unshift({ text: `${clientContext}\n\nQUESTION DU VISITEUR :` });
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.5,
          // Réponses courtes : c'est un site vitrine, pas un roman (et c'est
          // aussi ce qui garde le coût par message sous le centime).
          maxOutputTokens: 420,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[site-chat] Gemini refusé:', res.status, detail.slice(0, 200));
      return json({ ok: true, text: config.ai.fallbackReply, fallback: true, contact: config.contact });
    }

    const data = await res.json().catch(() => null);
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim() || '';

    if (!text) {
      return json({ ok: true, text: config.ai.fallbackReply, fallback: true, contact: config.contact });
    }

    return json({ ok: true, text, model, contact: config.contact });
  } catch (err: any) {
    console.warn('[site-chat] appel impossible:', err?.message || err);
    return json({ ok: true, text: config.ai.fallbackReply, fallback: true, contact: config.contact });
  }
}
