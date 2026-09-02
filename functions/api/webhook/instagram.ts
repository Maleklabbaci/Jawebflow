// Cloudflare Pages Function pour valider et traiter les Webhooks Instagram Meta
import firebaseConfig from "../../../firebase-applet-config.json";

interface ProcessResult {
  status: string;
  senderId?: string;
  botReply?: string;
  metaResult?: any;
}

async function fetchFirestoreIntegration() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "instagram_integrations" }],
          limit: 5
        }
      })
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.document && item.document.fields) {
          const fields = item.document.fields;
          const token = fields.accessToken?.stringValue;
          if (token) {
            return {
              accessToken: token,
              instagramUserId: fields.instagramUserId?.stringValue,
              instagramUsername: fields.instagramUsername?.stringValue,
              pageName: fields.pageName?.stringValue || "Telya Agency",
              assistantTone: fields.assistantTone?.stringValue || "professionnel",
              customGreeting: fields.customGreeting?.stringValue || "Salam ! Bienvenue sur notre boutique.",
              autoReplyEnabled: fields.autoReplyEnabled?.booleanValue !== false
            };
          }
        }
      }
    }
  } catch (err) {
    console.error("[CF Webhook] Firestore integration lookup error:", err);
  }
  return null;
}

async function fetchAssistantKnowledge() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "assistants" }],
          limit: 3
        }
      })
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.document?.fields) {
      const f = data[0].document.fields;
      return {
        businessName: f.businessName?.stringValue || f.name?.stringValue || "Telya Agency",
        website: f.website?.stringValue || f.websiteUrl?.stringValue || "https://jawebflow.pages.dev",
        phone: f.phoneNumber?.stringValue || ""
      };
    }
  } catch (err) {
    console.error("[CF Webhook] Assistant knowledge lookup error:", err);
  }
  return {
    businessName: "Telya Agency",
    website: "https://jawebflow.pages.dev",
    phone: ""
  };
}

async function generateAiReply(userText: string, businessInfo: any): Promise<string> {
  const apiKey = "AQ.Ab8RN6K7m97nN4E7oZ3w1nK9s-"; // Platform internal or context env
  const prompt = `Tu es l'assistant IA Instagram officiel de "${businessInfo.businessName || 'notre agence'}" en Algérie.
Ton rôle : répondre avec politesse, rapidité et concision (format Instagram DM), en Français et en Darija si le client s'adresse en arabe ou darija.
Données clés :
- Site Web : ${businessInfo.website}
- Livraison : Disponible dans les 58 wilayas d'Algérie en 24h/48h.
- Paiement : À la livraison (main à main) et par BaridiMob.

Message de l'utilisateur sur Instagram : "${userText}"
Réponds directement en 1 ou 2 phrases percutantes et chaleureuses adaptées aux DM Instagram.`;

  try {
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const genRes = await fetch(genUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (genRes.ok) {
      const genData = await genRes.json();
      const text = genData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    }
  } catch (e) {
    console.warn("[CF Webhook] Gemini generation error, using smart fallback:", e);
  }

  return `Salam ! Merci pour votre message chez ${businessInfo.businessName || 'Telya Agency'}. Nous livrons dans les 58 wilayas d'Algérie sous 24h à 48h (Paiement à la livraison & BaridiMob). Découvrez nos offres sur notre site : ${businessInfo.website} ! En quoi pouvons-nous vous aider ?`;
}

async function sendMetaInstagramMessage(recipientId: string, text: string, accessToken: string) {
  // 1. Essai direct via Instagram Graph API
  try {
    const igUrl = `https://graph.instagram.com/v21.0/me/messages?access_token=${accessToken}`;
    const igRes = await fetch(igUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text }
      })
    });
    const igData = await igRes.json();
    if (igRes.ok && !igData.error) {
      return { success: true, via: "graph.instagram.com", data: igData };
    }
    console.warn("[CF Webhook] graph.instagram.com notice, trying graph.facebook.com fallback:", igData);
  } catch (e) {
    console.warn("[CF Webhook] graph.instagram.com fetch error:", e);
  }

  // 2. Fallback via Facebook Graph API (Messenger for Instagram)
  try {
    const fbUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${accessToken}`;
    const fbRes = await fetch(fbUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text }
      })
    });
    const fbData = await fbRes.json();
    return { success: fbRes.ok && !fbData.error, via: "graph.facebook.com", data: fbData };
  } catch (err: any) {
    return { success: false, error: err?.message || err };
  }
}

async function handleIncomingEvents(body: any): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  if (body.object !== "instagram" && body.object !== "page") {
    return results;
  }

  const integration = await fetchFirestoreIntegration();
  if (!integration || !integration.accessToken || !integration.autoReplyEnabled) {
    console.warn("[CF Webhook] No active Instagram integration or auto-reply disabled");
    return results;
  }

  const businessInfo = await fetchAssistantKnowledge();

  const entries = body.entry || [];
  for (const entry of entries) {
    const messaging = entry.messaging || [];
    for (const event of messaging) {
      const senderId = event.sender?.id;
      const message = event.message;

      if (message && message.text && !message.is_echo && senderId) {
        console.log(`[CF Webhook] DM from ${senderId}: "${message.text}"`);
        const replyText = await generateAiReply(message.text, businessInfo);
        const sendResult = await sendMetaInstagramMessage(senderId, replyText, integration.accessToken);
        results.push({
          status: sendResult.success ? "sent" : "error",
          senderId,
          botReply: replyText,
          metaResult: sendResult
        });
      }
    }
  }

  return results;
}

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge");

  // Si Meta envoie son challenge de vérification
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  // Si on visite l'URL dans le navigateur pour vérifier
  return new Response(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><title>JawebFlow Webhook OK</title></head>
    <body style="background:#090d16;color:#34d399;font-family:sans-serif;padding:40px;text-align:center;">
      <h2>● Webhook Instagram JawebFlow Actif sur Cloudflare Edge</h2>
      <p style="color:#94a3b8">Prêt pour la réception des messages Instagram Direct & Meta</p>
    </body>
    </html>
  `, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

export async function onRequestPost(context: any) {
  try {
    const body = await context.request.json();
    console.log("[CF Webhook] Received Meta POST payload:", JSON.stringify(body).slice(0, 150));

    // Exécution du traitement de message
    const promise = handleIncomingEvents(body);
    if (context.waitUntil) {
      context.waitUntil(promise);
    } else {
      await promise;
    }

    return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err: any) {
    console.error("[CF Webhook] Error processing POST:", err);
    return new Response(JSON.stringify({ status: "EVENT_RECEIVED", error: err?.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
    }
  });
}

