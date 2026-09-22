/**
 * JAWEBFLOW — Lecture des prospects d'un assistant (remplace l'écoute
 * temps réel Firestore `onSnapshot`, impossible côté client avec Supabase
 * car la table `prospects` est en RLS service_role uniquement).
 * Le frontend fait du polling (setInterval) sur cet endpoint.
 */
import { verifySupabaseIdToken, supabaseGetAssistant, supabaseListProspects } from '../_shared/supabase.ts';

export async function onRequestGet(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const env = context.env;
    const url = new URL(context.request.url);
    const assistantId = String(url.searchParams.get('assistantId') || '').trim();
    if (!assistantId) {
      return new Response(JSON.stringify({ error: 'assistantId requis' }), { status: 400, headers: cors });
    }

    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Authentification requise' }), { status: 401, headers: cors });
    }

    // Vérifie que l'assistant appartient bien à l'appelant avant de renvoyer ses prospects.
    const assistant = await supabaseGetAssistant(env, assistantId);
    if (!assistant.ok || assistant.data?.user_id !== caller.uid) {
      return new Response(JSON.stringify({ error: 'Accès refusé à cet assistant' }), { status: 403, headers: cors });
    }

    const prospects = await supabaseListProspects(env, assistantId);
    return new Response(JSON.stringify({ prospects }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[leads] erreur', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
