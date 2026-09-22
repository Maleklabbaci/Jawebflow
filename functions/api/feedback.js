/**
 * JAWEBFLOW — Feedback 👍/👎 des visiteurs sur les réponses de l'IA.
 * Appelé par le widget (public/widget.js) et le widget React de démo.
 * Un 👎 alimente aussi l'onglet "Apprentissage" (question à corriger).
 */
import {
  supabaseConfigured,
  supabaseInsertFeedback,
  supabaseLogLearningQuestion,
} from '../_shared/supabase.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const env = context.env;
    const body = await context.request.json().catch(() => ({}));
    const { assistantId, rating, messageText, questionText, sessionId } = body || {};

    if (!assistantId || (rating !== 'up' && rating !== 'down')) {
      return new Response(JSON.stringify({ error: 'assistantId et rating (up|down) requis' }), { status: 400, headers: cors });
    }
    if (!supabaseConfigured(env)) {
      return new Response(JSON.stringify({ error: 'Service non configuré' }), { status: 503, headers: cors });
    }

    await supabaseInsertFeedback(env, {
      assistant_id: assistantId,
      session_id: String(sessionId || '').slice(0, 100) || null,
      rating,
      message_text: messageText || '',
    });

    // Un pouce baissé = question à corriger par le commerçant.
    if (rating === 'down') {
      await supabaseLogLearningQuestion(
        env,
        assistantId,
        questionText || '(réponse jugée insatisfaisante)',
        messageText || '',
        'thumbs_down'
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[feedback] exception', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
