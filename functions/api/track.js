/**
 * JAWEBFLOW — Capture de prospect (appelé par le widget public).
 *
 * Migré vers Supabase (table `prospects`) : écrit désormais via la clé
 * service_role côté serveur, avec fusion des champs déjà capturés (phone,
 * email, messages...) pour ne jamais écraser une donnée précédente.
 */
import { supabaseConfigured, supabaseUpsertProspect } from '../_shared/supabase.ts';

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const data = await context.request.json();
    const env = context.env;

    const assistantId = String(data.assistantId || '').trim();
    const visitorId = String(data.visitorId || '').trim();
    if (!assistantId || !visitorId) {
      return new Response(JSON.stringify({ error: 'assistantId et visitorId sont requis' }), { status: 400, headers: cors });
    }
    if (!supabaseConfigured(env)) {
      console.error('[track] Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants) : prospection non enregistrée.');
      return new Response(JSON.stringify({ error: 'Service de prospection non configuré' }), { status: 503, headers: cors });
    }

    const truncate = (value, max = 300) => String(value).slice(0, max);
    const docId = `${assistantId}_${visitorId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);

    const patch = {
      visitorId: truncate(visitorId, 200),
      status: truncate(data.status || 'nouveau', 50),
      currentPage: truncate(data.currentPage || ''),
    };
    if (data.phone) patch.phone = truncate(data.phone, 40);
    if (data.email) patch.email = truncate(data.email, 200);
    if (data.need) patch.need = truncate(data.need, 2000);
    if (data.referer) patch.referer = truncate(data.referer, 500);
    if (data.userAgent) patch.userAgent = truncate(data.userAgent, 500);
    if (data.language) patch.language = truncate(data.language, 20);
    if (Array.isArray(data.messages)) patch.messages = data.messages;

    try {
      await supabaseUpsertProspect(env, docId, assistantId, patch);
    } catch (e) {
      console.error('[track] écriture Supabase refusée', e?.message || e);
      return new Response(JSON.stringify({ error: 'Enregistrement du prospect impossible' }), { status: 502, headers: cors });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[track] erreur', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
