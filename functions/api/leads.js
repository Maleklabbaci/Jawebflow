/**
 * JAWEBFLOW — Lecture et mise à jour du suivi des prospects d'un assistant.
 * La table prospects reste en RLS service_role uniquement : l'API vérifie
 * toujours le propriétaire de l'assistant avant de renvoyer ou modifier une fiche.
 */
import {
  verifySupabaseIdToken,
  supabaseGetAssistant,
  supabaseListProspects,
  supabaseUpsertProspect,
  supabaseRequest,
} from '../_shared/supabase.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function authorize(context, assistantId) {
  const env = context.env;
  const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
  if (!caller) return { error: 'Authentification requise', status: 401 };
  const assistant = await supabaseGetAssistant(env, assistantId);
  if (!assistant.ok || assistant.data?.user_id !== caller.uid) {
    return { error: 'Accès refusé à cet assistant', status: 403 };
  }
  return { caller };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const assistantId = String(url.searchParams.get('assistantId') || '').trim();
    if (!assistantId) return new Response(JSON.stringify({ error: 'assistantId requis' }), { status: 400, headers: cors });
    const auth = await authorize(context, assistantId);
    if ('error' in auth) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: cors });

    const prospects = await supabaseListProspects(context.env, assistantId);
    return new Response(JSON.stringify({ prospects }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[leads] erreur', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erreur serveur' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const assistantId = String(body?.assistantId || '').trim();
    const prospectId = String(body?.prospectId || '').trim();
    const followUpStatus = String(body?.followUpStatus || '').trim();
    if (!assistantId || !prospectId || prospectId.length > 200) {
      return new Response(JSON.stringify({ error: 'assistantId et prospectId requis' }), { status: 400, headers: cors });
    }
    if (followUpStatus !== 'done') {
      return new Response(JSON.stringify({ error: 'Statut de suivi invalide' }), { status: 400, headers: cors });
    }
    const auth = await authorize(context, assistantId);
    if ('error' in auth) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: cors });

    const found = await supabaseRequest(
      context.env,
      `prospects?id=eq.${encodeURIComponent(prospectId)}&assistant_id=eq.${encodeURIComponent(assistantId)}&select=id`,
    );
    if (!found.ok || !((await found.json().catch(() => [])) || []).length) {
      return new Response(JSON.stringify({ error: 'Prospect introuvable' }), { status: 404, headers: cors });
    }
    const completedAt = new Date().toISOString();
    await supabaseUpsertProspect(context.env, prospectId, assistantId, {
      followUpStatus: 'done',
      followUpCompletedAt: completedAt,
      nextAction: 'Suivi terminé',
    });
    return new Response(JSON.stringify({ ok: true, prospectId, followUpStatus: 'done', completedAt }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[leads] mise à jour du suivi impossible', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erreur serveur' }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}
