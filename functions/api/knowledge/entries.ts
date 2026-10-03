/**
 * Base de connaissances relationnelle.
 * GET  ?assistantId=...            -> fiches manuelles, site, ajout éclair, appris
 * POST { assistantId, notes }      -> synchronise le miroir JSON historique
 * Toute requête est limitée au propriétaire authentifié de l'assistant.
 */
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
  supabaseListKnowledgeEntries,
  supabaseSyncKnowledgeNotes,
  verifySupabaseIdToken,
} from '../../_shared/supabase.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

async function authorize(request: Request, env: any, assistantId: string) {
  if (!supabaseConfigured(env)) return { response: json({ error: 'Base de données non configurée.' }, 501) };
  const caller = await verifySupabaseIdToken(env, request.headers.get('Authorization'));
  if (!caller?.uid) return { response: json({ error: 'Authentification requise.' }, 401) };
  if (!assistantId) return { response: json({ error: 'assistantId requis.' }, 400) };
  const result = await supabaseGetAssistant(env, assistantId);
  if (!result.ok || !result.data) return { response: json({ error: 'Assistant introuvable.' }, 404) };
  const config = supabaseAssistantRowToConfig(result.data);
  if (config.userId !== caller.uid) return { response: json({ error: 'Accès refusé.' }, 403) };
  return { caller, result };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    ...headers,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  } });
}

export async function onRequestGet(context: { request: Request; env: any }) {
  try {
    const url = new URL(context.request.url);
    const assistantId = String(url.searchParams.get('assistantId') || '').trim();
    const auth = await authorize(context.request, context.env, assistantId);
    if ('response' in auth) return auth.response;

    const config = supabaseAssistantRowToConfig(auth.result.data);
    let result = await supabaseListKnowledgeEntries(context.env, assistantId);
    let entries = result.entries;

    // Compatibilité pendant le déploiement progressif : si la table vient
    // d'être créée mais n'a pas encore été initialisée pour cet assistant,
    // on importe les fiches historiques puis on relit la source normalisée.
    const legacy = Array.isArray(config.knowledgeNotes) ? config.knowledgeNotes : [];
    if ((!result.available || entries.length === 0) && legacy.length) {
      const synced = await supabaseSyncKnowledgeNotes(context.env, assistantId, legacy);
      if (synced.ok) {
        result = await supabaseListKnowledgeEntries(context.env, assistantId);
        entries = result.entries;
      } else if (!result.available) {
        entries = legacy.map((note: any) => {
          const learned = /learn|appris|conversation|auto/i.test(String(note?.source || '')) || note?.category === 'learned';
          const approved = ['approved', 'active'].includes(String(note?.approvalStatus || note?.status || '').toLowerCase());
          return {
            ...note,
            approvalStatus: learned && !approved ? 'pending_review' : (note?.approvalStatus || 'approved'),
            enabled: learned && !approved ? false : note?.enabled !== false,
          };
        });
      }
    }

    return json({ entries, normalized: result.available });
  } catch (error: any) {
    console.error('[knowledge/entries] GET:', error?.message || error);
    return json({ error: 'Impossible de charger les informations.' }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const assistantId = String(body?.assistantId || '').trim();
    const auth = await authorize(context.request, context.env, assistantId);
    if ('response' in auth) return auth.response;
    if (!Array.isArray(body?.notes)) return json({ error: 'notes doit être une liste.' }, 400);
    if (body.notes.length > 500) return json({ error: 'La base peut contenir au maximum 500 fiches.' }, 413);

    const result = await supabaseSyncKnowledgeNotes(context.env, assistantId, body.notes);
    if (!result.ok) {
      console.error('[knowledge/entries] POST:', result.status, result.error);
      return json({ error: 'La base relationnelle n’est pas disponible. Applique la migration knowledge_entries puis réessaie.' }, 503);
    }
    return json({ ok: true, count: result.count });
  } catch (error: any) {
    console.error('[knowledge/entries] POST:', error?.message || error);
    return json({ error: 'Impossible d’enregistrer les informations.' }, 500);
  }
}
