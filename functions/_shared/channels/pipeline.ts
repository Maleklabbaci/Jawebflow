/**
 * JAWEBFLOW — PIPELINE D'ENTRÉE MULTI-CANAL
 * ============================================================================
 * LE CŒUR DE LA FACTORISATION. Avant ce fichier, chaque canal aurait recopié
 * la mécanique de `functions/api/webhook/instagram.ts` (1 506 lignes) : quotas,
 * base de connaissances, prompt, IA, journalisation, prospects. Avec quatre
 * canaux de plus, cela faisait cinq copies à maintenir.
 *
 * Ici, un seul chemin, identique pour tous les canaux :
 *
 *   1. retrouver l'intégration (assistant + jeton)      → channel_integrations
 *   2. charger l'assistant et ses quotas                → supabaseGetAssistant / limits.ts
 *   3. respecter « stop » et le silence du marchand     → bot_mutes
 *   4. vérifier le forfait (conversations ET coût)      → limits.ts
 *   5. vérifier le forfait WhatsApp (messages facturés) → metering.ts
 *   6. charger la base de connaissances                 → supabaseListKnowledgeEntries
 *   7. construire le prompt et appeler Gemini           → prompt.ts
 *   8. envoyer la réponse par l'adaptateur du canal
 *   9. journaliser (quota + compteur de facturation)
 *
 * Règle d'or du dépôt (DEV.md §2) : « un changement de comportement = une
 * fonction pure + un test ». Toute la logique testable est donc dans les
 * adaptateurs (`parseInbound`, `parseStatuses`) et dans ce pipeline, jamais
 * dans le handler HTTP — qui ne fait plus que « vérifier → router ».
 */

import { supabaseRequest, supabaseGetAssistant, supabaseConfigured, type SupabaseEnv } from '../supabase.ts';
import {
  supabaseGetPlanLimits,
  supabaseCountMonthlyConversations,
  supabaseLogConversation,
  monthlyCostBlock,
  limitBlockReached,
  LIMIT_BLOCK_FREE,
} from '../limits.ts';
import { buildSalesSystemPrompt, buildBusinessContextText, compactKnowledgeNotes } from '../prompt.ts';
import { supabaseListKnowledgeEntries } from '../supabase.ts';
import { splitForLimit, type ChannelAdapter, type InboundMessage, type SendResult } from './types.ts';
import { channelCostsMoney } from './registry.ts';
import { alreadyHandledInbound, logChannelMessage, whatsappUsage, WA_QUOTA_REACHED_MSG } from './metering.ts';

const HISTORY_LIMIT = 8; // 8 échanges = 4 allers-retours, comme le web
const GEMINI_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash'];

/**
 * Variables d'environnement réellement lues par le pipeline. Les jetons des
 * canaux (Telegram, Messenger, WhatsApp, TikTok) ne sont pas listés ici : chaque
 * adaptateur lit les siens, et son `env` est typé `any` pour rester autonome.
 */
export interface ChannelEnv extends SupabaseEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export interface Integration {
  id?: string;
  assistant_id?: string;
  user_id?: string;
  access_token?: string;
  connected?: boolean;
  display_name?: string;
}

export interface PipelineResult {
  replied: boolean;
  replyText?: string;
  /** Raison lisible quand on n'a PAS répondu (diagnostic marchand). */
  reason?: string;
  diagnostics: string[];
}

/**
 * Retrouve l'intégration d'un canal.
 * `accountId` = l'identifiant du compte côté plateforme (page, numéro, bot).
 * Les canaux qui ne l'envoient pas (Telegram) utilisent la clé d'URL du webhook,
 * stockée dans la même colonne `account_id`.
 */
export async function findIntegration(env: SupabaseEnv, channel: string, accountId: string): Promise<Integration | null> {
  if (!supabaseConfigured(env) || !accountId) return null;
  const res = await supabaseRequest(
    env,
    `channel_integrations?channel=eq.${encodeURIComponent(channel)}` +
      `&account_id=eq.${encodeURIComponent(accountId)}&select=id,assistant_id,user_id,access_token,connected,display_name&limit=1`,
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as Integration[];
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.connected === false) return null;
  if (!row.assistant_id) return null;
  return row;
}

/** Historique récent du contact sur ce canal (les 4 derniers échanges). */
async function recentHistory(env: SupabaseEnv, assistantId: string, channel: string, contactId: string) {
  if (!supabaseConfigured(env)) return [];
  try {
    const res = await supabaseRequest(
      env,
      `conversation_contexts?assistant_id=eq.${encodeURIComponent(assistantId)}` +
        `&channel=eq.${encodeURIComponent(channel)}&session_id=eq.${encodeURIComponent(contactId)}` +
        `&select=user_message,assistant_response,created_at&order=created_at.desc&limit=4`,
    );
    if (!res.ok) return [];
    const rows = (await res.json().catch(() => [])) as any[];
    return (Array.isArray(rows) ? rows : []).reverse().flatMap((r) => [
      { role: 'user', text: String(r?.user_message || '') },
      { role: 'model', text: String(r?.assistant_response || '') },
    ]).filter((m) => m.text);
  } catch {
    return [];
  }
}

/** Appel Gemini — même modèle et mêmes garde-fous que le web et Instagram. */
async function generateReply(
  env: ChannelEnv,
  systemPrompt: string,
  message: string,
  history: Array<{ role: string; text: string }>,
  businessContext: Record<string, any>,
): Promise<{ text: string | null; diagnostics: string[]; usage?: { promptTokens: number; outputTokens: number; model: string } }> {
  const diagnostics: string[] = [];
  if (!env.GEMINI_API_KEY) {
    diagnostics.push('GEMINI_API_KEY absente côté Pages Functions');
    return { text: null, diagnostics };
  }
  const models = Array.from(new Set([...(env.GEMINI_MODEL ? [env.GEMINI_MODEL] : []), ...GEMINI_FALLBACK_MODELS]));
  const contents = history
    .slice(-HISTORY_LIMIT)
    .filter((h) => h.text)
    .map((h) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }));

  const dynamicContext = buildBusinessContextText(businessContext);
  const userParts: any[] = [];
  if (dynamicContext) userParts.push({ text: dynamicContext });
  userParts.push({ text: message });
  contents.push({ role: 'user', parts: userParts });

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.65,
              maxOutputTokens: 450,
              thinkingConfig: { thinkingBudget: 0 }, // Gemini 3 facture la réflexion au prix fort
            },
          }),
        },
      );
      if (!res.ok) {
        diagnostics.push(`${model} : HTTP ${res.status}`);
        continue;
      }
      const data: any = await res.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim() || '';
      if (!text) {
        diagnostics.push(`${model} : réponse vide`);
        continue;
      }
      return {
        text,
        diagnostics,
        usage: {
          promptTokens: Number(data?.usageMetadata?.promptTokenCount || 0),
          outputTokens: Number(data?.usageMetadata?.candidatesTokenCount || 0),
          model,
        },
      };
    } catch (e) {
      diagnostics.push(`${model} : ${(e as Error)?.message || e}`);
    }
  }
  return { text: null, diagnostics };
}

/**
 * Envoie un texte, en le découpant si la plateforme a une limite de longueur.
 * Renvoie l'identifiant du PREMIER morceau : c'est celui que les accusés de
 * livraison citeront en premier.
 */
async function sendAll(
  adapter: ChannelAdapter,
  target: string,
  text: string,
  env: ChannelEnv,
): Promise<SendResult> {
  const parts = adapter.maxLength ? splitForLimit(text, adapter.maxLength) : [text];
  let firstId: string | undefined;
  for (let i = 0; i < parts.length; i += 1) {
    const res = await adapter.send(target, parts[i], env);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: parts.length > 1 ? `${res.error || 'échec'} (partie ${i + 1}/${parts.length})` : res.error,
      };
    }
    if (!firstId && res.messageId) firstId = res.messageId;
  }
  return { ok: true, messageId: firstId };
}

/**
 * Traite UN message entrant, de bout en bout. Renvoie ce qui a été fait — jamais
 * d'exception : un canal ne doit pas casser parce qu'une donnée est incomplète.
 */
export async function handleInbound(
  env: ChannelEnv,
  adapter: ChannelAdapter,
  message: InboundMessage,
): Promise<PipelineResult> {
  const diagnostics: string[] = [];
  const integration = await findIntegration(env, adapter.id, message.accountId);
  if (!integration?.assistant_id) {
    return { replied: false, reason: `aucune intégration ${adapter.label} pour ce compte`, diagnostics };
  }
  const assistantId = integration.assistant_id;
  const sessionKey = `${adapter.id}:${message.contactId}`;

  const assistantRes = await supabaseGetAssistant(env, assistantId);
  const assistant = assistantRes?.data;
  if (!assistant) {
    return { replied: false, reason: `assistant introuvable (${assistantId})`, diagnostics };
  }

  // ── Anti-renvoi : la plateforme réémet ses webhooks ─────────────────────
  // Comptabilisé AVANT tout appel payant (Gemini) : un renvoi ne doit ni
  // répondre deux fois au client, ni payer deux fois.
  if (message.messageId && (await alreadyHandledInbound(env, assistantId, adapter.id, message.contactId, message.messageId))) {
    return { replied: false, reason: 'message déjà traité (renvoi de la plateforme)', diagnostics };
  }
  // Le message ENTRANT est gratuit chez Meta — mais on le trace : il sert au
  // compteur d'usage ET de garde anti-renvoi pour les réémissions.
  await logChannelMessage(env, {
    assistantId,
    userId: integration.user_id,
    channel: adapter.id,
    direction: 'in',
    messageId: message.messageId,
    contactId: message.contactId,
    billable: false, // un message entrant n'est JAMAIS facturé
    fromAd: message.fromAd,
  });

  // ── « stop » : le visiteur garde la main ────────────────────────────────
  const normalized = String(message.text || '').trim().toLowerCase().replace(/[!?.,;:]+$/g, '').trim();
  const STOP_WORDS = ['stop', 'arrete', 'arrête', 'arrêtes', 'silence', 'assez', 'توقف'];
  const RESUME_WORDS = ['reprends', 'reprend', 'continue', 'continu', 'go', 'كمل'];
  if (STOP_WORDS.includes(normalized)) {
    await supabaseRequest(env, 'bot_mutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ assistant_id: assistantId, session_id: sessionKey }),
    });
    return { replied: false, reason: 'client a demandé le silence', diagnostics };
  }
  if (RESUME_WORDS.includes(normalized)) {
    await supabaseRequest(
      env,
      `bot_mutes?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}`,
      { method: 'DELETE' },
    );
    return { replied: false, reason: 'client a demandé la reprise', diagnostics };
  }
  const muteRes = await supabaseRequest(
    env,
    `bot_mutes?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}&select=assistant_id`,
  );
  if (muteRes.ok) {
    const muted = await muteRes.json().catch(() => []);
    if (Array.isArray(muted) && muted.length > 0) {
      return { replied: false, reason: 'bot en silence pour ce contact', diagnostics };
    }
  }

  // ⚠️ Le plan vit dans `config.plan` (jsonb), pas dans une colonne : le lire
  // au mauvais endroit ferait retomber tout le monde sur « basic ».
  const plan = String((assistant as any).config?.plan || (assistant as any).plan || 'basic').toLowerCase();

  // ── Forfait 1 : quota de conversations et plafond de coût IA ────────────
  const limits = await supabaseGetPlanLimits(env);
  const limit = plan in limits ? limits[plan] : limits.free;
  if (!limit) {
    return { replied: false, reason: `plan ${plan} : 0 crédit IA`, diagnostics };
  }
  const used = await supabaseCountMonthlyConversations(env, assistantId);
  if (limit !== null && used >= limit) {
    return { replied: false, reason: 'quota de conversations atteint', diagnostics };
  }
  const cost = await monthlyCostBlock(env, assistantId, plan);
  if (cost.exceeded) {
    return { replied: false, reason: `plafond de coût atteint (${cost.cost.toFixed(2)} $ / ${cost.cap} $)`, diagnostics };
  }

  // ── Forfait 2 : messages WhatsApp facturés (le seul canal payant) ───────
  if (channelCostsMoney(adapter.id)) {
    const usage = await whatsappUsage(env, assistantId);
    if (usage.quota + usage.purchased > 0 && usage.remaining <= 0) {
      // On répond UNE fois poliment, sans consommer d'IA.
      await adapter.send(message.contactId, WA_QUOTA_REACHED_MSG, env);
      await supabaseLogConversation(env, {
        assistantId, channel: adapter.id, sessionId: message.contactId,
        message: String(message.text).slice(0, 2000), response: WA_QUOTA_REACHED_MSG, weight: 0,
      });
      return { replied: true, replyText: WA_QUOTA_REACHED_MSG, reason: 'forfait WhatsApp épuisé', diagnostics };
    }
    if (usage.quota + usage.purchased === 0 && usage.quota === 0) {
      return { replied: false, reason: 'WhatsApp non inclus dans le plan du client', diagnostics };
    }
  }

  // ── Base de connaissances ──────────────────────────────────────────────
  const businessContext: Record<string, any> = {};
  let knowledgeNotes = Array.isArray((assistant as any).knowledgeNotes) ? (assistant as any).knowledgeNotes : [];
  const knowledge = await supabaseListKnowledgeEntries(env, assistantId);
  if (knowledge.available && knowledge.entries.length > 0) knowledgeNotes = knowledge.entries;
  if (knowledgeNotes.length > 0) {
    const relevant = compactKnowledgeNotes(knowledgeNotes, message.text);
    if (relevant) businessContext.knowledge = relevant.slice(0, 7_000);
  }
  if ((assistant as any).faqText) businessContext.faq = String((assistant as any).faqText).slice(0, 900);

  // ── Mémoire de la conversation ─────────────────────────────────────────
  const history = await recentHistory(env, assistantId, adapter.id, message.contactId);
  if (message.contactName) {
    businessContext.contact = { name: message.contactName, channel: adapter.label };
  }

  const systemPrompt = buildSalesSystemPrompt(assistant);
  const reply = await generateReply(env, systemPrompt, message.text, history, businessContext);
  diagnostics.push(...reply.diagnostics);
  if (!reply.text) {
    return { replied: false, reason: 'Gemini n’a pas répondu', diagnostics };
  }

  // ── Envoi (découpé si la réponse dépasse la limite de la plateforme) ────
  const sent = await sendAll(adapter, message.contactId, reply.text, env);
  if (!sent.ok) {
    return { replied: false, reason: sent.error || 'échec d’envoi', diagnostics };
  }

  // ── Journalisation (quota + compteur de facturation) ───────────────────
  await supabaseLogConversation(env, {
    assistantId,
    channel: adapter.id,
    sessionId: message.contactId,
    message: String(message.text).slice(0, 2000),
    response: String(reply.text).slice(0, 4000),
    tokensIn: reply.usage?.promptTokens,
    tokensOut: reply.usage?.outputTokens,
    model: reply.usage?.model,
    weight: 1,
  });
  // Le message sortant est compté « non facturé » à l'envoi : c'est l'accusé de
  // livraison (parseStatuses) qui tranchera, avec `pricing.billable` de Meta.
  await logChannelMessage(env, {
    assistantId,
    userId: integration.user_id,
    channel: adapter.id,
    direction: 'out',
    messageId: sent.messageId,
    contactId: message.contactId,
    billable: false,
    category: 'service',
    fromAd: message.fromAd,
  });

  return { replied: true, replyText: reply.text, diagnostics };
}

/**
 * Traite les accusés de livraison : c'est ici que la refacturation devient
 * exacte. On ne compte QUE les messages que Meta a réellement facturés.
 */
export async function handleStatuses(
  env: SupabaseEnv,
  adapter: ChannelAdapter,
  payload: any,
  ctx?: { accountId?: string },
): Promise<number> {
  if (!adapter.parseStatuses) return 0;
  const statuses = adapter.parseStatuses(payload, ctx);
  if (!statuses.length) return 0;
  const integration = await findIntegration(env, adapter.id, statuses[0].accountId || ctx?.accountId || '');
  if (!integration?.assistant_id) return 0;
  for (const status of statuses) {
    await logChannelMessage(env, {
      assistantId: integration.assistant_id,
      userId: integration.user_id,
      channel: adapter.id,
      direction: 'out',
      messageId: status.messageId,
      billable: status.billable,
      category: status.category,
    });
  }
  return statuses.length;
}

/**
 * Prépare une réponse HTTP minimale pour un webhook : « vérifier → router ».
 * Chaque canal n'a plus qu'à exposer GET (challenge) et POST (événements).
 */
export function webhookJson(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  });
}

/** Réponse standard attendue par Meta (sinon il renvoie la notification). */
export const META_OK = 'EVENT_RECEIVED';

export { buildSalesSystemPrompt, LIMIT_BLOCK_FREE, limitBlockReached };
