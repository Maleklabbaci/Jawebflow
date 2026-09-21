/**
 * JAWEBFLOW — Webhook Instagram Direct (Cloudflare Pages Function).
 * URL : GET/POST /api/webhook/instagram
 *
 * Correctifs appliqués :
 *   1. Modèles Gemini invalides remplacés (gemini-3.1-flash-lite n'existe pas,
 *      ce qui faisait échouer l'IA en silence et renvoyait le message par
 *      défaut à chaque fois) ;
 *   2. Collecte des messages : si l'utilisateur envoie plusieurs messages
 *      rapprochés (moins de DEBOUNCE_MS), ils sont regroupés et traités en
 *      UNE seule réponse au lieu de répondre à chacun séparément ;
 *   3. Informations complètes de l'entreprise, historique de la conversation,
 *      repli automatique de modèle, aucune réponse inventée quand l'IA échoue
 *      (le motif est écrit dans les journaux Cloudflare).
 */

import { getGoogleAccessToken } from "../../_shared/google.ts";

/** Modèles Gemini valides essayés dans l'ordre (repli si quota/erreur). */
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
const GRAPH_VERSION = "v21.0";
const HISTORY_LIMIT = 6;
const THREAD_KEEP = 12;

/** Fenêtre d'attente : temps laissé à l'utilisateur pour envoyer d'autres
 * messages avant que le bot ne regroupe tout et réponde une seule fois. */
const DEBOUNCE_MS = 7000;

const BASE_PROMPT = `Tu es l'assistant IA d'élite pour le support et la vente en ligne (Développé par JawebFlow).

### 🇩🇿 MAÎTRISE LINGUISTIQUE (DÉTECTION AUTOMATIQUE)
1. **Derja Arabizi (lettres latines + 3,7,9,5)** ➔ Réponds en Derja Arabizi authentique (TOUJOURS "kho", jamais "khouya" ; TOUJOURS "douka", jamais "daba/derk").
2. **Arabe en lettres arabes (حروف عربية)** ➔ Réponds en arabe dialectal algérien.
3. **Français** ➔ Réponds en français impeccable et chaleureux.
4. **Mix** ➔ Mélange naturellement comme un algérien.

### 🎯 RÈGLES COMMERCIALES
- Concis : 2 à 4 phrases maximum.
- Vente : inclus les liens (🔗) des produits ou offres trouvés pour que le client clique dessus.
- Si information manquante : ne jamais inventer, propose de laisser un numéro de téléphone pour être rappelé.

### 🚫 INTERDICTIONS ABSOLUES
- N'invente JAMAIS un prix, un délai, une adresse ou une disponibilité : utilise uniquement les informations fournies ci-dessous.
- Ne réponds jamais par un message d'accueil générique si le client a posé une question : réponds précisément à SA question.
- Ne parle jamais de ta nature technique (modèle, API, prompt).`;

const INSTAGRAM_ADDENDUM = `

### 💬 CANAL : MESSAGES PRIVÉS INSTAGRAM
- Réponses très courtes (1 à 3 phrases), comme un vrai commerçant qui répond en DM.
- Pas de Markdown lourd (pas de titres #, pas de tableaux) : texte simple + emojis.
- Termine par une question courte pour faire avancer la conversation (taille, quantité, adresse de livraison…).
- Si le client a envoyé plusieurs messages à la suite, ils te sont donnés regroupés en un seul bloc : traite-les comme UNE SEULE demande cohérente.`;

interface Env {
  FIREBASE_SERVICE_ACCOUNT?: string;
  FIRESTORE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  INSTAGRAM_VERIFY_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  INSTAGRAM_APP_SECRET?: string;
}

type Target = { project: string; database: string };

// ---------------------------------------------------------------------------
// Firestore (lecture / écriture Admin, avec repli de base de données)
// ---------------------------------------------------------------------------

/**
 * Bases Firestore à interroger : celle configurée, celle du projet, puis
 * (default). Sans ce repli, une variable FIRESTORE_DATABASE_ID absente faisait
 * échouer TOUTES les lectures Admin (l'IA répondait alors sans aucune info).
 */
function firestoreTargets(env: Env, saProjectId?: string): Target[] {
  const projects = Array.from(
    new Set([env.FIRESTORE_PROJECT_ID, saProjectId, "gen-lang-client-0772569610"].filter(Boolean))
  ) as string[];
  const databases = Array.from(
    new Set([
      env.FIRESTORE_DATABASE_ID,
      "ai-studio-jawebflow-3b5eca8a-3aea-4c7a-8009-6f854b13701c",
      "(default)",
    ].filter(Boolean))
  ) as string[];
  const targets: Target[] = [];
  for (const project of projects) for (const database of databases) targets.push({ project, database });
  return targets;
}

function parseFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value.integerValue !== undefined) out[key] = parseInt(value.integerValue, 10);
    else if (value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value.arrayValue) {
      out[key] = (value.arrayValue.values || []).map((v: any) =>
        v.mapValue ? parseFields(v.mapValue.fields || {}) : v.stringValue ?? v.booleanValue ?? v.doubleValue ?? v
      );
    } else if (value.mapValue) {
      out[key] = parseFields(value.mapValue.fields || {});
    }
  }
  return out;
}

function toFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") fields[key] = { stringValue: value };
    else if (typeof value === "number") {
      fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    } else if (typeof value === "boolean") fields[key] = { booleanValue: value };
    else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map((item) =>
            item && typeof item === "object" ? { mapValue: { fields: toFields(item) } } : toFields({ v: item }).v
          ),
        },
      };
    } else if (typeof value === "object") {
      fields[key] = { mapValue: { fields: toFields(value) } };
    }
  }
  return fields;
}

/** Lecture Admin d'un document (404 simplement ignoré). */
async function readDocument(env: Env, accessToken: string, path: string, target?: Target) {
  for (const t of target ? [target] : firestoreTargets(env)) {
    try {
      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${t.project}/databases/${t.database}/documents/${path}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.status === 404 || !res.ok) continue;
      const json: any = await res.json();
      return { ok: true, data: parseFields(json.fields || {}), target: t };
    } catch {
      continue;
    }
  }
  return { ok: false, data: null as any, target: undefined as any };
}

/** Écriture (fusion) Admin d'un document. */
async function writeDocument(
  env: Env,
  accessToken: string,
  path: string,
  data: Record<string, any>,
  target?: Target
) {
  const chosen = target || firestoreTargets(env)[0];
  if (!chosen) return;
  try {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${chosen.project}/databases/${chosen.database}/documents/${path}?${mask}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFields(data) }),
      }
    );
  } catch (e: any) {
    console.warn("[instagram] écriture Firestore impossible:", e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Prompt + IA
// ---------------------------------------------------------------------------

/** Prompt construit avec la VRAIE base de connaissances de l'entreprise. */
function buildSystemPrompt(config: any): string {
  let prompt = BASE_PROMPT;
  if (config?.customInstructions) prompt += `\n\n### 🧠 INSTRUCTIONS DU CLIENT :\n${config.customInstructions}`;
  if (config?.businessName) prompt += `\n\n### 🏢 ENTREPRISE :\n"${config.businessName}"`;
  if (config?.businessCategory) prompt += `\nSecteur : ${config.businessCategory}`;
  if (config?.businessDescription) prompt += `\n${config.businessDescription}`;
  if (config?.websiteUrl) prompt += `\nSite web : ${config.websiteUrl}`;
  if (config?.assistantTone) prompt += `\nTon à adopter : ${config.assistantTone}.`;
  if (config?.whatsappEscalation) {
    prompt += `\nPour toute question urgente ou demande de rappel, propose ce numéro : ${config.whatsappEscalation}.`;
  }

  const notes = Array.isArray(config?.knowledgeNotes)
    ? config.knowledgeNotes.filter((n: any) => n && n.enabled !== false)
    : [];
  if (notes.length > 0) {
    prompt += `\n\n### 📋 BASE DE CONNAISSANCE DE L'ENTREPRISE (source de vérité) :\n`;
    for (const note of notes) prompt += `- [${note.category || note.title || "Note"}] ${note.content || ""}\n`;
  }
  if (config?.faqText) prompt += `\n\n### ❓ FAQ :\n${config.faqText}`;
  if (config?.pricingServicesText) prompt += `\n\n### 💰 TARIFS & SERVICES :\n${config.pricingServicesText}`;
  if (config?.specialRulesText) prompt += `\n\n### ⚠️ RÈGLES SPÉCIALES :\n${config.specialRulesText}`;

  if (notes.length === 0 && !config?.faqText && !config?.pricingServicesText && !config?.specialRulesText) {
    prompt += `\n\n### ⚠️ ATTENTION\nAucune information détaillée n'est encore enregistrée : reste vague sur les prix et les délais, et propose de laisser un numéro de téléphone pour être rappelé.`;
  }
  return prompt + INSTAGRAM_ADDENDUM;
}

/** Appel Gemini, avec repli automatique sur un autre modèle. */
async function generateReply(
  env: Env,
  systemPrompt: string,
  message: string,
  history: Array<{ role: string; text: string }>
): Promise<{ text: string | null; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  if (!env.GEMINI_API_KEY) {
    diagnostics.push("GEMINI_API_KEY absente (Cloudflare → Settings → Environment variables)");
    return { text: null, diagnostics };
  }

  const models = Array.from(new Set([...(env.GEMINI_MODEL ? [env.GEMINI_MODEL] : []), ...FALLBACK_MODELS]));
  const contents = history
    .slice(-HISTORY_LIMIT)
    .map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
  contents.push({ role: "user", parts: [{ text: message }] });

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
          }),
        }
      );
      if (!res.ok) {
        diagnostics.push(`${model}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
        continue;
      }
      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        diagnostics.push(`${model}: réponse vide (${data?.promptFeedback?.blockReason || "inconnu"})`);
        continue;
      }
      diagnostics.push(`modèle utilisé: ${model}`);
      return { text, diagnostics };
    } catch (e: any) {
      diagnostics.push(`${model}: ${e?.message || e}`);
    }
  }
  return { text: null, diagnostics };
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

function resolveVerifyToken(env: Env): string | null {
  return env.INSTAGRAM_VERIFY_TOKEN || env.META_VERIFY_TOKEN || null;
}

/** Vérifie la signature Meta `X-Hub-Signature-256` (HMAC-SHA256 du corps brut). */
async function hasValidMetaSignature(request: Request, rawBody: string, appSecret?: string): Promise<boolean> {
  if (!appSecret) return false;
  const header = request.headers.get("x-hub-signature-256") || "";
  if (!header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}` === header;
}

/** Retrouve la connexion Instagram (multi-tenant) d'après le compte qui reçoit le message. */
async function findIntegration(env: Env, instagramAccountId: string) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return null;

  let accessToken: string;
  let saProjectId = "";
  try {
    const auth = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
    accessToken = auth.accessToken;
    saProjectId = auth.projectId;
  } catch (e: any) {
    console.error("[instagram] OAuth Google refusé:", e?.message || e);
    return null;
  }

  for (const target of firestoreTargets(env, saProjectId)) {
    try {
      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${target.project}/databases/${target.database}/documents:runQuery`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "instagram_integrations" }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "instagramUserId" },
                  op: "EQUAL",
                  value: { stringValue: instagramAccountId },
                },
              },
              limit: 1,
            },
          }),
        }
      );
      if (!res.ok) continue;

      const rows: any[] = await res.json();
      const doc = rows?.find((r) => r?.document)?.document;
      if (!doc) continue;

      const data = parseFields(doc.fields || {});
      return {
        integrationId: String(doc.name || "").split("/").pop(),
        accessToken,
        igToken: data.accessToken as string,
        assistantId: data.assistantId as string | undefined,
        autoReplyEnabled: data.autoReplyEnabled !== false,
        target,
      };
    } catch (e: any) {
      console.error(`[instagram] recherche sur ${target.database} échouée:`, e?.message || e);
    }
  }
  console.error(`[instagram] aucune connexion trouvée pour le compte ${instagramAccountId}`);
  return null;
}

async function sendTypingOn(igToken: string, customerId: string) {
  try {
    await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(igToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: customerId }, sender_action: "typing_on" }),
    });
  } catch {
    /* purement cosmétique : ne doit jamais bloquer la réponse */
  }
}

async function sendInstagramMessage(igToken: string, customerId: string, text: string) {
  const res = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(igToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: customerId }, message: { text } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[instagram] envoi du message refusé:", res.status, body.slice(0, 200));
    return false;
  }
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ajoute le message reçu au buffer partagé du thread (Firestore) et renvoie
 * un jeton unique. Ce jeton sert de "ticket de course" : seule l'invocation
 * qui détient encore le DERNIER jeton posé après le délai d'attente aura le
 * droit de répondre — les autres se retirent silencieusement.
 */
async function pushPendingMessage(
  env: Env,
  integration: any,
  threadPath: string,
  target: Target | undefined,
  existingPending: Array<{ text: string; mid: string | null }>,
  text: string,
  hasAttachment: boolean,
  message: any
): Promise<string> {
  const token = crypto.randomUUID();
  const pendingMessages = [
    ...existingPending,
    { text: text || (hasAttachment ? "[image envoyée]" : ""), mid: message?.mid || null },
  ];

  await writeDocument(
    env,
    integration.accessToken,
    threadPath,
    { pendingMessages, pendingToken: token },
    target
  );

  return token;
}

/** Traitement d'un message privé : infos de l'entreprise ➜ IA ➜ réponse. */
async function handleDirectMessage(env: Env, event: any) {
  const customerId: string | undefined = event?.sender?.id;
  const instagramAccountId: string | undefined = event?.recipient?.id;
  const message = event?.message;

  if (!customerId || !instagramAccountId || message?.is_echo) return;

  const text: string = typeof message?.text === "string" ? message.text.trim() : "";
  const hasAttachment = Array.isArray(message?.attachments) && message.attachments.length > 0;
  if (!text && !hasAttachment) return;

  const integration = await findIntegration(env, instagramAccountId);
  if (!integration?.igToken || !integration.accessToken) return;

  if (!integration.autoReplyEnabled) {
    console.log("[instagram] réponses automatiques en pause pour", integration.integrationId);
    return;
  }

  // Historique + buffer en attente (sous-collection privée, écrite par le serveur)
  const threadPath = `instagram_integrations/${integration.integrationId}/threads/${customerId}`;
  const thread = await readDocument(env, integration.accessToken, threadPath, integration.target);
  const threadTarget = thread.ok ? thread.target : integration.target;
  const stored = thread.ok && Array.isArray(thread.data?.messages) ? thread.data.messages : [];
  const handledMids: string[] = thread.ok && Array.isArray(thread.data?.handledMids) ? thread.data.handledMids : [];
  const existingPending: Array<{ text: string; mid: string | null }> =
    thread.ok && Array.isArray(thread.data?.pendingMessages) ? thread.data.pendingMessages : [];

  // Anti-doublon : Meta réessaie plusieurs fois le même événement
  if (message?.mid && handledMids.includes(message.mid)) {
    console.log("[instagram] message déjà traité, doublon ignoré:", message.mid);
    return;
  }

  // ── 1) On dépose ce message dans le buffer partagé et on récupère notre jeton.
  const myToken = await pushPendingMessage(
    env,
    integration,
    threadPath,
    threadTarget,
    existingPending,
    text,
    hasAttachment,
    message
  );
  console.log(
    `[instagram] message mis en file d'attente (jeton ${myToken.slice(0, 8)}) pour ${customerId} :`,
    text || "[pièce jointe]"
  );

  // ── 2) On attend : si un autre message arrive entre-temps, il posera un
  //    nouveau jeton et gagnera la priorité — on s'efface alors sans répondre.
  await sleep(DEBOUNCE_MS);

  const recheck = await readDocument(env, integration.accessToken, threadPath, threadTarget);
  const currentToken = recheck.data?.pendingToken;

  if (currentToken !== myToken) {
    console.log(
      `[instagram] un message plus récent est arrivé entre-temps (jeton ${myToken.slice(0, 8)} dépassé) — on laisse l'autre appel répondre.`
    );
    return;
  }

  // ── 3) On est bien le DERNIER message reçu → on regroupe tout le buffer et
  //    on répond UNE seule fois pour l'ensemble.
  const pendingMessages: Array<{ text: string; mid: string | null }> = Array.isArray(recheck.data?.pendingMessages)
    ? recheck.data.pendingMessages
    : [];

  if (pendingMessages.length === 0) {
    console.log("[instagram] buffer déjà vidé par un autre appel, rien à faire.");
    return;
  }

  const groupedText = pendingMessages.map((m) => m.text).filter(Boolean).join("\n");
  const newMids = pendingMessages.map((m) => m.mid).filter(Boolean) as string[];
  console.log(
    `[instagram] regroupement de ${pendingMessages.length} message(s) pour ${customerId} :`,
    groupedText
  );

  const freshStored = Array.isArray(recheck.data?.messages) ? recheck.data.messages : stored;
  const history = freshStored
    .filter((m: any) => (m?.role === "user" || m?.role === "model") && typeof m.text === "string")
    .slice(-HISTORY_LIMIT)
    .map((m: any) => ({ role: m.role, text: m.text }));

  // Informations réelles de l'entreprise
  let config: any = {};
  if (integration.assistantId) {
    const read = await readDocument(env, integration.accessToken, `assistants/${integration.assistantId}`);
    if (read.ok) config = read.data;
    else console.warn("[instagram] configuration de l'entreprise introuvable pour", integration.assistantId);
  } else {
    console.warn("[instagram] aucun assistantId enregistré sur la connexion Instagram");
  }

  await sendTypingOn(integration.igToken, customerId);

  const incoming = groupedText || "Le client a envoyé une image que tu ne peux pas lire.";
  const { text: aiText, diagnostics } = await generateReply(env, buildSystemPrompt(config), incoming, history);
  console.log("[instagram] diagnostics IA:", diagnostics.join(" | "));

  // Plus de fausse réponse : si l'IA échoue, message honnête au client et motif
  // réel écrit dans les journaux Cloudflare.
  const businessName = config?.businessName || "notre équipe";
  const replyText =
    aiText ||
    (hasAttachment && !groupedText
      ? "Merci pour votre message 🙏 Pouvez-vous nous écrire votre demande en texte ?"
      : `Merci pour votre message 🙏 Nous revenons vers vous dans quelques instants (${businessName}).`);

  const sent = await sendInstagramMessage(integration.igToken, customerId, replyText);

  const messages = [
    ...freshStored.map((m: any) => ({ role: m.role, text: m.text })),
    ...(groupedText ? [{ role: "user", text: groupedText }] : []),
    ...(sent ? [{ role: "model", text: replyText }] : []),
  ].slice(-THREAD_KEEP);

  await writeDocument(
    env,
    integration.accessToken,
    threadPath,
    {
      messages,
      pendingMessages: [], // buffer vidé après traitement
      handledMids: [...handledMids, ...newMids].slice(-30),
      updatedAt: new Date().toISOString(),
    },
    threadTarget
  );
}

// ---------------------------------------------------------------------------
// Handlers Cloudflare Pages
// ---------------------------------------------------------------------------

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = resolveVerifyToken(context.env);
  if (!verifyToken) {
    console.error("[instagram] INSTAGRAM_VERIFY_TOKEN / META_VERIFY_TOKEN non configuré : vérification refusée.");
    return new Response("Webhook non configuré", { status: 503 });
  }
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  console.warn("[instagram] vérification webhook refusée", { mode, hasToken: Boolean(token) });
  return new Response("Forbidden", { status: 403 });
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<any>) => void;
}) {
  try {
    const rawBody = await context.request.text();
    const appSecret = context.env.INSTAGRAM_APP_SECRET;

    if (appSecret) {
      if (!(await hasValidMetaSignature(context.request, rawBody, appSecret))) {
        console.warn("[instagram] signature X-Hub-Signature-256 invalide : requête rejetée.");
        return new Response("Invalid signature", { status: 401 });
      }
    } else {
      console.warn("[instagram] INSTAGRAM_APP_SECRET absent : signature Meta non vérifiable (à configurer).");
    }

    const body = JSON.parse(rawBody || "{}");
    if (body?.object !== "instagram" && body?.object !== "page") {
      return new Response("Not Found", { status: 404 });
    }

    const events: any[] = [];
    for (const entry of body.entry || []) {
      for (const messagingEvent of entry.messaging || []) events.push(messagingEvent);
    }

    console.log(`[instagram] webhook reçu : ${events.length} événement(s)`);

    // Réponse immédiate à Meta (sinon Meta considère le webhook en échec et
    // renvoie l'événement en boucle) ; le traitement (incluant l'attente de
    // regroupement) continue en arrière-plan via waitUntil.
    const work = (async () => {
      for (const event of events) {
        try {
          await handleDirectMessage(context.env, event);
        } catch (e: any) {
          console.error("[instagram] traitement d'un message échoué:", e?.message || e);
        }
      }
    })();

    if (typeof context.waitUntil === "function") context.waitUntil(work);
    else await work;

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error: any) {
    console.error("Erreur dans le Webhook Instagram:", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}

export default { onRequestPost, onRequestGet, onRequestOptions };
