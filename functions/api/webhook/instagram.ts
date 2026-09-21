interface Env {
  FIREBASE_SERVICE_ACCOUNT?: string;
  GEMINI_API_KEY?: string;
  INSTAGRAM_VERIFY_TOKEN?: string;
}

// Helper pour encoder en Base64Url (pour JWT Google)
function base64url(source: ArrayBuffer | string): string {
  let encoded = "";
  if (typeof source === "string") {
    encoded = btoa(unescape(encodeURIComponent(source)));
  } else {
    const bytes = new Uint8Array(source);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    encoded = btoa(binary);
  }
  return encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Convertit une clé privée PEM en CryptoKey pour Web Crypto API
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.substring(
    pem.indexOf(pemHeader) + pemHeader.length,
    pem.indexOf(pemFooter)
  ).replace(/\s/g, "");
  
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Génère un Access Token Google Admin pour Cloudflare Workers
async function getGoogleAccessToken(serviceAccountJson: string): Promise<{ accessToken: string; projectId: string }> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaimSet = base64url(JSON.stringify(claimSet));
  const unsignedToken = `${encodedHeader}.${encodedClaimSet}`;

  const cryptoKey = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64url(signature)}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const tokenData = await tokenResp.json() as any;
  return { accessToken: tokenData.access_token, projectId: sa.project_id };
}

// Récupère l'intégration Instagram dans Firestore via REST API Admin
async function getIntegrationAdmin(recipientId: string, serviceAccountJson: string) {
  const { accessToken, projectId } = await getGoogleAccessToken(serviceAccountJson);
  
  // Requête StructuredQuery dans Firestore
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "instagram_integrations" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "instagramUserId" },
          op: "EQUAL",
          value: { stringValue: recipientId }
        }
      },
      limit: 1
    }
  };

  const resp = await fetch(firestoreUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(queryBody)
  });

  const results = await resp.json() as any[];
  if (!results || results.length === 0 || !results[0].document) {
    return null;
  }

  const fields = results[0].document.fields;
  return {
    accessToken: fields.accessToken?.stringValue,
    accountName: fields.accountName?.stringValue,
    systemPrompt: fields.systemPrompt?.stringValue || "Tu es un assistant virtuel serviable."
  };
}

// Envoie la réponse de l'IA sur Instagram
async function sendInstagramMessage(recipientId: string, text: string, accessToken: string) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${accessToken}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });
}

// --- CLOUDFLARE FUNCTIONS HANDLERS ---

// Validation du Webhook (GET)
export async function onRequestGet(context: { request: Request; env: Env }) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = context.env.INSTAGRAM_VERIFY_TOKEN || "jawebflow_secret_token";

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Reception des DMs (POST)
export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json() as any;

    if (body.object === "instagram") {
      for (const entry of body.entry || []) {
        for (const messagingEvent of entry.messaging || []) {
          const senderId = messagingEvent.sender?.id;
          const recipientId = messagingEvent.recipient?.id;
          const messageText = messagingEvent.message?.text;

          // On ignore les échos de messages envoyés par le bot lui-même
          if (messagingEvent.message?.is_echo || !messageText) continue;

          // 1. Lecture Admin dans Firestore
          const saJson = context.env.FIREBASE_SERVICE_ACCOUNT;
          if (!saJson) {
            console.error("FIREBASE_SERVICE_ACCOUNT manquant.");
            continue;
          }

          const integration = await getIntegrationAdmin(recipientId, saJson);
          if (!integration || !integration.accessToken) {
            console.log(`Aucune intégration trouvée pour recipientId: ${recipientId}`);
            continue;
          }

          // 2. Génération de la réponse via Gemini API
          const geminiApiKey = context.env.GEMINI_API_KEY;
          let replyText = "Désolé, je rencontre une petite difficulté technique.";

          if (geminiApiKey) {
            const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  { role: "user", parts: [{ text: `${integration.systemPrompt}\n\nClient: ${messageText}` }] }
                ]
              })
            });
            const geminiData = await geminiResp.json() as any;
            replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || replyText;
          }

          // 3. Envoi du message réponse sur Instagram
          await sendInstagramMessage(senderId, replyText, integration.accessToken);
        }
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error: any) {
    console.error("Erreur Webhook:", error);
    return new Response("EVENT_RECEIVED", { status: 200 }); // Toujours répondre 200 à Meta
  }
}
