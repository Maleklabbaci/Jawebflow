// 1. Validation automatique requise par Meta (GET)
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const VERIFY_TOKEN = context.env.INSTAGRAM_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new Response('Forbidden', { status: 403 });
}

// 2. Réception des DMs et réponse automatique (POST)
export async function onRequestPost(context) {
  try {
    const data = await context.request.json();

    if (data.object === 'instagram' || data.object === 'page') {
      for (const entry of data.entry || []) {
        const messaging = entry.messaging?.[0] || entry.changes?.[0]?.value;
        if (messaging && !messaging.message?.is_echo) {
          const senderId = messaging.sender?.id || messaging.from?.id;
          const userText = messaging.message?.text || messaging.text;

          if (senderId && userText) {
            // Repondre via l API Graph Meta
            const PAGE_TOKEN = context.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
            await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: senderId },
                message: { text: 'Bonjour ! Message bien reçu : ' + userText },
              }),
            });
          }
        }
      }
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
