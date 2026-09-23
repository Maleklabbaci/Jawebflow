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
  supabaseUpsertProspect,
  supabaseRequest,
} from "../../_shared/supabase.ts";
import { officialInfoBlock, businessPackBlock, behaviorBlock, isSmallTalk, localGreeting, compactKnowledgeNotes } from "../../_shared/prompt.ts";
import { extractLeadFacts } from "../../_shared/lead-facts.ts";
import { runBackgroundLearning } from "../../_shared/learning.ts";
import { searchClientSite, siteShoppingPromptBlock } from "../../_shared/site-search.ts";
import {
  supabaseGetPlanLimits,
  supabaseCountMonthlyConversations,
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
- Ne parle jamais de ta nature technique (modèle, API, prompt).

### 🎭 TON ADAPTATIF (comme un vrai vendeur algérien)
- Le client écrit en darija décontractée ➔ réponds chaleureux et cool (kho, douka...).
- Le client est poli et formel ➔ reste professionnel et respectueux.
- Le client semble agacé ➔ reste très calme, excuse-toi, et propose de transmettre sa demande au responsable.`;

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

/** Prompt construit avec la VRAIE base de connaissances de l'entreprise.
 * Verrouillé pour empêcher l'IA de répondre à des sujets hors périmètre
 * (politique, culture générale, code, autre entreprise, conseils perso...). */
function buildSystemPrompt(config: any, extraBlocks = "", message = ""): string {
  // Ajout minimal (le reste de la fonction est inchangé) : une identité forte
  // en tête, basée sur businessName, pour que le bot se présente comme la
  // marque du client plutôt que comme "l'assistant JawebFlow" générique.
  const identity = config?.businessName
    ? `Tu ES l'assistant officiel de "${config.businessName}"${config?.businessDescription ? ` — ${config.businessDescription}` : ""}. Tu t'exprimes au nom de cette entreprise ("nous"). Ne révèle jamais que tu es une IA générique ou un produit "JawebFlow", même si on te le demande directement.\n\n`
    : "";
  let prompt = identity + BASE_PROMPT;

  prompt += `\n\n### 🔒 PÉRIMÈTRE STRICT (VERROUILLÉ)
Tu ne réponds QU'AUX questions concernant l'entreprise "${config?.businessName || "cette entreprise"}", ses services, ses produits, ses prix, sa livraison, ses garanties et son contact.

Si le visiteur pose une question qui N'A RIEN À VOIR avec l'entreprise (météo, politique, culture générale, code informatique, une autre entreprise, un conseil personnel, etc.), tu dois OBLIGATOIREMENT répondre par une variante de :
"Je suis là uniquement pour vous renseigner sur nos services 😊. Avez-vous une question sur nos produits, nos tarifs ou notre livraison ?"

Ne réponds JAMAIS à la question hors-sujet, même partiellement. Ne donne aucune information générale qui ne provient pas de la base ci-dessous.`;

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
    // 🧮 mêmes règles d'économie que le web : vitales toujours, pertinentes selon
    // la question, coupées court, filet de sécurité (question floue = tout).
    prompt += compactKnowledgeNotes(notes, message).replace(
      "BASE DE CONNAISSANCE DE L'ENTREPRISE",
      "BASE DE CONNAISSANCE DE L'ENTREPRISE (SEULE SOURCE DE VÉRITÉ AUTORISÉE)"
    );
    prompt += "\n⚠️ Tu ne dois RIEN affirmer qui ne soit pas écrit ci-dessus ou dans les sections FAQ/Tarifs/Règles. Si l'information n'y est pas, dis que tu vas vérifier et propose de laisser un numéro de téléphone.";
  }
  if (config?.faqText) prompt += `\n\n### ❓ FAQ :\n${String(config.faqText).slice(0, 2000)}`;
  if (config?.pricingServicesText) prompt += `\n\n### 💰 TARIFS & SERVICES :\n${String(config.pricingServicesText).slice(0, 2000)}`;
  if (config?.specialRulesText) prompt += `\n\n### ⚠️ RÈGLES SPÉCIALES :\n${config.specialRulesText}`;

  // Infos officielles + pack métier : partagés avec le chat web (mêmes
  // règles sur tous les canaux, quel que soit le business).
  prompt += officialInfoBlock(config);
  prompt += businessPackBlock(config);
  if (extraBlocks) prompt += extraBlocks;

  // Ajout minimal : rappel en toute fin de prompt (ce que le modèle respecte
  // le mieux), sans retirer les sections ci-dessus.
  const hardRules = [config?.customInstructions, config?.specialRulesText].filter(Boolean).join("\n");
  if (hardRules) {
    prompt += `\n\n### 🚨 RAPPEL — RÈGLES ABSOLUES DU CLIENT, AUCUNE EXCEPTION :\n${hardRules}\nCes règles priment sur tout le reste en cas de conflit.`;
  }
  // 🎭 Comportement du bot (langue, quantité, site, honnêteté, règles libres)
  prompt += behaviorBlock(config?.behavior);

  if (notes.length === 0 && !config?.faqText && !config?.pricingServicesText && !config?.specialRulesText) {
    prompt += `\n\n### ⚠️ ATTENTION\nAucune information détaillée n'est encore enregistrée : reste vague sur les prix et les délais, et propose de laisser un numéro de téléphone pour être rappelé. Ne réponds à AUCUNE question générale en l'absence d'informations.`;
  }

  prompt += `\n\n### 🚫 RAPPEL FINAL
Si tu hésites entre répondre normalement ou refuser car hors-sujet : REFUSE et recentre la conversation sur l'entreprise.`;

  return prompt + INSTAGRAM_ADDENDUM;
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
  maxOutputTokens = 450
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
  const userParts: any[] = [{ text: message }];
  if (image?.base64) userParts.unshift({ inline_data: { mime_type: image.mime || "image/jpeg", data: image.base64 } });
  contents.push({ role: "user", parts: userParts });

  for (const model of models) {
    const startedAt = Date.now();
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens, // 🧮 450 (700 détaillé) : coût de sortie ÷2
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
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
            accessToken: metaToken,
            igToken: metaToken,
            assistantId: row.assistant_id ? String(row.assistant_id) : undefined,
            autoReplyEnabled: row.auto_reply_enabled !== false,
            lastConnectedAt: row.last_connected_at ? String(row.last_connected_at) : undefined,
          };
        }
      }
    } catch (e: any) {
      console.error('[instagram] recherche Supabase échouée:', e?.message || e);
    }
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    console.error(`[instagram] aucune connexion trouvée pour le compte ${instagramAccountId} (ni Supabase, ni Firestore)`);
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

  console.error(`[instagram] aucune connexion trouvée pour le compte ${instagramAccountId}`);
  return null;
}

/**
 * Meta limite la validité des jetons à ~60 jours (sécurité chez EUX, personne
 * n'y échappe). Règle d'or chez Meta : TANT QUE le jeton est encore valide,
 * on peut le RENOUVELER sans le client (badge -> nouveau badge de 60 jours).
 * => Dès qu'un DM arrive et que le jeton a plus de ~50 jours, on le renouvelle
 * automatiquement et on met à jour la base. Un bot utilisé régulièrement ne
 * meurt JAMAIS : le client ne se reconnecte jamais, le bot tourne seul.
 * (Un compte laissé SANS AUCUN message pendant 2 mois reste un cas mortel :
 * c'est couvert par l'alerte du rapport quotidien, pas par le code.) */
const TOKEN_REFRESH_AGE_MS = 50 * 24 * 60 * 60 * 1000; // ~50 jours

async function maybeRefreshInstagramToken(env: Env, integration: any): Promise<void> {
  try {
    if (!supabaseConfigured(env)) return;
    const last = integration.lastConnectedAt ? Date.parse(integration.lastConnectedAt) : NaN;
    if (Number.isFinite(last) && Date.now() - last < TOKEN_REFRESH_AGE_MS) return; // encore frais

    const res = await fetchWithTimeout(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(integration.igToken)}`,
      { method: "GET" },
      8000
    );
    if (!res.ok) {
      console.warn(`[instagram] renouvellement du jeton refusé (HTTP ${res.status}) — le jeton actuel reste utilisé tant qu'il est valide.`);
      return;
    }
    const data: any = await res.json().catch(() => ({}));
    if (!data?.access_token) return;

    integration.igToken = String(data.access_token);
    integration.accessToken = String(data.access_token);
    await supabaseRequest(env, `instagram_integrations?user_id=eq.${encodeURIComponent(integration.integrationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        access_token: integration.igToken,
        last_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    console.log("[instagram] jeton Meta renouvelé automatiquement (validité ~60 jours relancée, sans action du client).");
  } catch (e: any) {
    console.warn("[instagram] renouvellement du jeton impossible:", e?.message || e);
  }
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
  hasAttachment: boolean,
  message: any
): Promise<string> {
  const token = crypto.randomUUID();
  const pendingMessages = [
    ...existingPending,
    { text: text || (hasAttachment ? "[image envoyée]" : ""), mid: message?.mid || null },
  ];

  await saveThread(env, integration.integrationId, customerId, { pendingMessages, pendingToken: token });

  return token;
}

/** Traitement d'un message privé : infos de l'entreprise ➜ IA ➜ réponse. */
async function handleDirectMessage(env: Env, event: any) {
  const startedAt = Date.now();
  const customerId: string | undefined = event?.sender?.id;
  const instagramAccountId: string | undefined = event?.recipient?.id;
  const message = event?.message;

  if (!customerId || !instagramAccountId || message?.is_echo) return;

  const text: string = typeof message?.text === "string" ? message.text.trim() : "";
  const hasAttachment = Array.isArray(message?.attachments) && message.attachments.length > 0;
  if (!text && !hasAttachment) return;

  const integration = await findIntegration(env, instagramAccountId);
  if (!integration?.igToken || !integration.accessToken) return;

  // Le jeton approche l'expiration Meta ? Renouvelle-le en silence.
  await maybeRefreshInstagramToken(env, integration);

  if (!integration.autoReplyEnabled) {
    console.log("[instagram] réponses automatiques en pause pour", integration.integrationId);
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
    console.log("[instagram] message déjà traité, doublon ignoré:", message.mid);
    return;
  }

  // 1) Dépôt dans le buffer partagé
  const myToken = await pushPendingMessage(
    env,
    integration,
    customerId,
    existingPending,
    text,
    hasAttachment,
    message
  );
  console.log(`[instagram] message mis en attente (${myToken.slice(0, 8)}) pour ${customerId} :`, text || "[pièce jointe]");

  // 2) Attente pour regrouper les messages suivants
  await sleep(DEBOUNCE_MS);

  const recheck = await readThread(env, integration.integrationId, customerId);
  const currentToken = recheck.pendingToken;

  if (currentToken !== myToken) {
    console.log(`[instagram] un message plus récent est arrivé (jeton ${myToken.slice(0, 8)} cédé).`);
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
    `[instagram] regroupement de ${pendingMessages.length} message(s) pour ${customerId} (${Date.now() - startedAt}ms écoulées) :`,
    groupedText
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
      else console.warn("[instagram] configuration de l'entreprise introuvable pour", integration.assistantId);
    }
  } else {
    console.warn("[instagram] aucun assistantId enregistré sur la connexion Instagram");
  }

  let webMemory = "";
  // MÉMOIRE UNIFIÉE (site + Instagram) : on cherche ce client dans les
  // prospects du site — par son identifiant Instagram OU par le téléphone
  // qu'il vient d'écrire. S'il existe, le bot garde le fil (« ah oui kho,
  // tu m'avais demandé la robe rouge sur le site ! ») et on LIE les deux
  // identités pour toujours.
  if (integration.assistantId && supabaseConfigured(env)) {
    try {
      const phoneInMsg = groupedText.match(/(?:(?:\+|00)213|0)\s?[5-7](?:[\s.-]?[0-9]){8}/);
      let known: any = null;
      const pBase = `prospects?assistant_id=eq.${encodeURIComponent(integration.assistantId)}`;
      const byIg = await supabaseRequest(env, `${pBase}&data->>igUserId=eq.${encodeURIComponent(customerId)}&select=id,data&limit=1`);
      if (byIg.ok) known = (await byIg.json())?.[0] || null;
      if (!known && phoneInMsg) {
        const phone = phoneInMsg[0].replace(/[\s.-]/g, "");
        const byPhone = await supabaseRequest(env, `${pBase}&data->>phone=eq.${encodeURIComponent(phone)}&select=id,data&limit=1`);
        if (byPhone.ok) known = (await byPhone.json())?.[0] || null;
      }
      if (known?.data) {
        const d = known.data;
        const priorMsgs = Array.isArray(d.messages)
          ? d.messages.slice(-4).map((m: any) => `- ${m.sender === "user" ? "Client" : "Assistant"} : ${String(m.text || "").slice(0, 120)}`).join("\n")
          : "";
        if (priorMsgs || d.need || d.phone) {
          webMemory += `\n\n### 🧠 MÉMOIRE CLIENT — DÉJÀ EN CONTACT VIA LE SITE WEB
Nom : ${d.name || "inconnu"} | Téléphone : ${d.phone || (phoneInMsg ? phoneInMsg[0] : "")}${d.city ? ` | Ville : ${d.city}` : ""} | Demande : ${String(d.need || "").slice(0, 200)}
${priorMsgs ? `Derniers échanges sur le site :\n${priorMsgs}\n` : ""}
Ce client revient : continue le fil naturellement, ne repars PAS de zéro.`;
          console.log("[instagram] mémoire site reconnue pour", customerId);
        }
      }
      // 📇 FICHE CLIENT ALIMENTÉE PAR LA DISCUSSION : nom (« je m'appelle
      // Malek »), ville (« j'habite à Blida »), email, téléphone — et les
      // CORRECTIONS sont appliquées sur la même fiche (jamais dupliquée :
      // l'id est déterministe par client Instagram).
      const facts = extractLeadFacts(groupedText);
      const leadMessages = groupedText ? [{ sender: "user", text: groupedText.slice(0, 500), timestamp: new Date().toISOString() }] : [];
      const factsPatch: Record<string, any> = {
        ...(facts.phone ? { phone: facts.phone } : {}),
        ...(facts.name ? { name: facts.name } : {}),
        ...(facts.city ? { city: facts.city } : {}),
        ...(facts.email ? { email: facts.email } : {}),
      };
      if (known?.id) {
        await supabaseUpsertProspect(env, known.id, integration.assistantId, { igUserId: customerId, ...factsPatch, ...(leadMessages.length ? { messages: leadMessages } : {}) });
        if (Object.keys(factsPatch).length) console.log("[instagram] fiche client enrichie/corrigée :", JSON.stringify(factsPatch));
      } else if (phoneInMsg) {
        const linkedId = `${integration.assistantId}_ig_${customerId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
        await supabaseUpsertProspect(env, linkedId, integration.assistantId, {
          ...factsPatch,
          phone: phoneInMsg[0].replace(/[\s.-]/g, ""),
          igUserId: customerId,
          status: "qualifie",
          need: groupedText.slice(0, 2000),
          ...(leadMessages.length ? { messages: leadMessages } : {}),
        });
        console.log("[instagram] nouvelle identité liée (téléphone) :", linkedId);
      }
    } catch (memErr: any) {
      console.warn("[instagram] mémoire client indisponible:", memErr?.message || memErr);
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

  sendTypingOn(integration.igToken, customerId).catch(() => {});

  // "Tout passe par mon site" : si le client envoie une PHOTO sans texte,
  // on la fait décrire par Gemini (vision) pour en faire une requête de
  // recherche, puis on cherche le produit EN DIRECT sur le site du client.
  let extraBlocks = "";
  let incoming = groupedText;
  let imageDescription = "";
  // 🧮 POIDS DE QUOTA (même règle que le web) : photo = 4 · recherche produits = +2 · message = 1
  let shoppingRan = false;
  if (config?.siteShopping && config?.websiteUrl && config?.behavior?.websiteMentions !== "never") {
    // 📸 FIX : la photo est décrite DÈS QU'IL Y EN A UNE — photo seule OU
    // photo + texte (« c'est quoi ça ? »). Avant, un texte accompagnant la
    // photo rendait le bot AVEUGLE (jamais de vision).
    if (hasAttachment && message?.mid && env.GEMINI_API_KEY) {
      imageDescription = (await describeAttachmentImage(env, integration.igToken, message.mid)) || "";
      if (imageDescription) console.log("[instagram] photo décrite :", imageDescription);
    }
    // la requête de recherche combine CE QUE LE CLIENT A ÉCRIT + CE QU'ON VOIT
    const shoppingQuery = [groupedText, imageDescription].filter(Boolean).join(" ").trim();
    if (shoppingQuery) {
      shoppingRan = true;
      const found = await searchClientSite(config, shoppingQuery);
      extraBlocks = siteShoppingPromptBlock(found, config);
      if (found.length) console.log(`[instagram] ${found.length} produit(s) trouvé(s) sur le site`);
    }
    if (!extraBlocks) {
      extraBlocks = `\n\n### 🛒 COMMANDES VIA LE SITE : toutes les commandes se font sur le site ${config.websiteUrl}. Guide systématiquement le client vers le site pour commander.`;
    }
  }
  extraBlocks += webMemory;

  // 🆓 politesse pure -> réponse locale gratuite (pas d'IA, pas de quota).
  // Le bot muet (le client a dit stop) reste muet.
  if (isSmallTalk(incoming || groupedText)) {
    if (integration.assistantId && config?.behavior?.stopCommand !== false) {
      try {
        const mRes = await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(integration.assistantId)}&session_id=eq.ig_${encodeURIComponent(customerId)}&select=assistant_id`);
        const mRows = mRes.ok ? await mRes.json().catch(() => []) : [];
        if (Array.isArray(mRows) && mRows.length > 0) return;
      } catch { /* ignore */ }
    }
    console.log("[instagram] politesse -> réponse locale sans IA");
    await sendInstagramMessage(integration.igToken, customerId, localGreeting(groupedText, config));
    return;
  }

  if (!incoming) incoming = imageDescription || "Le client a envoyé une image que tu ne peux pas lire.";

  // 📸 FIX : l'IA voit la VRAIE photo dans tous les cas (shopping inclus) :
  // elle compare l'article visible avec la BASE DE CONNAISSANCE + les produits
  // trouvés sur le site, et choisit le plus proche (ex : t-shirt blanc « l'amour »
  // -> le t-shirt amor blanc du site ; coque Spider-Man rouge -> le lien exact).
  let inlineImage: { mime: string; base64: string } | null = null;
  if (hasAttachment && message?.mid) {
    inlineImage = await fetchAttachmentImage(env, integration.igToken, message.mid);
    if (inlineImage && !incoming) {
      incoming = "Le client a envoyé cette photo. Identifie PRÉCISÉMENT l'article (catégorie exacte, couleur, personnage/texte visible), compare-le avec notre base de connaissance et les produits trouvés ci-dessous, puis propose le produit le plus proche avec son lien.";
    }
  }

  console.log(`[instagram] appel IA démarré (${Date.now() - startedAt}ms écoulées)`);
  const { text: aiText, diagnostics, usage: aiUsage } = await generateReply(
    env,
    buildSystemPrompt(config, extraBlocks, incoming),
    incoming,
    history,
    inlineImage,
    config?.behavior?.length === "detailed" ? 700 : 450
  );
  console.log(`[instagram] diagnostics IA (${Date.now() - startedAt}ms écoulées):`, diagnostics.join(" | "));

  const businessName = config?.businessName || "notre équipe";
  const quotaWeight = 1
    + ((hasAttachment && (Boolean(imageDescription) || Boolean(inlineImage))) ? 3 : 0)
    + (shoppingRan ? 2 : 0);
  const replyText =
    aiText ||
    (hasAttachment && !groupedText
      ? "Merci pour votre message 🙏 Pouvez-vous nous écrire votre demande en texte ?"
      : `Merci pour votre message 🙏 Nous revenons vers vous dans quelques instants (${businessName}).`);

  const sent = await sendInstagramMessage(integration.igToken, customerId, replyText);
  console.log(`[instagram] message envoyé=${sent} (${Date.now() - startedAt}ms écoulées)`);

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
    for (const ev of events) {
      const m = ev?.message;
      const kind = m
        ? (m.is_echo ? "écho (message envoyé par la page)" : (m.text ? `texte: "${String(m.text).slice(0, 60)}"` : "pièce jointe"))
        : (ev?.read ? "accusé de lecture" : ev?.reaction ? "réaction" : ev?.postback ? "postback" : "autre (non-message)");
      console.log(`[instagram] événement: ${kind} — sender=${ev?.sender?.id} recipient=${ev?.recipient?.id}`);
    }

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
