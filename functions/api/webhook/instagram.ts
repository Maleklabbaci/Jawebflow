/**
 * JAWEBFLOW — Webhook Instagram Direct (Cloudflare Pages Function).
 * URL : GET/POST /api/webhook/instagram
 *
 * Correctifs appliqués :
 *   1. Modèles Gemini valides (gemini-3.5-flash-lite, gemini-3.5-flash,
 *      gemini-3.1-flash-lite) — les anciens noms (gemini-2.0-flash,
 *      gemini-2.5-flash...) sont soit inexistants soit retirés pour les
 *      nouvelles clés API (confirmé par les logs : erreurs HTTP 404/429).
 *   2. thinkingConfig désactivé (thinkingBudget: 0) : les modèles Gemini 3.x
 *      activent par défaut un mode "réflexion" qui ajoutait 8-10 secondes de
 *      latence inutile pour du simple chat en DM.
 *   3. TIMEOUT STRICT sur chaque appel réseau (Gemini + Firestore) : sans ça,
 *      une réponse lente bloquait l'exécution jusqu'à ce que Cloudflare tue
 *      le Worker à la limite des 30 secondes — sans jamais répondre au client.
 *   4. Lookups Firestore PARALLÉLISÉS (au lieu de séquentiels).
 *   5. Collecte des messages : plusieurs messages rapprochés (moins de
 *      DEBOUNCE_MS) sont regroupés et traités en UNE seule réponse (système
 *      de jeton + buffer Firestore).
 *   6. PROMPT VERROUILLÉ : l'IA refuse désormais explicitement de répondre à
 *      toute question hors du périmètre de l'entreprise (politique, culture
 *      générale, code, autre entreprise...) au lieu de risquer de sortir du
 *      sujet ou d'halluciner une réponse.
 *   7. Informations complètes de l'entreprise, historique de la conversation,
 *      repli automatique de modèle, aucune réponse inventée quand l'IA
 *      échoue (le motif est écrit dans les journaux Cloudflare).
 */

import { getGoogleAccessToken, base64 } from "../../_shared/google.ts";
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
  supabaseListKnowledgeEntries,
  supabaseListKnowledge,
  supabaseUpsertProspect,
  supabaseRequest,
} from "../../_shared/supabase.ts";
import { buildSalesSystemPrompt, buildBusinessContextText, classifySmallTalk, localGreeting, localPoliteReply, compactKnowledgeNotes, selectKnowledgeDocuments, selectRelevantText } from "../../_shared/prompt.ts";
import { extractLeadFacts } from "../../_shared/lead-facts.ts";
import { detectSalesIntent, buildLeadFollowUp, isAffirmative, isExplicitOrderConfirmation, createPendingOrderRequest, detectConfirmedDealKind, detectConfirmationQuestionKind, buildDealCreatedContext } from "../../_shared/sales-intent.ts";
import { detectOrderManagementIntent, processOrderChangeMessage } from "../../_shared/order-changes.ts";
import { getGeminiContextCache } from "../../_shared/gemini-cache.ts";
import { summarizeInstagramMessageShape } from "../../_shared/instagram-message-shape.ts";
import { runBackgroundLearning } from "../../_shared/learning.ts";
import { searchClientSite } from "../../_shared/site-search.ts";
import { handleNotifyAccountMessage, notifyLead, notifyHumanTransfer, isHumanTransfer, HUMAN_TRANSFER_REPLY } from "../../_shared/merchant-notify";
import { refreshInstagramTokenIfNeeded } from "../../_shared/ig-api.ts";
import { forwardLeadInBackground } from "../../_shared/lead-webhook.ts";
import { LEGACY_DEFAULT_GREETING, renderTemplate } from "../../_shared/ig-automation-core.ts";
import {
  processCommentEvent,
  runDmAutomations,
  handleAutomationPostback,
  type IgAccount,
} from "../../_shared/ig-automations.ts";
import {
  supabaseGetPlanLimits,
  supabaseCountMonthlyConversations,
  monthlyCostBlock,
  supabaseLogConversation,
  LIMIT_BLOCK_FREE,
  limitBlockReached,
} from "../../_shared/limits.ts";

/** Modèles Gemini valides essayés dans l'ordre (repli si quota/erreur). */
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"; // le moins cher de la famille
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

const GRAPH_VERSION = "v21.0";
const HISTORY_LIMIT = 6;
const THREAD_KEEP = 12;

/** Fenêtre d'attente : temps laissé à l'utilisateur pour envoyer d'autres
 * messages avant que le bot ne regroupe tout et réponde une seule fois. */
const DEBOUNCE_MS = 4000;

/** Timeouts réseau stricts : évite qu'un appel lent bloque tout le webhook
 * jusqu'à la limite globale de 30s imposée par Cloudflare (waitUntil). */
const GEMINI_TIMEOUT_MS = 12000;
const FIRESTORE_TIMEOUT_MS = 5000;

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
  GEMINI_CONTEXT_CACHE_ENABLED?: string;
  GEMINI_CONTEXT_CACHE_TTL_SECONDS?: string | number;
  INSTAGRAM_VERIFY_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  INSTAGRAM_APP_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type Target = { project: string; database: string };

// ---------------------------------------------------------------------------
// Utilitaire réseau : fetch avec timeout strict (AbortController)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ---------------------------------------------------------------------------
// Firestore (lecture / écriture Admin, avec repli de base de données)
// ---------------------------------------------------------------------------

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

async function readFromTarget(accessToken: string, path: string, t: Target) {
  try {
    const res = await fetchWithTimeout(
      `https://firestore.googleapis.com/v1/projects/${t.project}/databases/${t.database}/documents/${path}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      FIRESTORE_TIMEOUT_MS
    );
    if (res.status === 404 || !res.ok) return { ok: false, data: null as any, target: t };
    const json: any = await res.json();
    return { ok: true, data: parseFields(json.fields || {}), target: t };
  } catch {
    return { ok: false, data: null as any, target: t };
  }
}

/** Thread Supabase : historique + buffer anti-doublons (table instagram_threads). */
async function readThread(env: Env, integrationId: string, customerId: string): Promise<any> {
  if (!supabaseConfigured(env)) return {};
  try {
    const res = await supabaseRequest(env, `instagram_threads?integration_id=eq.${encodeURIComponent(integrationId)}&customer_id=eq.${encodeURIComponent(customerId)}&select=*`);
    if (!res.ok) return {};
    const rows: any[] = await res.json();
    const row = rows?.[0];
    if (!row) return {};
    return {
      messages: Array.isArray(row.messages) ? row.messages : [],
      handledMids: Array.isArray(row.handled_mids) ? row.handled_mids : [],
      pendingMessages: Array.isArray(row.pending_messages) ? row.pending_messages : [],
      pendingToken: row.pending_token || null,
    };
  } catch {
    return {};
  }
}

async function saveThread(env: Env, integrationId: string, customerId: string, data: any): Promise<void> {
  if (!supabaseConfigured(env)) return;
  try {
    const row: any = {
      integration_id: integrationId,
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    };
    if (data.messages !== undefined) row.messages = data.messages;
    if (data.handledMids !== undefined) row.handled_mids = data.handledMids;
    if (data.pendingMessages !== undefined) row.pending_messages = data.pendingMessages;
    if (data.pendingToken !== undefined) row.pending_token = data.pendingToken;
    await supabaseRequest(env, 'instagram_threads?on_conflict=integration_id,customer_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(row),
    });
  } catch (e: any) {
    console.warn('[instagram] écriture thread Supabase impossible:', e?.message || e);
  }
}

async function readDocument(env: Env, accessToken: string, path: string, target?: Target) {
  if (target) return readFromTarget(accessToken, path, target);

  const targets = firestoreTargets(env);
  const attempts = targets.map((t) => readFromTarget(accessToken, path, t));
  const settledResults = await Promise.allSettled(attempts);
  for (const settled of settledResults) {
    if (settled.status === "fulfilled" && settled.value.ok) return settled.value;
  }
  return { ok: false, data: null as any, target: undefined as any };
}

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
    await fetchWithTimeout(
      `https://firestore.googleapis.com/v1/projects/${chosen.project}/databases/${chosen.database}/documents/${path}?${mask}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFields(data) }),
      },
      FIRESTORE_TIMEOUT_MS
    );
  } catch (e: any) {
    console.warn("[instagram] écriture Firestore impossible:", e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Prompt + IA
// ---------------------------------------------------------------------------

/** Prompt système partagé avec le site ; les faits dynamiques sont transmis au tour courant. */
function buildSystemPrompt(config: any): string {
  return buildSalesSystemPrompt(config, INSTAGRAM_ADDENDUM);
}

/**
 * Le client a envoyé une photo sans texte : on récupère l'image via l'API
 * Meta (`/{mid}/attachments`), puis Gemini Vision la décrit en quelques mots
 * pour en faire une requête de recherche produit sur le site du client.
 */
/** Télécharge la photo jointe d'un DM (partagé : description vision ET inline). */
async function fetchAttachmentImage(env: Env, igToken: string, mid: string): Promise<{ mime: string; base64: string } | null> {
  try {
    const metaRes = await fetchWithTimeout(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(mid)}/attachments?access_token=${encodeURIComponent(igToken)}`,
      {},
      5000
    );
    if (!metaRes.ok) return null;
    const meta: any = await metaRes.json();
    const url = meta?.data?.[0]?.payload?.url || meta?.data?.[0]?.payload?.uri || null;
    if (!url) return null;

    const img = await fetchWithTimeout(url, {}, 6000);
    if (!img.ok) return null;
    const buf = await img.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    const mime = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (buf.byteLength > 5 * 1024 * 1024) return null;
    return { mime, base64: base64(buf) };
  } catch {
    return null;
  }
}

async function describeAttachmentImage(env: Env, igToken: string, mid: string): Promise<string | null> {
  try {
    const inline = await fetchAttachmentImage(env, igToken, mid);
    if (!inline) return null;
    const mime = inline.mime;
    const b64 = inline.base64;

    const g = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mime, data: b64 } },
              { text: "Identifie le produit PRINCIPAL sur cette photo pour une recherche dans une boutique. Méthode : 1) catégorie EXACTE (t-shirt, jersey/maillot de sport, jean/pantalon en denim, jogging/sweatpant, sweat/hoodie, veste, short, chemise, chaussures, casquette, sac, accessoire...) ; 2) couleur et coupe ; 3) texte ou logo lisible s'il y en a un. ATTENTION : un jean (denim) n'est PAS un jersey — base-toi sur la MATIÈRE et la coupe, pas sur un logo. Réponds en 6 à 12 mots, sans phrase complète, sans ponctuation finale." },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 60 },
        }),
      },
      9000
    );
    if (!g.ok) return null;
    const text = (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch (e) {
    console.error("[instagram] description de photo impossible:", (e as any)?.message || e);
    return null;
  }
}

/** Appel Gemini, avec repli automatique sur un autre modèle ET timeout strict. */
async function generateReply(
  env: Env,
  systemPrompt: string,
  message: string,
  history: Array<{ role: string; text: string }>,
  image?: { mime: string; base64: string } | null,
  maxOutputTokens = 450,
  businessContext: Record<string, any> = {},
  waitUntil?: (promise: Promise<any>) => void,
): Promise<{ text: string | null; diagnostics: string[]; usage?: { promptTokens: number; outputTokens: number; model: string } }> {
  const diagnostics: string[] = [];
  if (!env.GEMINI_API_KEY) {
    diagnostics.push("GEMINI_API_KEY absente (Cloudflare → Settings → Environment variables)");
    return { text: null, diagnostics };
  }

  const models = Array.from(new Set([...(env.GEMINI_MODEL ? [env.GEMINI_MODEL] : []), ...FALLBACK_MODELS]));
  const contents = history
    .slice(-HISTORY_LIMIT)
    .map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
  const userParts: any[] = [];
  const dynamicContext = buildBusinessContextText(businessContext);
  if (dynamicContext) userParts.push({ text: dynamicContext });
  if (image?.base64) userParts.push({ inline_data: { mime_type: image.mime || "image/jpeg", data: image.base64 } });
  userParts.push({ text: message });
  contents.push({ role: "user", parts: userParts });

  for (const model of models) {
    const startedAt = Date.now();
    try {
      const cachedContent = getGeminiContextCache(env, model, systemPrompt, waitUntil);
      if (cachedContent) diagnostics.push(`${model}: cache Gemini réutilisé`);
      const payload = {
        ...(cachedContent ? { cachedContent } : { systemInstruction: { parts: [{ text: systemPrompt }] } }),
        contents,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens, // 🧮 450 (700 détaillé) : coût de sortie ÷2
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        GEMINI_TIMEOUT_MS
      );

      if (res.status === 429) {
        diagnostics.push(`${model}: QUOTA DÉPASSÉ (429)`);
        break;
      }

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
      diagnostics.push(`modèle utilisé: ${model} (${Date.now() - startedAt}ms)`);
      const um = data?.usageMetadata || {};
      return { text, diagnostics, usage: { model, promptTokens: Number(um.promptTokenCount || 0), outputTokens: Number(um.candidatesTokenCount || 0) } };
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      diagnostics.push(
        `${model}: ${isTimeout ? `timeout après ${GEMINI_TIMEOUT_MS}ms` : e?.message || e} (${Date.now() - startedAt}ms)`
      );
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

async function findIntegration(env: Env, instagramAccountId: string) {
  // SUPABASE = source de vérité depuis la migration : le tableau de bord
  // sauvegarde la connexion dans la table instagram_integrations. Firestore
  // n'est plus qu'un repli pour les très anciens comptes jamais migrés.
  // (BUG corrigé : le webhook cherchait UNIQUEMENT dans Firestore — absent
  // de la configuration — donc aucun compte n'était jamais trouvé et le bot
  // restait silencieux malgré une connexion réussie côté dashboard.)
  if (supabaseConfigured(env)) {
    try {
      const res = await supabaseRequest(env, `instagram_integrations?instagram_user_id=eq.${encodeURIComponent(instagramAccountId)}&select=*`);
      if (res.ok) {
        const rows: any[] = await res.json();
        const row = rows?.[0];
        const metaToken = String(row?.access_token || '');
        if (row && metaToken) {
          return {
            integrationId: String(row.user_id || row.instagram_user_id || instagramAccountId),
            // user_id Supabase du marchand : clé des automatisations (absent du repli Firestore)
            userId: row.user_id ? String(row.user_id) : undefined,
            accessToken: metaToken,
            igToken: metaToken,
            assistantId: row.assistant_id ? String(row.assistant_id) : undefined,
            autoReplyEnabled: row.auto_reply_enabled !== false,
            respondToStories: row.respond_to_stories,
            customGreeting: typeof row.custom_greeting === 'string' ? row.custom_greeting : undefined,
            lastConnectedAt: row.last_connected_at ? String(row.last_connected_at) : undefined,
          };
        }
      }
    } catch (e: any) {
      console.error('[instagram] recherche Supabase échouée:', e?.message || e);
    }
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('[instagram] aucune connexion trouvée (ni Supabase, ni Firestore)');
    return null;
  }

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

  const targets = firestoreTargets(env, saProjectId);

  const attempts = targets.map(async (target) => {
    try {
      const res = await fetchWithTimeout(
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
        },
        FIRESTORE_TIMEOUT_MS
      );
      if (!res.ok) return null;
      const rows: any[] = await res.json();
      const doc = rows?.find((r) => r?.document)?.document;
      if (!doc) return null;
      return { doc, target };
    } catch (e: any) {
      console.error(`[instagram] recherche sur ${target.database} échouée:`, e?.message || e);
      return null;
    }
  });

  const results = await Promise.allSettled(attempts);
  for (const settled of results) {
    if (settled.status === "fulfilled" && settled.value) {
      const { doc, target } = settled.value;
      const data = parseFields(doc.fields || {});
      return {
        integrationId: String(doc.name || "").split("/").pop(),
        accessToken,
        igToken: data.accessToken as string,
        assistantId: data.assistantId as string | undefined,
        autoReplyEnabled: data.autoReplyEnabled !== false,
        target,
      };
    }
  }

  console.error('[instagram] aucune connexion trouvée');
  return null;
}

async function sendTypingOn(igToken: string, customerId: string) {
  try {
    await fetchWithTimeout(
      `https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(igToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: customerId }, sender_action: "typing_on" }),
      },
      3000
    );
  } catch {
    /* purement cosmétique */
  }
}

async function sendInstagramMessage(igToken: string, customerId: string, text: string) {
  try {
    const res = await fetchWithTimeout(
      `https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(igToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: customerId }, message: { text } }),
      },
      8000
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[instagram] envoi du message refusé:", res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[instagram] envoi du message impossible (timeout ou réseau):", e?.message || e);
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pushPendingMessage(
  env: Env,
  integration: any,
  customerId: string,
  existingPending: Array<{ text: string; mid: string | null }>,
  text: string,
  mediaPlaceholder: string,
  message: any
): Promise<string> {
  const token = crypto.randomUUID();
  const pendingMessages = [
    ...existingPending,
    { text: text || mediaPlaceholder, mid: message?.mid || null },
  ];

  await saveThread(env, integration.integrationId, customerId, { pendingMessages, pendingToken: token });

  return token;
}

/** Traitement d'un message privé : infos de l'entreprise ➜ IA ➜ réponse. */
/**
 * Réponse à une petite politesse (bonjour / merci / au revoir).
 *
 * Le « message de premier contact » du marchand n'est utilisé QU'au premier
 * échange (`conversationStarted = false`). En pleine conversation, un « merci »
 * ou un nouveau « salam » reçoit une réponse courte adaptée : renvoyer
 * « Bienvenue chez… » au milieu d'une discussion coupait net la conversation
 * (le client perdait le fil, et la commande/le rendez-vous en cours avec).
 * Renvoie `null` quand seul l'IA peut répondre (ex : un « oui » qui répond à la
 * question précédente du bot).
 */
export function greetingReply(
  customGreeting: string | undefined,
  groupedText: string,
  config: any,
  conversationStarted = false,
): string | null {
  const kind = classifySmallTalk(groupedText);
  if (!kind) return null;
  const custom = String(customGreeting || "").trim();
  const useCustom = !conversationStarted && kind === 'greeting' && custom && custom !== LEGACY_DEFAULT_GREETING;
  if (useCustom) return renderTemplate(custom, { businessName: String(config?.businessName || "") }) || localGreeting(groupedText, config);
  return localPoliteReply(kind, config, { conversationStarted });
}

async function handleDirectMessage(env: Env, event: any, waitUntil?: (promise: Promise<any>) => void) {
  const startedAt = Date.now();
  const customerId: string | undefined = event?.sender?.id;
  const instagramAccountId: string | undefined = event?.recipient?.id;
  const message = event?.message;

  // 🔁 ÉCHO = copie d'un message envoyé par un compte ABONNÉ (le marchand).
  // Si ce message est un code d'activation JF-… adressé au compte JawebFlow,
  // on le traite ICI : l'abonnement du MARHAND suffit — on ne dépend plus de
  // celui du compte JawebFlow pour capter les codes.
  if (message?.is_echo) {
    const echoText = typeof message?.text === "string" ? message.text.trim() : "";
    if (/^JF[-\s]?[A-Z2-9]{4,10}$/i.test(echoText)) {
      try { if (await handleNotifyAccountMessage(env, event, true)) return; } catch { /* continue */ }
    }
    return;
  }
  if (!customerId || !instagramAccountId) return;

  const text: string = typeof message?.text === "string" ? message.text.trim() : "";
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const hasAttachment = attachments.length > 0;
  const hasSharedContent = Boolean(message?.share || message?.is_unsupported);
  const hasUserMedia = hasAttachment || hasSharedContent;
  // Uniquement un type explicitement « image » peut être envoyé à Gemini Vision.
  // Un lien, un reel ou un partage de forme inconnue reste du contenu non inspecté.
  const hasImageAttachment = attachments.some((attachment: any) => attachment?.type === 'image');
  if (hasUserMedia) {
    console.info('[instagram][dm-shape]', JSON.stringify(summarizeInstagramMessageShape(message)));
  }
  if (!text && !hasUserMedia) return;

  const integration = await findIntegration(env, instagramAccountId);
  if (!integration?.igToken || !integration.accessToken) {
    // 🏢 Message adressé au compte JawebFlow (notificateur / guide) ?
    // -> code d'activation JF-XXXXX ou aide. JAMAIS traité comme un bot marchand.
    try { if (await handleNotifyAccountMessage(env, event)) return; } catch { /* continue */ }
    return;
  }

  // Le jeton approche l'expiration Meta ? Renouvelle-le en silence.
  await refreshInstagramTokenIfNeeded(env, integration);

  // Une reprise en main par le commerçant met en pause l'IA ET les règles
  // automatiques de ce fil jusqu'à ce que le marchand rende la main.
  let pendingOrderManagement = false;
  if (integration.assistantId && supabaseConfigured(env)) {
    try {
      const handoffRes = await supabaseRequest(env, `prospects?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&data->>igUserId=eq.${encodeURIComponent(customerId)}&select=id,data&limit=1`);
      const handoffRows = handoffRes.ok ? await handoffRes.json().catch(() => []) : [];
      const handoffLead = handoffRows?.[0];
      pendingOrderManagement = Boolean(handoffLead?.data?.orderChangeDraft);
      if (handoffLead?.data?.handoffStatus === 'human') {
        if ((text || hasUserMedia) && handoffLead.id) {
          const now = new Date().toISOString();
          await supabaseUpsertProspect(env, handoffLead.id, integration.assistantId, {
            lastInteractionAt: now,
            messages: [{ sender: 'user', text: text.slice(0, 500) || '[Pièce jointe reçue]', timestamp: now }],
          });
        }
        console.log('[instagram] prise en main humaine active — IA et automatisations en pause');
        return;
      }
    } catch { /* le CRM ne doit pas interrompre le traitement du webhook */ }
  }

  // 🎯 AUTOMATISATIONS (style ManyChat) : mots-clés, réponses et mentions de
  // stories. Elles passent AVANT l'IA et ne dépendent PAS du réglage « IA »
  // ci-dessous : un marchand peut couper l'IA et garder ses règles.
  if (integration.userId && !pendingOrderManagement && !detectOrderManagementIntent(text)) {
    const account: IgAccount = {
      userId: integration.userId,
      igUserId: instagramAccountId,
      token: integration.igToken,
      assistantId: integration.assistantId,
      respondToStories: integration.respondToStories,
      lastConnectedAt: integration.lastConnectedAt,
    };
    const verdict = await runDmAutomations(env, account, event);
    if (verdict === "handled" || verdict === "ignored") return;
  }

  if (!integration.autoReplyEnabled) {
    console.log('[instagram] réponses automatiques en pause pour ce compte');
    return;
  }

  // 📖 Réponse à une story : réglage « Réponses aux réactions de stories » désactivé → l'IA se tait.
  if (message?.reply_to?.story && integration.respondToStories === false) {
    console.log("[instagram] réponse à une story ignorée (réglage désactivé par le marchand)");
    return;
  }

  // Historique + buffer : table Supabase instagram_threads
  // (avant : document Firestore instagram_integrations/{uid}/threads/{customerId}).
  const thread = await readThread(env, integration.integrationId, customerId);
  const stored = Array.isArray(thread.messages) ? thread.messages : [];
  const handledMids: string[] = Array.isArray(thread.handledMids) ? thread.handledMids : [];
  const existingPending: Array<{ text: string; mid: string | null }> =
    Array.isArray(thread.pendingMessages) ? thread.pendingMessages : [];

  if (message?.mid && handledMids.includes(message.mid)) {
    console.log('[instagram] doublon de message ignoré');
    return;
  }

  // 1) Dépôt dans le buffer partagé
  const myToken = await pushPendingMessage(
    env,
    integration,
    customerId,
    existingPending,
    text,
    hasUserMedia ? (hasImageAttachment ? '[image envoyée]' : '[contenu Instagram partagé — format non identifié]') : '',
    message
  );
  console.log(`[instagram] message mis en attente : ${text ? `texte (${text.length} caractères)` : hasImageAttachment ? '[image]' : '[contenu partagé]'}`);

  // 2) Attente pour regrouper les messages suivants
  await sleep(DEBOUNCE_MS);

  const recheck = await readThread(env, integration.integrationId, customerId);
  const currentToken = recheck.pendingToken;

  if (currentToken !== myToken) {
    console.log('[instagram] un message plus récent est arrivé, traitement précédent cédé');
    return;
  }

  // 3) Traitement groupé
  const pendingMessages: Array<{ text: string; mid: string | null }> = Array.isArray(recheck.pendingMessages)
    ? recheck.pendingMessages
    : [];

  if (pendingMessages.length === 0) {
    console.log("[instagram] buffer déjà vidé par un autre appel, rien à faire.");
    return;
  }

  const groupedText = pendingMessages.map((m) => m.text).filter(Boolean).join("\n");
  const newMids = pendingMessages.map((m) => m.mid).filter(Boolean) as string[];
  console.log(
    `[instagram] regroupement de ${pendingMessages.length} message(s) (${Date.now() - startedAt}ms écoulées), ${groupedText.length} caractère(s)`
  );

  const freshStored = Array.isArray(recheck.messages) ? recheck.messages : stored;
  const history = freshStored
    .filter((m: any) => (m?.role === "user" || m?.role === "model") && typeof m.text === "string")
    .slice(-HISTORY_LIMIT)
    .map((m: any) => ({ role: m.role, text: m.text }));

  let config: any = {};
  if (integration.assistantId) {
    // Supabase d'abord (base principale depuis la migration) ; Firestore en
    // filet de sécurité pour les assistants pas encore migrés.
    if (supabaseConfigured(env)) {
      const sb = await supabaseGetAssistant(env, integration.assistantId);
      if (sb.ok && sb.data) config = supabaseAssistantRowToConfig(sb.data);
    }
    if (!config || Object.keys(config).length === 0) {
      let read = await readDocument(
        env,
        integration.accessToken,
        `assistants/${integration.assistantId}`,
        integration.target
      );
      if (!read.ok) {
        read = await readDocument(env, integration.accessToken, `assistants/${integration.assistantId}`);
      }
      if (read.ok) config = read.data;
      else console.warn('[instagram] configuration de l’entreprise introuvable');
    }
  } else {
    console.warn("[instagram] aucun assistantId enregistré sur la connexion Instagram");
  }

  // RAG : n'envoyer que les faits qui recoupent la question actuelle.
  const businessContext: Record<string, any> = {};
  const salesIntent = detectSalesIntent(groupedText);
  let trackedProspectId: string | null = null;
  let followUpRecorded = false;
  let createdOrder: ReturnType<typeof createPendingOrderRequest> | null = null;
  let orderChangeHandled = false;
  const latestUserText = String(pendingMessages[pendingMessages.length - 1]?.text || groupedText);
  if (integration.assistantId && supabaseConfigured(env)) {
    const [knowledge, documents] = await Promise.all([
      supabaseListKnowledgeEntries(env, integration.assistantId),
      supabaseListKnowledge(env, integration.assistantId),
    ]);
    if (knowledge.available && knowledge.entries.length > 0) config.knowledgeNotes = knowledge.entries;
    const relevantNotes = compactKnowledgeNotes(Array.isArray(config.knowledgeNotes) ? config.knowledgeNotes : [], groupedText);
    if (relevantNotes) businessContext.knowledge = relevantNotes.slice(0, 6_000);
    const relevantDocuments = selectKnowledgeDocuments(documents, groupedText, 5);
    if (relevantDocuments.length) {
      businessContext.siteSources = relevantDocuments.map((doc: any) => ({
        title: String(doc.title || 'Document').slice(0, 140),
        excerpt: String(doc.content || '').slice(0, 620),
        ...(doc.source_url ? { url: String(doc.source_url).slice(0, 400) } : {}),
      }));
    }
  }
  const relevantFaq = selectRelevantText(config?.faqText, groupedText, 4, 900);
  if (relevantFaq) businessContext.faq = relevantFaq;
  const relevantPricing = selectRelevantText(config?.pricingServicesText, groupedText, 5, 1_200);
  if (relevantPricing) businessContext.pricingAndServices = relevantPricing;

  // MÉMOIRE UNIFIÉE (site + Instagram) et CRM : relie un client déjà connu,
  // conserve son fil et enregistre aussi les intentions d'achat sans contact.
  if (integration.assistantId && supabaseConfigured(env)) {
    try {
      const phoneInMsg = groupedText.match(/(?:(?:\+|00)213|0)\s?[5-7](?:[\s.-]?[0-9]){8}/);
      let known: any = null;
      let knownByInstagram = false;
      const pBase = `prospects?assistant_id=eq.${encodeURIComponent(integration.assistantId)}`;
      const byIg = await supabaseRequest(env, `${pBase}&data->>igUserId=eq.${encodeURIComponent(customerId)}&select=id,data&limit=1`);
      if (byIg.ok) {
        known = (await byIg.json())?.[0] || null;
        knownByInstagram = Boolean(known?.id);
      }
      if (!known && phoneInMsg) {
        const phone = phoneInMsg[0].replace(/[\s.-]/g, '');
        const byPhone = await supabaseRequest(env, `${pBase}&data->>phone=eq.${encodeURIComponent(phone)}&select=id,data&limit=1`);
        if (byPhone.ok) known = (await byPhone.json())?.[0] || null;
      }
      if (knownByInstagram && (known?.data?.orderChangeDraft || detectOrderManagementIntent(groupedText))) {
        const orderFlow = processOrderChangeMessage({
          message: groupedText,
          orders: Array.isArray(known?.data?.orders) ? known.data.orders : [],
          draft: known?.data?.orderChangeDraft || null,
        });
        if (orderFlow.handled) {
          orderChangeHandled = true;
          const nowIso = new Date().toISOString();
          const orderReply = String(orderFlow.reply || 'Votre demande de commande est mise à jour.');
          trackedProspectId = known.id;
          await supabaseUpsertProspect(env, known.id, integration.assistantId, {
            ...(Array.isArray(orderFlow.orders) ? { orders: orderFlow.orders } : {}),
            orderChangeDraft: orderFlow.orderChangeDraft ?? null,
            lastInteractionAt: nowIso,
            messages: [{ sender: 'user', text: groupedText.slice(0, 500), timestamp: nowIso }],
          });
          let sent = false;
          try { sent = await sendInstagramMessage(integration.igToken, customerId, orderReply); } catch { /* l'état CRM reste la source de vérité */ }
          if (sent) {
            try {
              await supabaseUpsertProspect(env, known.id, integration.assistantId, {
                lastInteractionAt: new Date().toISOString(),
                messages: [{ sender: 'bot', text: orderReply.slice(0, 500), timestamp: new Date().toISOString() }],
              });
            } catch { /* le fil peut être reconstruit depuis la conversation Instagram */ }
          }
          try {
            await supabaseLogConversation(env, {
              assistantId: integration.assistantId, channel: 'instagram', sessionId: `ig_${customerId}`,
              message: groupedText, response: orderReply, model: 'order-management', weight: 1,
            });
          } catch { /* le changement de commande ne dépend pas du compteur de quota */ }
          const orderThreadMessages = [
            ...freshStored.filter((entry: any) => entry?.role === 'user' || entry?.role === 'model'),
            { role: 'user', text: groupedText.slice(0, 500), ts: nowIso },
            ...(sent ? [{ role: 'model', text: orderReply, ts: nowIso }] : []),
          ].slice(-THREAD_KEEP);
          try {
            await saveThread(env, integration.integrationId, customerId, {
              messages: orderThreadMessages,
              pendingMessages: [],
              handledMids: [...handledMids, ...newMids].slice(-30),
            });
          } catch (error: any) {
            console.warn('[instagram][order] conversation non archivée:', error?.message || error);
          }
          return;
        }
      }
      if (known?.data) {
        const d = known.data;
        const priorMsgs = Array.isArray(d.messages)
          ? d.messages.slice(-4).map((m: any) => `- ${m.sender === 'user' ? 'Client' : 'Assistant'} : ${String(m.text || '').slice(0, 120)}`).join('\n')
          : '';
        if (priorMsgs || d.need || d.phone) {
          businessContext.customerMemory = {
            name: String(d.name || '').slice(0, 120),
            phone: String(d.phone || (phoneInMsg ? phoneInMsg[0] : '')).slice(0, 40),
            city: String(d.city || '').slice(0, 100),
            initialRequest: String(d.need || '').slice(0, 200),
            ...(priorMsgs ? { recentMessages: priorMsgs.slice(0, 1_400) } : {}),
            instruction: 'Le client revient d’un autre canal. Continue naturellement le fil, sans répéter ni révéler plus de données personnelles que nécessaire.',
          };
          console.log('[instagram] mémoire client intercanal réutilisée');
        }
      }

      const facts = extractLeadFacts(groupedText);
      const factsPatch: Record<string, any> = {
        ...(facts.phone ? { phone: facts.phone } : {}),
        ...(facts.name ? { name: facts.name } : {}),
        ...(facts.city ? { city: facts.city } : {}),
        ...(facts.email ? { email: facts.email } : {}),
      };
      const hasFacts = Boolean(facts.phone || facts.name || facts.city || facts.email);
      const draft = known?.data?.orderDraft;
      const orderConfirmed = known?.data?.handoffStatus !== 'human' && (
        isExplicitOrderConfirmation(latestUserText)
        || (draft?.status === 'awaiting_confirmation' && isAffirmative(latestUserText))
      );
      // Ce que le client valide n'est pas forcément une « commande » : visite,
      // rendez-vous, réservation ou devis sont enregistrés tels quels.
      const confirmedDealKind = detectConfirmedDealKind(latestUserText)
        || (draft?.status === 'awaiting_confirmation' && isAffirmative(latestUserText) ? draft?.kind : null)
        || null;
      if (known?.id || hasFacts || salesIntent || orderConfirmed || draft?.status === 'awaiting_confirmation') {
        const now = new Date();
        const nowIso = now.toISOString();
        const isNew = !known?.id;
        // Le fil de DM est un moyen de contact exploitable même sans téléphone.
        const contactAvailable = Boolean(customerId || facts.phone || facts.email || known?.data?.phone || known?.data?.email);
        const followUpPatch = salesIntent
          ? buildLeadFollowUp(salesIntent, groupedText, 'Instagram', now, contactAvailable)
          : (isNew && contactAvailable ? buildLeadFollowUp(null, groupedText, 'Instagram', now, true) : {});
        const prospectId = known?.id || `${integration.assistantId}_ig_${customerId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
        const savedMessages = Array.isArray(known?.data?.messages) ? known.data.messages.slice(-8) : [];
        const conversationSummary = [
          ...savedMessages.map((entry: any) => `${entry.sender === 'bot' ? 'Assistant' : 'Client'} : ${String(entry.text || '').slice(0, 350)}`),
          `Client : ${groupedText.slice(0, 500)}`,
        ].join('\n').slice(-2_000);
        if (orderConfirmed) {
          const orderEventId = newMids[newMids.length - 1] || message?.mid || crypto.randomUUID();
          createdOrder = createPendingOrderRequest({
            id: `ig_${orderEventId}`,
            channel: 'Instagram',
            summary: String(draft?.summary || conversationSummary),
            customerName: facts.name || known?.data?.name,
            phone: facts.phone || known?.data?.phone,
            city: facts.city || known?.data?.city,
            kind: confirmedDealKind,
            now,
          });
        }
        const invalidateOldDraft = draft?.status === 'awaiting_confirmation' && !orderConfirmed;
        const nextDraft = invalidateOldDraft
          ? { ...draft, status: 'collecting', summary: conversationSummary, updatedAt: nowIso }
          : null;
        await supabaseUpsertProspect(env, prospectId, integration.assistantId, {
          source: known?.data?.source || 'Instagram', channel: 'instagram', igUserId: customerId,
          sessionId: `ig_${customerId}`,
          ...factsPatch,
          ...(phoneInMsg && !facts.phone ? { phone: phoneInMsg[0].replace(/[\s.-]/g, '') } : {}),
          ...(isNew || salesIntent || orderConfirmed ? { status: 'qualifie' } : {}),
          ...(isNew || (salesIntent && !orderConfirmed) ? { need: groupedText.slice(0, 2_000) } : {}),
          ...(salesIntent ? { salesIntentType: salesIntent.type } : {}),
          ...(Object.keys(followUpPatch).length ? followUpPatch : {}),
          ...(createdOrder ? { orders: [createdOrder], orderDraft: null } : invalidateOldDraft ? { orderDraft: nextDraft } : {}),
          lastInteractionAt: nowIso,
          ...(groupedText ? { messages: [{ sender: 'user', text: groupedText.slice(0, 500), timestamp: nowIso }] } : {}),
        });
        trackedProspectId = prospectId;
        followUpRecorded = Boolean(followUpPatch.followUpStatus);
        if (followUpRecorded) businessContext.followUpRecorded = {
          status: 'pending', reason: followUpPatch.followUpReason,
          nextAction: followUpPatch.nextAction,
          note: 'Le suivi est enregistré pour le commerçant dans son espace prospects. Ne prétends pas qu’un rappel client est déjà effectué ou planifié.',
        };
        if (createdOrder) {
          businessContext.orderCreated = buildDealCreatedContext(createdOrder);
          console.log(`[instagram][order] ${createdOrder.kindLabel} ${createdOrder.reference} enregistrée pour validation par la boutique`);
        }
        if (Object.keys(factsPatch).length) console.log('[instagram] fiche client enrichie/corrigée, champs :', Object.keys(factsPatch).join(', '));

        const newlyCapturedContact = Boolean((facts.phone && !known?.data?.phone) || (facts.email && !known?.data?.email));
        if (newlyCapturedContact || salesIntent?.priority === 'high' || createdOrder) {
          const leadPayload = {
            ...factsPatch,
            ...(phoneInMsg && !facts.phone ? { phone: phoneInMsg[0].replace(/[\s.-]/g, '') } : {}),
            need: groupedText.slice(0, 200), source: 'Instagram',
            ...(salesIntent ? { salesIntentType: salesIntent.type, nextAction: salesIntent.nextAction } : {}),
            ...(createdOrder ? { orderReference: createdOrder.reference, dealKind: createdOrder.kind, dealKindLabel: createdOrder.kindLabel } : {}),
          };
          try { await notifyLead(env, integration.assistantId, leadPayload); } catch { /* best-effort */ }
          try {
            await forwardLeadInBackground(env, integration.assistantId, { ...leadPayload, contactKey: customerId }, waitUntil);
          } catch { /* best-effort */ }
        }
      }
    } catch (memErr: any) {
      console.warn('[instagram] mémoire client indisponible:', memErr?.message || memErr);
      if (orderChangeHandled) {
        const failureText = 'Je n’ai pas pu enregistrer ce changement pour le moment. La commande n’a pas été modifiée ; réessayez dans un instant ou contactez la boutique.';
        let sent = false;
        try { sent = await sendInstagramMessage(integration.igToken, customerId, failureText); } catch { /* best-effort */ }
        try {
          await saveThread(env, integration.integrationId, customerId, {
            messages: [
              ...freshStored.filter((entry: any) => entry?.role === 'user' || entry?.role === 'model'),
              { role: 'user', text: groupedText.slice(0, 500), ts: new Date().toISOString() },
              ...(sent ? [{ role: 'model', text: failureText, ts: new Date().toISOString() }] : []),
            ].slice(-THREAD_KEEP),
            pendingMessages: [],
            handledMids: [...handledMids, ...newMids].slice(-30),
          });
        } catch { /* le webhook ne doit pas retraiter le message en boucle */ }
        return;
      }
    }
  }

  // QUOTAS PAR PLAN (mêmes règles que /api/chat) : Gratuit = 0 crédit IA,
  // Basic 1 000 conv/mois, Pro 5 000, Enterprise illimité. Limite atteinte =>
  // on envoie le message de blocage au lieu de la réponse IA.
  if (integration.assistantId && supabaseConfigured(env)) {
    const limits = await supabaseGetPlanLimits(env);
    // Sans plan enregistré => 'basic' : ne pas couper les assistants existants.
    const plan = String(config?.plan || "basic").toLowerCase();
    const limit = plan in limits ? limits[plan] : limits.free;
    const used = typeof limit === "number" && limit > 0
      ? await supabaseCountMonthlyConversations(env, integration.assistantId)
      : 0;
    if (limit === 0 || (typeof limit === "number" && limit > 0 && used >= limit)) {
      const blockMsg = limit === 0 ? LIMIT_BLOCK_FREE : limitBlockReached(plan, limit);
      console.log(`[instagram] plan ${plan} : quota ${used}/${limit} — réponse IA bloquée`);
      await sendInstagramMessage(integration.igToken, customerId, blockMsg);
      return;
    }
    // 💸 Plafond de COÛT RÉEL (Vrais tokens × tarif officiel) :
    // Basic 3 $ · Pro 9 $ · Enterprise 30 $ / mois. Au plafond => pause propre.
    const costCheck = await monthlyCostBlock(env, integration.assistantId, plan);
    if (costCheck.exceeded) {
      console.log(`[instagram] plan ${plan} : plafond coût ${costCheck.cost.toFixed(2)}/${costCheck.cap} $ — réponse IA bloquée`);
      await sendInstagramMessage(integration.igToken, customerId, costCheck.msg!);
      return;
    }
  }

  // ✋ STOP / reprise : le client garde la main (règle de comportement).
  if (config?.behavior?.stopCommand !== false && integration.assistantId) {
    const sessionKey = `ig_${customerId}`;
    const normMsg = groupedText.trim().toLowerCase().replace(/[!?.,;:]+$/g, "").trim();
    const STOP_WORDS = ["stop", "arrete", "arrête", "arrêtes", "silence", "assez", "توقف"];
    const RESUME_WORDS = ["reprends", "reprend", "continue", "continu", "go", "كمل"];
    try {
      if (STOP_WORDS.includes(normMsg)) {
        await supabaseRequest(env, "bot_mutes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({ assistant_id: integration.assistantId, session_id: sessionKey }),
        });
        await sendInstagramMessage(integration.igToken, customerId, "D'accord, je ne vous dérange plus. Écrivez « reprends » quand vous voudrez me relancer. 😊");
        return;
      }
      if (RESUME_WORDS.includes(normMsg)) {
        await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}`, { method: "DELETE" });
        const leadRes = await supabaseRequest(env, `prospects?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&data->>igUserId=eq.${encodeURIComponent(customerId)}&select=id&limit=1`);
        if (leadRes.ok) {
          const leadRows = await leadRes.json().catch(() => []);
          if (leadRows?.[0]?.id) await supabaseUpsertProspect(env, leadRows[0].id, integration.assistantId, { handoffStatus: 'bot', handoffAt: new Date().toISOString() });
        }
        await sendInstagramMessage(integration.igToken, customerId, "C'est reparti ! 😊 Comment puis-je vous aider ?");
        return;
      }
      const mRes = await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}&select=assistant_id`);
      if (mRes.ok) {
        const mRows = await mRes.json().catch(() => []);
        if (Array.isArray(mRows) && mRows.length > 0) {
          console.log("[instagram] bot silencieux (le client a dit stop) — aucun envoi.");
          return;
        }
      }
    } catch { /* ne jamais bloquer le bot pour ça */ }
  }

  // 🙋 TRANSFERT HUMAIN : consigner la demande puis répondre sans appel IA.
  if (groupedText && isHumanTransfer(groupedText)) {
    const now = new Date();
    let prospectId = trackedProspectId;
    if (integration.assistantId && supabaseConfigured(env)) {
      try {
        prospectId ||= `${integration.assistantId}_ig_${customerId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
        const followUp = buildLeadFollowUp(
          { type: 'appointment', priority: 'high', nextAction: 'Recontacter le client pour poursuivre sa demande' },
          groupedText, 'Instagram', now, true,
        );
        await supabaseRequest(env, 'bot_mutes', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ assistant_id: integration.assistantId, session_id: `ig_${customerId}` }) });
        await supabaseUpsertProspect(env, prospectId, integration.assistantId, {
          source: 'Instagram', channel: 'instagram', igUserId: customerId, sessionId: `ig_${customerId}`, handoffStatus: 'human', handoffAt: now.toISOString(),
          status: 'qualifie', salesIntentType: 'human_transfer', salesStage: 'qualified',
          need: groupedText.slice(0, 2_000), lastInteractionAt: now.toISOString(),
          ...followUp,
          messages: trackedProspectId
            ? [{ sender: 'bot', text: HUMAN_TRANSFER_REPLY, timestamp: now.toISOString() }]
            : [
                { sender: 'user', text: groupedText.slice(0, 500), timestamp: now.toISOString() },
                { sender: 'bot', text: HUMAN_TRANSFER_REPLY, timestamp: now.toISOString() },
              ],
        });
        trackedProspectId = prospectId;
        followUpRecorded = true;
      } catch (error: any) {
        console.warn('[instagram][lead] demande de transfert non enregistrée:', error?.message || error);
      }
    }
    await sendInstagramMessage(integration.igToken, customerId, HUMAN_TRANSFER_REPLY);
    try { await notifyHumanTransfer(env, integration.assistantId, `Client Instagram (${customerId})`, groupedText); } catch { /* best-effort */ }
    try {
      const msgs = [...stored.filter((m: any) => m?.role === 'user' || m?.role === 'model'), { role: 'user', text: groupedText.slice(0, 500), ts: now.toISOString() }, { role: 'model', text: HUMAN_TRANSFER_REPLY, ts: now.toISOString() }].slice(-HISTORY_LIMIT);
      await saveThread(env, integration.integrationId, customerId, { messages: msgs, handledMids: newMids });
    } catch { /* historique non bloquant */ }
    return;
  }

  sendTypingOn(integration.igToken, customerId).catch(() => {});

  // Recherche RAG en direct sur le catalogue du marchand ; seuls les résultats
  // pertinents sont joints à ce tour (jamais injectés dans le prompt système).
  let incoming = groupedText;
  let imageDescription = '';
  let shoppingRan = false;
  if (hasUserMedia && !hasImageAttachment) {
    businessContext.sharedMediaUnavailable = { contentAvailable: false, platform: 'Instagram' };
  }
  if (config?.siteShopping && config?.websiteUrl && config?.behavior?.websiteMentions !== 'never') {
    if (hasImageAttachment && message?.mid && env.GEMINI_API_KEY) {
      imageDescription = (await describeAttachmentImage(env, integration.igToken, message.mid)) || '';
      if (imageDescription) console.log(`[instagram] photo décrite (${imageDescription.length} caractères), contenu non journalisé`);
    }
    const shoppingQuery = [groupedText, imageDescription].filter(Boolean).join(' ').trim();
    if (shoppingQuery) {
      shoppingRan = true;
      const found = await searchClientSite(config, shoppingQuery);
      if (found.length) {
        businessContext.siteProducts = found.slice(0, 5).map((product) => ({
          title: String(product.title || 'Article').slice(0, 180),
          url: String(product.url || '').slice(0, 500),
        }));
        console.log(`[instagram] ${found.length} produit(s) trouvé(s) sur le site`);
      }
    }
  }

  // 🆓 politesse pure -> réponse locale gratuite (pas d'IA, pas de quota).
  // Le bot muet (le client a dit stop) reste muet.
  const smallTalkKind = !createdOrder ? classifySmallTalk(incoming || groupedText) : null;
  if (smallTalkKind) {
    if (integration.assistantId && config?.behavior?.stopCommand !== false) {
      try {
        const mRes = await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&session_id=eq.ig_${encodeURIComponent(customerId)}&select=assistant_id`);
        const mRows = mRes.ok ? await mRes.json().catch(() => []) : [];
        if (Array.isArray(mRows) && mRows.length > 0) return;
      } catch { /* ignore */ }
    }
    // ⛔ Le message de bienvenue n'est envoyé QU'au premier contact : dès qu'un
    // échange a déjà eu lieu, on ne recommence JAMAIS par « Bienvenue chez… ».
    const conversationStarted = history.length > 0;
    const politeReply = greetingReply(integration.customGreeting, groupedText, config, conversationStarted);
    if (politeReply) {
      console.log(`[instagram] politesse (${smallTalkKind}) -> réponse locale sans IA`);
      const sentPolite = await sendInstagramMessage(integration.igToken, customerId, politeReply);
      const nowIso = new Date().toISOString();
      if (sentPolite && trackedProspectId && integration.assistantId && supabaseConfigured(env)) {
        const write = supabaseUpsertProspect(env, trackedProspectId, integration.assistantId, {
          lastInteractionAt: nowIso,
          messages: [{ sender: 'bot', text: politeReply.slice(0, 500), timestamp: nowIso }],
        });
        if (waitUntil) waitUntil(write.catch((error) => console.warn('[instagram][lead] réponse non journalisée:', error?.message || error)));
        else await write.catch((error) => console.warn('[instagram][lead] réponse non journalisée:', error?.message || error));
      }
      // Le buffer DOIT être vidé et l'échange archivé : sans ça, le message de
      // politesse restait en attente et se retrouvait mélangé au message suivant
      // (le bot répondait deux fois à côté de la plaque).
      try {
        await saveThread(env, integration.integrationId, customerId, {
          messages: [
            ...freshStored.filter((entry: any) => entry?.role === 'user' || entry?.role === 'model'),
            { role: 'user', text: groupedText.slice(0, 500), ts: nowIso },
            ...(sentPolite ? [{ role: 'model', text: politeReply, ts: nowIso }] : []),
          ].slice(-THREAD_KEEP),
          pendingMessages: [],
          handledMids: [...handledMids, ...newMids].slice(-30),
        });
      } catch (error: any) {
        console.warn('[instagram] conversation non archivée après politesse:', error?.message || error);
      }
      return;
    }
    // Un « oui » / « ok » en pleine conversation répond à la question précédente
    // du bot : seule l'IA (qui lit l'historique) sait quoi en faire.
    console.log(`[instagram] politesse (${smallTalkKind}) en pleine conversation -> l'IA répond avec l'historique`);
  }

  if (!incoming) {
    incoming = hasImageAttachment
      ? (imageDescription || 'Le client a envoyé une image dont le contenu n’est pas disponible.')
      : hasUserMedia
        ? 'Le client a partagé un média Instagram, mais son contenu n’est pas disponible dans ce message. Réponds brièvement sans prétendre l’avoir vu.'
        : 'Le client a envoyé un message vide.';
  }

  // 📸 FIX : l'IA voit la VRAIE photo dans tous les cas (shopping inclus) :
  // elle compare l'article visible avec la BASE DE CONNAISSANCE + les produits
  // trouvés sur le site, et choisit le plus proche (ex : t-shirt blanc « l'amour »
  // -> le t-shirt amor blanc du site ; coque Spider-Man rouge -> le lien exact).
  let inlineImage: { mime: string; base64: string } | null = null;
  if (hasImageAttachment && message?.mid) {
    inlineImage = await fetchAttachmentImage(env, integration.igToken, message.mid);
    if (inlineImage && !incoming) {
      incoming = "Le client a envoyé cette photo. Identifie PRÉCISÉMENT l'article (catégorie exacte, couleur, personnage/texte visible), compare-le avec notre base de connaissance et les produits trouvés ci-dessous, puis propose le produit le plus proche avec son lien.";
    }
  }

  console.log(`[instagram] appel IA démarré (${Date.now() - startedAt}ms écoulées)`);
  const { text: aiText, diagnostics, usage: aiUsage } = await generateReply(
    env,
    buildSystemPrompt(config),
    incoming,
    history,
    inlineImage,
    (createdOrder || salesIntent?.priority === 'high') ? 180 : (config?.behavior?.length === 'detailed' ? 700 : 450),
    businessContext,
    waitUntil,
  );
  console.log(`[instagram] diagnostics IA (${Date.now() - startedAt}ms écoulées):`, diagnostics.join(" | "));

  const businessName = config?.businessName || "notre équipe";
  const quotaWeight = 1
    + ((hasImageAttachment && (Boolean(imageDescription) || Boolean(inlineImage))) ? 3 : 0)
    + (shoppingRan ? 2 : 0);
  const replyText =
    aiText ||
    (hasUserMedia && !groupedText
      ? (hasImageAttachment
        ? 'Merci pour la photo 🙏 Pouvez-vous nous écrire ce que vous souhaitez savoir ?'
        : 'Merci pour le partage 🙏 Que souhaitez-vous savoir à son sujet ?')
      : `Merci pour votre message 🙏 Nous revenons vers vous dans quelques instants (${businessName}).`);

  const sent = await sendInstagramMessage(integration.igToken, customerId, replyText);
  console.log(`[instagram] message envoyé=${sent} (${Date.now() - startedAt}ms écoulées)`);

  const askedDealKind = detectConfirmationQuestionKind(replyText);
  if (sent && trackedProspectId && !createdOrder && askedDealKind && integration.assistantId && supabaseConfigured(env)) {
    const draftMessages = [
      ...history.filter((entry) => entry.role === 'user').slice(-4).map((entry) => `Client : ${String(entry.text || '').slice(0, 350)}`),
      `Client : ${groupedText.slice(0, 500)}`,
    ];
    try {
      await supabaseUpsertProspect(env, trackedProspectId, integration.assistantId, {
        orderDraft: {
          status: 'awaiting_confirmation',
          channel: 'Instagram',
          // Nature de la demande : un « oui » qui suit valide CETTE demande
          // (visite, rendez-vous, réservation, devis ou commande).
          kind: askedDealKind,
          summary: draftMessages.join('\\n').slice(-2_000),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.warn('[instagram][order] confirmation en attente non sauvegardée:', error?.message || error);
    }
  }

  if (sent && trackedProspectId && integration.assistantId && supabaseConfigured(env)) {
    const recordReply = supabaseUpsertProspect(env, trackedProspectId, integration.assistantId, {
      lastInteractionAt: new Date().toISOString(),
      messages: [{ sender: 'bot', text: String(replyText).slice(0, 500), timestamp: new Date().toISOString() }],
    });
    if (waitUntil) waitUntil(recordReply.catch((error) => console.warn('[instagram][lead] réponse non journalisée:', error?.message || error)));
    else await recordReply.catch((error) => console.warn('[instagram][lead] réponse non journalisée:', error?.message || error));
  }

  // Boucle d'apprentissage : si l'IA n'avait pas l'info, la question file
  // dans l'onglet "Apprentissage IA" (partagé avec le chat web).
  if (sent && integration.assistantId && supabaseConfigured(env)) {
    runBackgroundLearning(env, {
      assistantId: integration.assistantId,
      question: incoming,
      aiText: replyText,
      apiKey: env.GEMINI_API_KEY,
      chatModel: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    }).catch((e: any) => console.error("[instagram][learning]", e?.message || e));
    // Compteur de quota mensuel (1 ligne = 1 conversation consommée).
    supabaseLogConversation(env, {
      assistantId: integration.assistantId,
      channel: "instagram",
      sessionId: `ig_${customerId}`,
      message: incoming,
      response: replyText,
      weight: quotaWeight,
      tokensIn: aiUsage?.promptTokens,
      tokensOut: aiUsage?.outputTokens,
      model: aiUsage?.model,
    }).catch((e: any) => console.error("[instagram][quota]", e?.message || e));
  }

  const messages = [
    ...freshStored.map((m: any) => ({ role: m.role, text: m.text })),
    ...(groupedText ? [{ role: "user", text: groupedText }] : []),
    ...(sent ? [{ role: "model", text: replyText }] : []),
  ].slice(-THREAD_KEEP);

  await saveThread(env, integration.integrationId, customerId, {
    messages,
    pendingMessages: [],
    handledMids: [...handledMids, ...newMids].slice(-30),
  });
}

/** Un bouton d'une automatisation a été touché (ex. « ✅ C'est fait » après « suis mon compte »). */
async function handlePostbackEvent(env: Env, event: any) {
  const instagramAccountId: string | undefined = event?.recipient?.id;
  if (!instagramAccountId || !event?.sender?.id) return;
  const integration = await findIntegration(env, instagramAccountId);
  if (!integration?.igToken || !integration.userId) return;
  await refreshInstagramTokenIfNeeded(env, integration);
  await handleAutomationPostback(env, {
    userId: integration.userId,
    igUserId: instagramAccountId,
    token: integration.igToken,
    assistantId: integration.assistantId,
    respondToStories: integration.respondToStories,
    lastConnectedAt: integration.lastConnectedAt,
  }, event);
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
    const comments: Array<{ entryId: string; value: any }> = [];
    for (const entry of body.entry || []) {
      for (const messagingEvent of entry.messaging || []) events.push(messagingEvent);
      // 💬 Commentaires sous les publications : entry[].changes[] { field: "comments", value }
      for (const change of entry.changes || []) {
        if (change?.field === "comments" && change?.value) comments.push({ entryId: String(entry.id || ""), value: change.value });
      }
    }

    console.log(`[instagram] webhook reçu : ${events.length} événement(s), ${comments.length} commentaire(s)`);
    for (const ev of events) {
      const m = ev?.message;
      const kind = m
        ? (m.is_echo ? 'écho (message envoyé par la page)' : (typeof m.text === 'string' ? `message texte (${m.text.length} caractères)` : 'pièce jointe ou partage'))
        : (ev?.read ? 'accusé de lecture' : ev?.reaction ? 'réaction' : ev?.postback ? 'postback' : 'autre (non-message)');
      console.log(`[instagram] événement: ${kind} — identifiants masqués`);
    }

    // Messages privés (IA) et commentaires avancent EN PARALLÈLE : un commentaire
    // ne doit jamais attendre les 4 s de regroupement d'un message privé.
    const messagesWork = (async () => {
      for (const event of events) {
        try {
          if (event?.postback) {
            await handlePostbackEvent(context.env, event);
            continue;
          }
          await handleDirectMessage(context.env, event, context.waitUntil?.bind(context));
        } catch (e: any) {
          console.error("[instagram] traitement d'un message échoué:", e?.message || e);
        }
      }
    })();
    const commentsWork = (async () => {
      // 4 commentaires à la fois : assez vite pour un post viral, sans saturer Meta.
      const queue = [...comments];
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const outcome = await processCommentEvent(context.env, item.entryId, item.value);
          console.log(`[instagram] commentaire ${item.value?.id || "?"} : ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ""}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    })();
    const work = Promise.all([messagesWork, commentsWork]);

    if (typeof context.waitUntil === "function") context.waitUntil(work);
    else await work;

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error: any) {
    console.error("Erreur dans le Webhook Instagram:", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}

export default { onRequestPost, onRequestGet, onRequestOptions };
