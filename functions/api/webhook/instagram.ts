interface Env {
  FIREBASE_SERVICE_ACCOUNT?: string;
  GEMINI_API_KEY?: string;
  INSTAGRAM_VERIFY_TOKEN?: string;
}

// Convertit une chaîne/buffer en Base64Url
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

// Importe la clé privée PEM dans le moteur Web Crypto de Cloudflare
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

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

// Génère un token d'accès Admin pour Google / Firestore via la clé de compte de service
async function getGoogleAccessToken(saJson: string): Promise<{ accessToken: string; projectId: string }> {
  const sa = JSON.parse(saJson);
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
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error(`Erreur Authentification Google: ${JSON.stringify(tokenData)}`);
  }
  return { accessToken: tokenData.access_token, projectId: sa.project_id };
}

// Interroge Firestore en mode Admin pour récupérer l'accès et les réglages de l'assistant
async function getInstagramDataAdmin(recipientId: string, saJson: string) {
  const { accessToken, projectId } = await getGoogleAccessToken(saJson);

  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const queryResp = await fetch(queryUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
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
    })
  });

  const results = await queryResp.json() as any[];
  if (!results || results.length === 0 || !results[0].document) {
    console.error(`[Webhook Admin] Aucune intégration trouvée pour l'ID Instagram: ${recipientId}`);
    return null;
  }

  const fields = results[0].document.fields || {};
  const igAccessToken = fields.accessToken?.stringValue;
  const assistantId = fields.assistantId?.stringValue;

  if (!igAccessToken) return null;

  let systemPrompt = "Tu es un assistant IA serviable et professionnel répondant sur Instagram Direct.";

  if (assistantId) {
    try {
      const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/assistants/${assistantId}`;
      const docResp = await fetch(docUrl, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (docResp.ok) {
        const docData = await docResp.json() as any;
        const aFields = docData.fields || {};
        const bName = aFields.businessName?.stringValue || "l'entreprise";
        const bDesc = aFields.businessDescription?.stringValue || "";
        const tone = aFields.assistantTone?.stringValue || "chaleureux et professionnel";

        systemPrompt = `Tu es l'assistant virtuel officiel de "${bName}".
Description du business : ${bDesc}.
Ton style de réponse : ${tone}.
Consignes : Réponds aux questions des clients de manière claire, concise, courtoise et engageante. Utilise des emojis adaptés.`;
      }
    } catch (e) {
      console.error("Erreur lecture assistant:", e);
    }
  }

  return { accessToken: igAccessToken, systemPrompt };
}

// Envoi du message réponse vers l'API Instagram Direct
async function sendInstagramMessage(recipientId: string, text: string, accessToken: string) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });
  const data = await res.json() as any;
  return { status: res.status, data };
}

// --- ENDPOINTS CLOUDFLARE FUNCTIONS ---

// Gestion des requêtes OPTIONS (CORS) - CORRIGE L'ERREUR DE DÉPLOIEMENT
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

// Validation du Webhook par Meta (GET)
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

// Réception des messages Instagram Direct (POST)
export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json() as any;

    if (body.object === "instagram") {
      for (const entry of body.entry || []) {
        for (const messagingEvent of entry.messaging || []) {
          const senderId = messagingEvent.sender?.id;
          const recipientId = messagingEvent.recipient?.id;
          const messageText = messagingEvent.message?.text;

          // Ignorer les échos ou événements sans texte
          if (messagingEvent.message?.is_echo || !messageText) continue;

          const saJson = context.env.FIREBASE_SERVICE_ACCOUNT;
          if (!saJson) {
            console.error("Variable FIREBASE_SERVICE_ACCOUNT manquante.");
            continue;
          }

          // 1. Récupération Admin des données de connexion
          const igData = await getInstagramDataAdmin(recipientId, saJson);
          if (!igData || !igData.accessToken) continue;

          // 2. Génération de la réponse Gemini IA
          let replyText = "Bonjour ! Comment puis-je vous aider aujourd'hui ?";
          const geminiApiKey = context.env.GEMINI_API_KEY;

          if (geminiApiKey) {
            try {
              const geminiResp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: "user",
                        parts: [{ text: `${igData.systemPrompt}\n\nClient: ${messageText}` }]
                      }
                    ]
                  })
                }
              );
              const geminiData = await geminiResp.json() as any;
              const generated = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (generated) replyText = generated;
            } catch (gErr) {
              console.error("Erreur Gemini API:", gErr);
            }
          }

          // 3. Envoi du message sur Instagram Direct
          await sendInstagramMessage(senderId, replyText, igData.accessToken);
        }
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error: any) {
    console.error("Erreur dans le Webhook Instagram:", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}

export default { onRequestPost, onRequestGet, onRequestOptions };
