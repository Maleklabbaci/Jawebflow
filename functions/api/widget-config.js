/**
 * JAWEBFLOW — Configuration publique du widget.
 *
 * Deux correctifs :
 * 1. la lecture Firestore se faisait en anonyme (`?key=`) : refusée par les
 *    règles, donc réponse vide en silence ;
 * 2. l'endpoint renvoyait TOUS les champs string du document (dont `userId`,
 *    `webhookUrl`, notes internes...) à n'importe qui. On expose désormais une
 *    liste blanche de champs réellement utiles au widget public.
 */
import { adminGetDocument } from '../_shared/google.ts';

const PUBLIC_FIELDS = ['businessName', 'businessCategory', 'businessDescription', 'websiteUrl', 'assistantTone', 'widgetId'];

export async function onRequestGet(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(context.request.url);
  const assistantId = url.searchParams.get('id');

  if (!assistantId) {
    return new Response(JSON.stringify({ error: 'Paramètre id requis' }), { status: 400, headers: cors });
  }

  const read = await adminGetDocument(context.env, `assistants/${assistantId}`);
  if (!read.ok || !read.fields) {
    return new Response(JSON.stringify({ error: 'Assistant introuvable' }), { status: 404, headers: cors });
  }

  const config = {};
  for (const key of PUBLIC_FIELDS) {
    const value = read.fields[key];
    if (value && typeof value.stringValue === 'string') config[key] = value.stringValue;
  }
  // La personnalisation de la bulle est publique par nature (couleurs, textes).
  const widgetConfig = read.fields.widgetConfig?.mapValue?.fields;
  if (widgetConfig) {
    config.widgetConfig = Object.fromEntries(
      Object.entries(widgetConfig)
        .filter(([, v]) => 'stringValue' in v || 'booleanValue' in v)
        .map(([k, v]) => [k, 'stringValue' in v ? v.stringValue : v.booleanValue])
    );
  }

  return new Response(JSON.stringify(config), { status: 200, headers: cors });
}
