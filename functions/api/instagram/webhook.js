export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === context.env.INSTAGRAM_VERIFY_TOKEN) {
    return new Response(url.searchParams.get('hub.challenge'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    if (payload.object === 'instagram' || payload.object === 'page') {
      context.waitUntil(handleMessages(payload, context.env));
      return new Response('{"status":"ok"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Not Found', { status: 404 });
  } catch {
    return new Response('{"status":"ok"}', { status: 200 });
  }
}

async function handleMessages(payload, env) {
  const pageToken = env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const geminiKey = env.GEMINI_API_KEY;
  if (!pageToken || !geminiKey) return;

  for (const entry of payload.entry || []) {
    const messaging = entry.messaging?.[0] || entry.changes?.[0]?.value;
    if (!messaging || messaging.message?.is_echo) continue;

    const senderId = messaging.sender?.id || messaging.from?.id;
    const text = messaging.message?.text || '';
    if (!senderId || !text) continue;

    try {
      // 1. Indicateur "En train d'écrire..."
      await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, sender_action: 'typing_on' })
      });

      // 2. Appel IA Gemini avec Derja / Français
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const gRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Tu es un vendeur officiel en DM Instagram pour une entreprise algérienne. Réponds de manière très courte, polie et engageante en Derja ou Français avec quelques emojis 🇩🇿✨." }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
        })
      });
      const gData = await gRes.json();
      const reply = gData.candidates?.[0]?.content?.parts?.[0]?.text || "Saha kho ! Kifach n9der n3awnek douka ? ✨";

      // 3. Envoi du DM
      await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text: reply } })
      });
    } catch (e) {
      console.error(e);
    }
  }
}
