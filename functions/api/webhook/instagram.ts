import firebaseConfig from "../../../firebase-applet-config.json";

interface Env { GEMINI_API_KEY?: string; INSTAGRAM_VERIFY_TOKEN?: string; }
type Integration = { accessToken: string; instagramUserId: string; instagramUsername?: string; assistantId?: string; autoReplyEnabled?: boolean; assistantTone?: string; customGreeting?: string };

type FirestoreValue = { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };
function value(field?: FirestoreValue): any {
  if (!field) return undefined;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.arrayValue) return (field.arrayValue.values || []).map(value);
  if (field.mapValue) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([key, val]) => [key, value(val)]));
  return undefined;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}

async function firestoreQuery(structuredQuery: any) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structuredQuery }) });
  if (!response.ok) throw new Error(`Firestore HTTP ${response.status}`);
  return await response.json() as any[];
}

async function fetchIntegration(instagramUserId?: string): Promise<Integration | null> {
  try {
    const structuredQuery: any = { from: [{ collectionId: "instagram_integrations" }], limit: 50 };
    if (instagramUserId) {
      structuredQuery.where = { fieldFilter: { field: { fieldPath: "instagramUserId" }, op: "EQUAL", value: { stringValue: String(instagramUserId) } } };
      structuredQuery.limit = 1;
    }
    const rows = await firestoreQuery(structuredQuery);
    for (const row of rows) {
      const fields = row.document?.fields as Record<string, FirestoreValue> | undefined;
      const token = value(fields?.accessToken);
      if (token) return {
        accessToken: String(token), instagramUserId: String(value(fields?.instagramUserId) || instagramUserId || ""),
        instagramUsername: value(fields?.instagramUsername), assistantId: value(fields?.assistantId),
        autoReplyEnabled: value(fields?.autoReplyEnabled) !== false, assistantTone: value(fields?.assistantTone), customGreeting: value(fields?.customGreeting)
      };
    }
  } catch (error) { console.error("[CF Instagram] intégration Firestore inaccessible:", error); }
  return null;
}

async function fetchAssistantKnowledge(assistantId?: string) {
  const fallback = { businessName: "", website: "", knowledgeNotes: [] as any[], assistantTone: "professionnel", customGreeting: "" };
  try {
    if (!assistantId) return fallback;
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/assistants/${encodeURIComponent(assistantId)}?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Assistant HTTP ${response.status}`);
    const document = await response.json() as any;
    const fields = document.fields as Record<string, FirestoreValue>;
    return {
      businessName: value(fields?.businessName) || value(fields?.name) || "",
      website: value(fields?.websiteUrl) || value(fields?.website) || "",
      knowledgeNotes: value(fields?.knowledgeNotes) || [],
      assistantTone: value(fields?.assistantTone) || "professionnel",
      customGreeting: value(fields?.customGreeting) || ""
    };
  } catch (error) { console.error("[CF Instagram] base assistant inaccessible:", error); return fallback; }
}

async function generateAiReply(userText: string, info: any, env: Env, integration: Integration) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY absent dans l’environnement Cloudflare Production.");
  const notes = (info.knowledgeNotes || []).filter((note: any) => note?.enabled !== false && note?.content).slice(0, 50);
  const knowledge = notes.map((note: any) => `### ${note.title || "Information"}\n${note.content}`).join("\n\n").slice(0, 30000);
  const prompt = `Tu es l’assistant Instagram officiel de ${info.businessName || "cette entreprise"}. Réponds au dernier message en français ou en darija selon la langue du client, avec un ton ${info.assistantTone || integration.assistantTone || "professionnel"}. Réponse courte et naturelle pour un DM.

RÈGLE ABSOLUE : utilise uniquement les informations de la base ci-dessous. Si une information n’est pas présente, dis honnêtement que tu dois vérifier et propose le contact disponible. N’invente jamais de prix, livraison, wilaya, délai, produit ou promotion.

BASE DE CONNAISSANCES :
${knowledge || "Aucune fiche de connaissance disponible."}

Message client : ${userText}
Réponds uniquement avec le texte à envoyer, sans titre ni explication interne.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 300 } })
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${data.error?.message || "erreur inconnue"}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini n’a retourné aucune réponse.");
  return text;
}

async function sendInstagramMessage(recipientId: string, text: string, accessToken: string) {
  const attempts = [
    `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`,
    `https://graph.instagram.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`
  ];
  let lastError = "";
  for (const url of attempts) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) });
      const data = await response.json().catch(() => ({})) as any;
      if (response.ok && !data.error) return { success: true, data };
      lastError = data.error?.message || `Meta HTTP ${response.status}`;
    } catch (error: any) { lastError = error?.message || "Erreur réseau Meta"; }
  }
  return { success: false, error: lastError };
}

async function processEvents(body: any, env: Env) {
  if (body.object !== "instagram" && body.object !== "page") return;
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const message = event.message;
      const senderId = event.sender?.id;
      const recipientId = event.recipient?.id || entry.id;
      if (!message?.text || message.is_echo || !senderId) continue;
      const integration = await fetchIntegration(recipientId);
      if (!integration?.accessToken || integration.autoReplyEnabled === false) {
        console.error(`[CF Instagram] aucun token actif pour recipient=${recipientId}`);
        continue;
      }
      const info = await fetchAssistantKnowledge(integration.assistantId);
      try {
        const reply = await generateAiReply(message.text, info, env, integration);
        const result = await sendInstagramMessage(senderId, reply, integration.accessToken);
        if (!result.success) console.error(`[CF Instagram] réponse non envoyée à ${senderId}:`, result.error);
        else console.log(`[CF Instagram] réponse envoyée via Gemini à ${senderId}, assistant=${integration.assistantId || "inconnu"}`);
      } catch (error) { console.error("[CF Instagram] traitement Gemini échoué:", error); }
    }
  }
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const url = new URL(context.request.url);
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");
  if (challenge && verifyToken === (context.env.INSTAGRAM_VERIFY_TOKEN || "jawebflow_secure_webhook_token_2025")) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  if (challenge) return new Response("Token de vérification invalide", { status: 403 });
  return new Response("JawebFlow Instagram webhook actif", { status: 200 });
}

export async function onRequestPost(context: { request: Request; env: Env; waitUntil?: (promise: Promise<unknown>) => void }) {
  try {
    const body = await context.request.json();
    const work = processEvents(body, context.env);
    if (context.waitUntil) context.waitUntil(work); else await work;
    return json({ status: "EVENT_RECEIVED" });
  } catch (error: any) {
    console.error("[CF Instagram] webhook invalide:", error);
    return json({ status: "EVENT_RECEIVED", error: error?.message || "invalid payload" });
  }
}

export async function onRequestOptions() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } }); }
