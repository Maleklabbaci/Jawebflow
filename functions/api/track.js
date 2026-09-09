export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const data = await context.request.json();
    const env = context.env;
    const db = env.FIRESTORE_DATABASE_ID || '(default)';
    const docId = `${data.assistantId}_${data.visitorId}`;

    const fields = {
      assistantId: { stringValue: data.assistantId || 'asst_live' },
      visitorId: { stringValue: data.visitorId },
      status: { stringValue: data.status || 'nouveau' },
      currentPage: { stringValue: data.currentPage || '' },
      updatedAt: { stringValue: new Date().toISOString() }
    };
    if (data.phone) fields.phone = { stringValue: data.phone };
    if (data.email) fields.email = { stringValue: data.email };
    if (data.need) fields.need = { stringValue: data.need };

    await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/prospects/${docId}?key=${env.FIRESTORE_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
