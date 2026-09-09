export async function onRequestGet(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(context.request.url);
  const assistantId = url.searchParams.get('id') || 'asst_live';
  const env = context.env;

  try {
    const db = env.FIRESTORE_DATABASE_ID || '(default)';
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/assistants/${assistantId}?key=${env.FIRESTORE_API_KEY}`);
    const data = await res.json();
    
    // Extrait les champs simples
    const config = {};
    if (data.fields) {
      for (const [k, v] of Object.entries(data.fields)) {
        if (v.stringValue) config[k] = v.stringValue;
      }
    }
    return new Response(JSON.stringify(config), { status: 200, headers: cors });
  } catch {
    return new Response(JSON.stringify({}), { status: 200, headers: cors });
  }
}
