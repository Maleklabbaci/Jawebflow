/**
 * JAWEBFLOW — Onglet "Apprentissage" du dashboard commerçant.
 * GET  ?assistantId=  : liste les questions sans réponse (open en premier).
 * POST { assistantId, questionId, answer, title } : le commerçant fournit la
 *      bonne réponse → note de connaissance créée + question marquée résolue.
 * Accès protégé : jeton Supabase + vérification que l'assistant appartient
 * bien à l'utilisateur connecté (comme /api/leads).
 */
import {
  verifySupabaseIdToken,
  supabaseGetAssistant,
  supabaseListLearningQuestions,
  supabaseResolveLearningQuestion,
  supabaseAddKnowledgeNote,
  supabaseConfigured,
} from '../_shared/supabase.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

async function ownerOnly(env, request, assistantId) {
  const caller = await verifySupabaseIdToken(env, request.headers.get('Authorization'));
  if (!caller) return { error: 'Authentification requise', status: 401 };
  const assistant = await supabaseGetAssistant(env, assistantId);
  if (!assistant.ok || assistant.data?.user_id !== caller.uid) {
    return { error: 'Accès refusé à cet assistant', status: 403 };
  }
  return { ok: true };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestGet(context) {
  try {
    const env = context.env;
    if (!supabaseConfigured(env)) {
      return new Response(JSON.stringify({ questions: [] }), { status: 200, headers: cors });
    }
    const url = new URL(context.request.url);
    const assistantId = String(url.searchParams.get('assistantId') || '').trim();
    if (!assistantId) {
      return new Response(JSON.stringify({ error: 'assistantId requis' }), { status: 400, headers: cors });
    }

    const guard = await ownerOnly(env, context.request, assistantId);
    if (guard.error) return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: cors });

    const questions = await supabaseListLearningQuestions(env, assistantId);
    return new Response(JSON.stringify({ questions }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[learning] erreur GET', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  try {
    const env = context.env;
    const body = await context.request.json().catch(() => ({}));
    const { assistantId, questionId, answer, title, question } = body || {};

    if (!assistantId || !questionId || !String(answer || '').trim()) {
      return new Response(JSON.stringify({ error: 'assistantId, questionId et answer requis' }), { status: 400, headers: cors });
    }
    if (!supabaseConfigured(env)) {
      return new Response(JSON.stringify({ error: 'Service non configuré' }), { status: 503, headers: cors });
    }

    const guard = await ownerOnly(env, context.request, assistantId);
    if (guard.error) return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: cors });

    const noteTitle = String(title || question || 'Réponse apprise').trim();
    const added = await supabaseAddKnowledgeNote(env, assistantId, {
      title: noteTitle,
      content: String(answer).trim(),
    });
    if (!added) {
      return new Response(JSON.stringify({ error: "Impossible d'ajouter la note de connaissance" }), { status: 502, headers: cors });
    }

    await supabaseResolveLearningQuestion(env, questionId, String(answer).trim());
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[learning] erreur POST', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
