/**
 * JAWEBFLOW — Configuration publique du widget.
 * Supabase en priorité, Firestore en filet de sécurité. N'expose qu'une liste
 * blanche de champs réellement utiles au widget public (jamais userId,
 * webhookUrl, notes internes...).
 */
import { adminGetDocument } from '../_shared/google.ts';
import { supabaseConfigured, supabaseGetAssistant, supabaseAssistantRowToConfig } from '../_shared/supabase.ts';

function parseFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const res = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.mapValue) res[k] = parseFirestoreDoc({ fields: v.mapValue.fields });
  }
  return res;
}

export async function onRequestGet(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(context.request.url);
  const assistantId = String(url.searchParams.get('id') || '').trim();

  if (!assistantId) {
    return new Response(JSON.stringify({ error: 'Paramètre id requis' }), { status: 400, headers: cors });
  }

  let config = null;
  if (supabaseConfigured(context.env)) {
    const sb = await supabaseGetAssistant(context.env, assistantId);
    if (sb.ok) config = supabaseAssistantRowToConfig(sb.data);
  }
  if (!config) {
    const read = await adminGetDocument(context.env, `assistants/${assistantId}`);
    if (!read.ok || !read.fields) {
      return new Response(JSON.stringify({ error: 'Assistant introuvable' }), { status: 404, headers: cors });
    }
    config = parseFirestoreDoc({ fields: read.fields }) || {};
  }

  const out = {
    businessName: config.businessName || '',
    brandingEnabled: config.brandingEnabled !== false,
    whatsappEscalation: config.whatsappEscalation || '',
    widgetConfig: config.widgetConfig || {},
  };
  return new Response(JSON.stringify(out), { status: 200, headers: cors });
}
