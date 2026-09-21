import { base64 } from '../../_shared/google.ts';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Vérification de la signature Meta (HMAC-SHA256 du corps brut) : sans elle,
// n'importe qui peut POSTer de faux DM et faire répondre le bot.
async function hasValidMetaSignature(request, rawBody, appSecret) {
  if (!appSecret) return false;
  const header = request.headers.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return `sha256=${base64(digest)}` === header;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const verifyToken = context.env.INSTAGRAM_VERIFY_TOKEN || context.env.META_VERIFY_TOKEN;
  const challenge = url.searchParams.get('hub.challenge');

  if (!verifyToken) {
    console.error('[instagram] INSTAGRAM_VERIFY_TOKEN / META_VERIFY_TOKEN non configuré : vérification refusée.');
    return new Response('Webhook non configuré', { status: 503 });
  }

  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function onRequestPost(context) {
  try {
    const rawBody = await context.request.text();
    const appSecret = context.env.INSTAGRAM_APP_SECRET;

    if (appSecret) {
      if (!(await hasValidMetaSignature(context.request, rawBody, appSecret))) {
        console.warn('[instagram] signature X-Hub-Signature-256 invalide : requête rejetée.');
        return new Response('Invalid signature', { status: 401 });
      }
    } else {
      console.warn('[instagram] INSTAGRAM_APP_SECRET absent : signature Meta non vérifiable (à configurer).');
    }

    const payload = JSON.parse(rawBody || '{}');
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
      // TODO: bot Instagram non multi-tenant (pas de base de connaissance ni d'assistantId ici) — à revoir séparément
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}:generateContent?key=${geminiKey}`;
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
