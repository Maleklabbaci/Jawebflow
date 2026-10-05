/**
 * JAWEBFLOW - CHAT WIDGET (CLOUDFLARE EDGE + FIRESTORE REST)
 * Trilingue : Derja Arabizi + Arabe (حروف عربية) + Français
 *
 * IMPORTANT : cet endpoint renvoie du JSON classique ({ text }), PAS du streaming SSE.
 * Les 3 appelants (public/cdn/widget.js, JawebChatWidget.tsx, FloatingLiveWidget.tsx)
 * font tous un `response.json()` — un ancien retour en `text/event-stream` faisait
 * échouer silencieusement le parsing à chaque appel, d'où le bot qui ne répondait
 * jamais via l'IA (message fixe de secours affiché à la place).
 */

import { adminGetDocument } from '../_shared/google.ts';
import { supabaseConfigured, supabaseListKnowledge, supabaseListKnowledgeEntries, supabaseGetAssistant, supabaseAssistantRowToConfig, supabaseRequest, supabaseUpsertProspect } from '../_shared/supabase.ts';
import { evaluateWidgetAccess } from '../_shared/widget-access.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { extractLeadFacts } from '../_shared/lead-facts.ts';
import { detectSalesIntent, buildLeadFollowUp, isAffirmative, isExplicitOrderConfirmation, createPendingOrderRequest, detectConfirmedDealKind, detectConfirmationQuestionKind, buildDealCreatedContext, extractClientName } from '../_shared/sales-intent.ts';
import { processOrderChangeMessage } from '../_shared/order-changes.ts';
import { getGeminiContextCache } from '../_shared/gemini-cache.ts';

/** Endpoint Gemini Vision (même modèle pas cher que le chat). */
const geminiVisionUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${'gemini-3.1-flash-lite'}:generateContent?key=${apiKey}`;
import { supabaseGetPlanLimits, supabaseCountMonthlyConversations, supabaseLogConversation, LIMIT_BLOCK_FREE, limitBlockReached, monthlyCostBlock } from '../_shared/limits.ts';
import { buildSalesSystemPrompt, buildBusinessContextText, classifySmallTalk, localPoliteReply, compactKnowledgeNotes, selectKnowledgeDocuments, selectRelevantText } from '../_shared/prompt.ts';
import { runBackgroundLearning } from '../_shared/learning.ts';
import { searchClientSite } from '../_shared/site-search.ts';
import { notifyLead, notifyHumanTransfer, isHumanTransfer, HUMAN_TRANSFER_REPLY } from '../_shared/merchant-notify.ts';
import { forwardLeadInBackground } from '../_shared/lead-webhook.ts';

// Modèle Gemini : surchargeable par variable d'environnement (Pages → Settings →
// Environment variables) sans redéploiement de code. Les identifiants « 2.5 »
// sont annoncés en fin de vie (arrêt octobre 2026), d'où ce défaut 3.1.
const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';

// Les règles permanentes sont partagées avec Instagram pour garder un seul cerveau.
const buildStaticSystemPrompt = buildSalesSystemPrompt;

function webProspectId(assistantId, sessionId) {
  return `${assistantId}_web_${String(sessionId || 'web')}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

// Parser Firestore REST -> Objet JS
function parseFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const res = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.doubleValue !== undefined) res[k] = v.doubleValue;
    else if (v.integerValue !== undefined) res[k] = parseInt(v.integerValue);
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.arrayValue) {
      res[k] = (v.arrayValue.values || []).map(x => {
        if (x.stringValue !== undefined) return x.stringValue;
        if (x.doubleValue !== undefined) return x.doubleValue;
        if (x.integerValue !== undefined) return parseInt(x.integerValue);
        if (x.mapValue) return parseFirestoreDoc({ fields: x.mapValue.fields });
        return x;
      });
    } else if (v.mapValue) {
      res[k] = parseFirestoreDoc({ fields: v.mapValue.fields });
    }
  }
  return res;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  // `diagnostics` accompagne chaque réponse pour rendre les pannes visibles
  // (avant, toute erreur était masquée par unHTTP 200 + phrase de secours, ce qui
  // rendait le débogage impossible depuis le widget ou le tableau de bord).
  const reply = (text, diagnostics = [], usage = null) =>
    new Response(JSON.stringify({ text, message: text, response: text, diagnostics, ...(usage ? { usage } : {}) }), { status: 200, headers: cors });

  const diagnostics = [];
  let lastUsage = null;
  let trackedProspectId = null;
  let followUpRecorded = false;

  try {
    const { message, assistantId, history, image, sessionId, messageId, isSimulator, key, origin } = await context.request.json();
    const simulatorRequest = isSimulator === true;
    const env = context.env;
    const apiKey = env.GEMINI_API_KEY;
    const chatModel = env.GEMINI_MODEL || DEFAULT_CHAT_MODEL;
    const salesIntent = detectSalesIntent(message);

    if (!message?.trim()) {
      diagnostics.push('message vide');
      console.error('[chat] requête refusée:', diagnostics.join(' | '));
      return reply("Saha kho ! Kifach n9der n3awnek ? 😄", diagnostics);
    }
    if (!apiKey) diagnostics.push('GEMINI_API_KEY absente côté Pages Functions');

    // Isolation stricte : sans assistantId valide, on ne pioche dans AUCUNE base
    // (avant, un fallback partagé pouvait mélanger les données entre clients).
    if (!assistantId || !assistantId.trim()) {
      diagnostics.push('assistantId manquant dans la requête du widget');
      return reply("Configuration du widget manquante (assistantId). Contacte le support JawebFlow.", diagnostics);
    }

    // 1. Récupération de la configuration complète de l'assistant.
    //    Supabase en priorité (migration en cours) ; Firestore reste un filet
    //    de sécurité tant que la clé service_role n'est pas correctement
    //    configurée côté Cloudflare (supabaseConfigured renvoie false dans ce cas).
    let config = {};
    let configLoaded = false;
    if (supabaseConfigured(env)) {
      const sb = await supabaseGetAssistant(env, assistantId);
      if (sb.ok) {
        config = supabaseAssistantRowToConfig(sb.data);
        configLoaded = true;
      } else {
        diagnostics.push(`config Supabase non chargée: ${sb.error || sb.status}`);
      }
    }
    if (!configLoaded) {
      const configRead = await adminGetDocument(env, `assistants/${assistantId}`);
      if (configRead.ok) {
        config = parseFirestoreDoc({ fields: configRead.fields }) || config;
        configLoaded = true; // assistant légitime, juste pas encore migré
      } else {
        diagnostics.push(`config assistant non chargée: ${configRead.error}`);
        console.error(`[chat] config ${assistantId} non chargée:`, configRead.error);
      }
    }

    // 1.4 ISOLATION + DÉBIT : clé widget / domaines autorisés, puis limite d'appels.
    //     Une grande société multi-clients ne doit pas pouvoir voir son assistant
    //     appelé depuis n'importe quel site ni voir son quota Gemini grillé.
    if (!simulatorRequest && configLoaded) {
      const providedOrigin = origin || context.request.headers?.get?.('origin') || '';
      const access = evaluateWidgetAccess(config, { key, origin: providedOrigin });
      if (!access.allowed) {
        diagnostics.push(`accès widget refusé (${access.reason})`);
        return new Response(JSON.stringify({
          error: access.reason === 'key' ? 'Clé widget invalide pour cet assistant.' : 'Domaine non autorisé pour cet assistant.',
          diagnostics,
        }), { status: 403, headers: cors });
      }
      let rlHost = '';
      try { rlHost = new URL(String(providedOrigin || '')).host; } catch { rlHost = ''; }
      if (rateLimited(`chat:${assistantId}:${rlHost}`)) {
        diagnostics.push('limite de débit dépassée');
        return new Response(JSON.stringify({ error: 'Trop de requêtes, merci de patienter une minute.', diagnostics }), { status: 429, headers: cors });
      }
    }

    // 1.5 QUOTAS PAR PLAN — application réelle des forfaits de la page Tarifs :
    //     Gratuit = 0 crédit IA, Basic = 1 000 conv/mois, Pro = 5 000, Enterprise ∞.
    //     Une fois la limite atteinte, l'IA ne répond plus (blocage côté serveur,
    //     le widget désactive alors la saisie). Les assistants de démo publique
    //     (identifiants demo_*) restent illimités pour la vitrine du site.
    const isDemoAssistant = /^(demo[_-]|jawebflow_)/.test(assistantId);
    if (!isDemoAssistant && !configLoaded) {
      diagnostics.push(`assistant ${assistantId} introuvable : réponse IA refusée`);
      return reply("Cet assistant n'est pas configuré ou a été désactivé. Contactez le support JawebFlow.", diagnostics);
    }

    // Gestion locale des commandes : aucun nouvel appel IA n'est nécessaire,
    // et la modification reste disponible même si le quota IA est épuisé.
    // L'identifiant de session du widget isole strictement les clients.
    if (!simulatorRequest && !isDemoAssistant && !isHumanTransfer(message) && assistantId && configLoaded && supabaseConfigured(env) && String(sessionId || '').trim()) {
      let orderFlowRequested = false;
      try {
        const sessionKey = String(sessionId).trim();
        let prospectId = webProspectId(assistantId, sessionKey);
        const prospectRes = await supabaseRequest(env, `prospects?id=eq.${encodeURIComponent(prospectId)}&assistant_id=eq.${encodeURIComponent(assistantId)}&select=id,data`);
        const prospectRows = prospectRes.ok ? await prospectRes.json().catch(() => []) : [];
        let prospect = prospectRows?.[0];
        if (!prospect?.id) {
          const bySession = await supabaseRequest(env, `prospects?assistant_id=eq.${encodeURIComponent(assistantId)}&data->>sessionId=eq.${encodeURIComponent(sessionKey)}&select=id,data&limit=1`);
          const sessionRows = bySession.ok ? await bySession.json().catch(() => []) : [];
          prospect = sessionRows?.[0];
          if (prospect?.id) prospectId = prospect.id;
        }
        if (prospect?.id && prospect?.data?.handoffStatus !== 'human') {
          const now = new Date();
          const nowIso = now.toISOString();
          const orderFlow = processOrderChangeMessage({
            message,
            orders: Array.isArray(prospect.data.orders) ? prospect.data.orders : [],
            draft: prospect.data.orderChangeDraft || null,
            now,
          });
          if (orderFlow.handled) {
            orderFlowRequested = true;
            await supabaseUpsertProspect(env, prospectId, assistantId, {
              ...(Array.isArray(orderFlow.orders) ? { orders: orderFlow.orders } : {}),
              orderChangeDraft: orderFlow.orderChangeDraft ?? null,
              lastInteractionAt: nowIso,
              messages: [
                { sender: 'user', text: String(message).slice(0, 500), timestamp: nowIso },
                { sender: 'bot', text: String(orderFlow.reply || '').slice(0, 500), timestamp: nowIso },
              ],
            });
            diagnostics.push('gestion de commande mise à jour sans appel IA');
            const logTurn = supabaseLogConversation(env, {
              assistantId, channel: 'web_widget', sessionId: sessionKey,
              message, response: orderFlow.reply || '', model: 'order-management', weight: 1,
            });
            if (typeof context.waitUntil === 'function') context.waitUntil(logTurn.catch(() => {}));
            else await logTurn.catch(() => {});
            return reply(orderFlow.reply || 'Votre demande de commande est mise à jour.', diagnostics);
          }
        }
      } catch (orderError) {
        diagnostics.push(`gestion de commande indisponible: ${orderError?.message || orderError}`);
        if (orderFlowRequested) return reply("Je n’ai pas pu enregistrer ce changement pour le moment. La commande n’a pas été modifiée ; réessayez dans un instant ou contactez la boutique.", diagnostics);
      }
    }

    if (!isDemoAssistant) {
      if (supabaseConfigured(env)) {
        const limits = await supabaseGetPlanLimits(env);
        // SANS plan enregistré => 'basic' (fail-safe) : les assistants créés
        // avant l'arrivée des quotas gardent l'IA active (1 000/mois) au lieu
        // d'être bloqués par erreur comme des "Gratuit".
        const plan = String(config.plan || 'basic').toLowerCase();
        const limit = plan in limits ? limits[plan] : limits.free;
        if (limit === 0) {
          diagnostics.push(`plan ${plan} : 0 crédit IA, envoi bloqué`);
          return new Response(JSON.stringify({
            text: LIMIT_BLOCK_FREE, message: LIMIT_BLOCK_FREE, response: LIMIT_BLOCK_FREE,
            limitReached: true, plan, used: 0, limit, diagnostics,
          }), { status: 200, headers: cors });
        }
        if (typeof limit === 'number' && limit > 0) {
          const used = await supabaseCountMonthlyConversations(env, assistantId);
          if (used >= limit) {
            const msg = limitBlockReached(plan, limit);
            diagnostics.push(`plan ${plan} : quota ${used}/${limit} atteint, envoi bloqué`);
            return new Response(JSON.stringify({
              text: msg, message: msg, response: msg,
              limitReached: true, plan, used, limit, diagnostics,
            }), { status: 200, headers: cors });
          }
        }
        // 💸 Plafond de COÛT RÉEL (Vrais tokens × tarif officiel) :
        // Basic 3 $ · Pro 9 $ · Enterprise 30 $ / mois. Au plafond => pause propre.
        const costCheck = await monthlyCostBlock(env, assistantId, plan);
        if (costCheck.exceeded) {
          diagnostics.push(`plan ${plan} : plafond coût ${costCheck.cost.toFixed(2)}/${costCheck.cap} $ atteint, envoi bloqué`);
          const msg = String(costCheck.msg);
          return new Response(JSON.stringify({
            text: msg, message: msg, response: msg,
            limitReached: true, costReached: true, costUsd: costCheck.cost, costCap: costCheck.cap, plan, diagnostics,
          }), { status: 200, headers: cors });
        }
      }
    }

    // 🙋 TRANSFERT HUMAIN : réponse immédiate SANS appel IA, le marchand est
    // prévenu en DM par le compte JawebFlow (1 fois / 2 h par session).
    if (assistantId && !isDemoAssistant && !simulatorRequest && isHumanTransfer(message)) {
      if (supabaseConfigured(env)) {
        try {
          const sessionKey = String(sessionId || 'web');
          const prospectId = `${assistantId}_web_${sessionKey}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
          const now = new Date().toISOString();
          const followUp = buildLeadFollowUp({ type: 'appointment', priority: 'high', nextAction: 'Recontacter le visiteur pour poursuivre sa demande' }, message, 'Site web', new Date(now));
          await supabaseRequest(env, 'bot_mutes', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ assistant_id: assistantId, session_id: sessionKey }) });
          await supabaseUpsertProspect(env, prospectId, assistantId, {
            source: 'site web', channel: 'site web', sessionId: sessionKey, handoffStatus: 'human', handoffAt: now, status: 'qualifie',
            salesIntentType: 'human_transfer', salesStage: 'qualified',
            need: String(message).slice(0, 2000), lastInteractionAt: now,
            ...followUp,
            messages: [
              { sender: 'user', text: String(message).slice(0, 500), timestamp: now },
              { sender: 'bot', text: HUMAN_TRANSFER_REPLY, timestamp: now },
            ],
          });
          diagnostics.push('demande de rappel enregistrée dans les prospects');
        } catch (leadError) {
          diagnostics.push(`suivi du transfert humain indisponible: ${leadError?.message || leadError}`);
        }
      }
      try { await notifyHumanTransfer(env, assistantId, `Visiteur du site (${sessionId || 'web'})`, message); } catch { /* best-effort */ }
      return new Response(JSON.stringify({
        text: HUMAN_TRANSFER_REPLY, response: HUMAN_TRANSFER_REPLY, message: HUMAN_TRANSFER_REPLY,
        humanTransfer: true, diagnostics,
      }), { status: 200, headers: cors });
    }

    // Les opérations déterministes sur une commande restent possibles sans Gemini.
    if (!apiKey) return reply("Saha kho, l’assistant rencontre un souci technique. Réessayez dans un instant ou contactez la boutique. 🙏", diagnostics);

    // 2. Prompt stable séparé des faits récupérés pour ce message (RAG).
    const systemPrompt = buildStaticSystemPrompt(config);
    const businessContext = {};
    let linkedProspectId = null;

    // Base normalisée en priorité (notes manuelles, scan, imports, ajout éclair,
    // apprentissage validé). Le JSON historique reste un repli tant que la
    // migration n'a pas été exécutée ou que l'assistant n'a pas encore été sync.
    let knowledgeNotes = Array.isArray(config.knowledgeNotes) ? config.knowledgeNotes : [];
    if (supabaseConfigured(env)) {
      const knowledge = await supabaseListKnowledgeEntries(env, assistantId);
      if (knowledge.available && knowledge.entries.length > 0) knowledgeNotes = knowledge.entries;
    }
    if (knowledgeNotes.length > 0) {
      const relevantNotes = compactKnowledgeNotes(knowledgeNotes, message);
      if (relevantNotes) businessContext.knowledge = relevantNotes.slice(0, 7_000);
    }

    if (supabaseConfigured(env)) {
      const documents = selectKnowledgeDocuments(await supabaseListKnowledge(env, assistantId), message, 5);
      if (documents.length > 0) {
        businessContext.siteSources = documents.map((doc) => ({
          title: String(doc.title || 'Document').slice(0, 140),
          excerpt: String(doc.content || '').slice(0, 620),
          ...(doc.source_url ? { url: String(doc.source_url).slice(0, 400) } : {}),
        }));
      }
    }
    if (config.faqText) {
      const relevantFaq = selectRelevantText(config.faqText, message, 900);
      if (relevantFaq) businessContext.faq = relevantFaq;
    }
    if (config.pricingServicesText) {
      const relevantPricing = selectRelevantText(config.pricingServicesText, message, 1_200);
      if (relevantPricing) businessContext.pricingAndServices = relevantPricing;
    }

    // Historique serveur prioritaire : le widget ne peut ni perdre le fil ni
    // forger un faux message précédent pour confirmer une commande.
    let conversationHistory = Array.isArray(history) ? history : [];
    if (supabaseConfigured(env)) {
      try {
        const sessionKey = String(sessionId || 'web');
        const historyRes = await supabaseRequest(env, `conversation_contexts?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}&channel=eq.web_widget&select=user_message,assistant_response,created_at&order=created_at.desc&limit=4`);
        if (historyRes.ok) {
          const rows = await historyRes.json().catch(() => []);
          if (Array.isArray(rows) && rows.length) {
            conversationHistory = rows.reverse().flatMap((row) => [
              ...(row.user_message ? [{ sender: 'user', text: String(row.user_message).slice(0, 2_000) }] : []),
              ...(row.assistant_response ? [{ sender: 'bot', text: String(row.assistant_response).slice(0, 2_000) }] : []),
            ]).slice(-6);
          }
        }
      } catch { /* l'historique n'interrompt jamais le chat */ }
    }

    // 🧮 ÉCONOMIE : une pure politesse (salam/merci/au revoir) ne déclenche NI la
    // recherche produits NI l'appel IA — réponse locale gratuite.
    // ⛔ Le message de bienvenue n'est envoyé QU'au premier contact : en pleine
    // conversation, un « merci » ou un « ok » ne relance plus jamais « Bienvenue
    // chez… » (cela coupait net la discussion et faisait perdre la vente en cours).
    const smallTalkKind = !simulatorRequest && !isExplicitOrderConfirmation(message)
      ? classifySmallTalk(message)
      : null;
    if (smallTalkKind) {
      const sessionKey = String(sessionId || 'web');
      const pid = webProspectId(assistantId, sessionKey);
      let awaitingOrderConfirmation = false;
      let alreadyTalked = false;
      if (supabaseConfigured(env)) {
        try {
          const leadRes = await supabaseRequest(env, `prospects?id=eq.${encodeURIComponent(pid)}&select=id,data`);
          const rows = leadRes.ok ? await leadRes.json().catch(() => []) : [];
          const lead = Array.isArray(rows) ? rows[0] : null;
          awaitingOrderConfirmation = lead?.data?.orderDraft?.status === 'awaiting_confirmation';
          alreadyTalked = Array.isArray(lead?.data?.messages) && lead.data.messages.length > 0;
        } catch { /* une politesse reste une politesse si la fiche est inaccessible */ }
      }
      // « Déjà commencé » = historique serveur OU fiche client déjà bavarde : le
      // widget n'envoie pas toujours l'historique, la fiche sert de mémoire.
      const conversationStarted = conversationHistory.length > 0 || alreadyTalked;
      const politeReply = localPoliteReply(smallTalkKind, config, { conversationStarted, awaitingConfirmation: awaitingOrderConfirmation });
      if (politeReply) {
        diagnostics.push(`politesse (${smallTalkKind}) -> réponse locale sans IA`);
        // Journaliser l'échange : sans trace, le « merci » suivant serait encore
        // pris pour un premier contact et renverrait le message de bienvenue.
        if (supabaseConfigured(env)) {
          const nowIso = new Date().toISOString();
          const write = supabaseUpsertProspect(env, pid, assistantId, {
            channel: 'site web',
            sessionId: sessionKey,
            lastInteractionAt: nowIso,
            messages: [
              { sender: 'user', text: String(message).slice(0, 500), timestamp: nowIso },
              { sender: 'bot', text: politeReply.slice(0, 500), timestamp: nowIso },
            ],
          });
          const onError = (error) => console.warn('[chat][lead] politesse non journalisée:', error?.message || error);
          if (typeof context.waitUntil === 'function') context.waitUntil(write.catch(onError));
          else await write.catch(onError);
        }
        return reply(politeReply, diagnostics, { skipped: 'smalltalk', weight: 0 });
      }
      // « oui » / « ok » en pleine conversation : la réponse dépend de la question
      // précédente du bot, donc seule l'IA (avec l'historique) peut répondre.
      diagnostics.push('politesse en pleine conversation -> l’IA répond avec l’historique');
    }

    // 🧮 POIDS DE QUOTA : message simple = 1 · photo = 4 · recherche produits = +2.
    // 1 conversation = 8 unités (ex : une photo + 4 messages = 1 conversation).
    let shoppingRan = false;
    let quotaWeight = 1 + (image && image.data ? 3 : 0);

    // "Tout passe par mon site" : recherche de produits EN DIRECT sur le site
    // du client et envoi des liens 🔗 au visiteur.
    // 📸 FIX : une PHOTO jointe est d'abord DÉCRITE par Gemini Vision (même
    // sans texte du client) -> la description sert de recherche, puis l'IA
    // finale reçoit AUSSI l'image pour comparer avec la base de connaissance.
    let searchQuery = message;
    if (image && image.data && config.siteShopping && config.websiteUrl) {
      try {
        const visionRes = await fetch(geminiVisionUrl(apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: String(image.mime || 'image/jpeg'), data: String(image.data).replace(/^data:[^;]+;base64,/, '') } },
              { text: "Identifie cet article pour une recherche boutique : catégorie exacte (ex : coque téléphone, t-shirt, jean...), couleur, personnage/texte/logo visible. 6 à 12 mots, sans phrase." },
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 60, thinkingConfig: { thinkingBudget: 0 } },
          }),
        });
        if (visionRes.ok) {
          const vDesc = (await visionRes.json().catch(() => null))?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (vDesc) { diagnostics.push('photo décrite: ' + vDesc); searchQuery = [vDesc, message].filter(Boolean).join(' '); }
        }
      } catch { /* recherche sans description si pépin */ }
    }
    if (config.siteShopping && config.websiteUrl && config.behavior?.websiteMentions !== 'never') {
      shoppingRan = true;
      const found = await searchClientSite(config, searchQuery);
      if (found.length) {
        businessContext.siteProducts = found.slice(0, 5).map((product) => ({
          title: String(product.title || 'Article').slice(0, 180),
          url: String(product.url || '').slice(0, 500),
        }));
      }
    }

    // 2.5 MÉMOIRE UNIFIÉE (site + Instagram) : si le visiteur donne un numéro
    //     déjà connu, on retrouve ses échanges Instagram passés et on les
    //     injecte — le bot garde le fil entre les deux canaux.
    if (supabaseConfigured(env)) {
      try {
        const phoneMatch = String(message || '').match(/(?:(?:\+|00)213|0)\s?[5-7](?:[\s.-]?[0-9]){8}/);
        if (phoneMatch) {
          const phone = phoneMatch[0].replace(/[\s.-]/g, '');
          const pRes = await supabaseRequest(env, `prospects?assistant_id=eq.${encodeURIComponent(assistantId)}&data->>phone=eq.${encodeURIComponent(phone)}&select=id,data&order=updated_at.desc&limit=1`);
          if (pRes.ok) {
            const rows = await pRes.json();
            const prospectRow = rows?.[0];
            const prospect = prospectRow?.data;
            if (prospectRow?.id) linkedProspectId = prospectRow.id;
            const igId = prospect?.igUserId;
            let igBlock = '';
            if (igId) {
              const cRes = await supabaseRequest(env, `conversation_contexts?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent('ig_' + igId)}&order=created_at.desc&limit=6&select=user_message,assistant_response,channel`);
              if (cRes.ok) {
                const conv = (await cRes.json()).reverse();
                if (conv.length) {
                  igBlock = conv.map(c => `- Client : ${String(c.user_message || '').slice(0, 120)}\n  Assistant : ${String(c.assistant_response || '').slice(0, 120)} (${c.channel})`).join('\n');
                }
              }
            }
            if (igBlock || prospect?.need) {
              businessContext.customerMemory = {
                name: String(prospect?.name || '').slice(0, 120),
                phone: String(prospect?.phone || phone).slice(0, 40),
                initialRequest: String(prospect?.need || '').slice(0, 200),
                ...(igBlock ? { recentInstagramMessages: igBlock.slice(0, 1_600) } : {}),
                instruction: 'Le client revient d’un autre canal. Utilise ces éléments pour garder le fil, sans répéter ni révéler plus de données personnelles que nécessaire.',
              };
              diagnostics.push('mémoire client injectée (téléphone reconnu)');
            }
          }
        }
      } catch (memErr) {
        diagnostics.push(`mémoire indisponible: ${memErr?.message || memErr}`);
      }
    }


    // 3. Historique de conversation (image jointe => partie inline_data native)
    const userParts = [];
    if (image && image.data) {
      const mime = String(image.mime || 'image/jpeg');
      const b64 = String(image.data).replace(/^data:[^;]+;base64,/, '');
      if (b64.length <= 5_500_000) {
        userParts.push({ inline_data: { mime_type: mime, data: b64 } });
        diagnostics.push('photo jointe au message');
      } else {
        diagnostics.push('photo trop lourde, ignorée');
      }
    }
    userParts.push({ text: message.trim() || "Voici une photo (sans texte du client). Identifie PRÉCISÉMENT l'article visible — catégorie exacte (un jean/denim n'est PAS un jersey : base-toi sur la matière et la coupe), couleur, logo lisible — puis aide le client en utilisant notre base de connaissances." });
    const contents = conversationHistory
      .slice(-6)
      .map(h => ({ role: h.sender === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }));
    contents.push({ role: 'user', parts: userParts });

    // 📇 Capture des coordonnées, signaux d'achat et commandes confirmées.
    let createdOrder = null;
    let nameCapturedThisTurn = '';
    if (!simulatorRequest && supabaseConfigured(env)) {
      try {
        const wf = extractLeadFacts(message);
        const hasFacts = Boolean(wf.phone || wf.name || wf.city || wf.email);
        const possibleConfirmation = isExplicitOrderConfirmation(message) || isAffirmative(message);
        const sessionKey = String(sessionId || 'web');
        const pid = linkedProspectId || webProspectId(assistantId, sessionKey);
        const exRes = await supabaseRequest(env, `prospects?id=eq.${encodeURIComponent(pid)}&select=id,data`);
        const exists = exRes.ok ? ((await exRes.json().catch(() => [])) || [])[0] : null;
        const draft = exists?.data?.orderDraft;
        if (hasFacts || salesIntent || possibleConfirmation || draft?.status === 'awaiting_name') {
          // Réponse à « c'est à quel nom ? » : on complète la demande déjà créée.
          if (draft?.status === 'awaiting_name' && draft.orderId) {
            const clientName = extractClientName(message);
            if (clientName) {
              const nowName = new Date().toISOString();
              const renamedOrders = (Array.isArray(exists?.data?.orders) ? exists.data.orders : [])
                .map((o) => (o && o.id === draft.orderId ? { ...o, customerName: clientName } : o));
              try {
                await supabaseUpsertProspect(env, pid, assistantId, {
                  name: clientName, orders: renamedOrders, orderDraft: null,
                });
                nameCapturedThisTurn = clientName;
              } catch (error) { console.warn('[chat][nom] non enregistré:', error?.message || error); }
            }
          }
          const orderConfirmed = exists?.data?.handoffStatus !== 'human' && (
            isExplicitOrderConfirmation(message)
            || (draft?.status === 'awaiting_confirmation' && isAffirmative(message))
          );
          // Ce que le client valide n'est pas forcément une « commande » : une
          // visite, un rendez-vous, une réservation ou un devis sont enregistrés
          // avec leur nature exacte (visible telle quelle chez le marchand).
          const confirmedDealKind = detectConfirmedDealKind(message)
            || (draft?.status === 'awaiting_confirmation' && isAffirmative(message) ? draft?.kind : null)
            || null;
          if (hasFacts || salesIntent || orderConfirmed || draft?.status === 'awaiting_confirmation' || draft?.status === 'awaiting_name') {
            const now = new Date();
            const nowIso = now.toISOString();
            const contactAvailable = Boolean(wf.phone || wf.email || exists?.data?.phone || exists?.data?.email || linkedProspectId);
            const hasOpenFollowUp = !['pending', 'done'].includes(String(exists?.data?.followUpStatus || ''));
            const followUpPatch = salesIntent
              ? buildLeadFollowUp(salesIntent, message, 'Site web', now, contactAvailable)
              : (contactAvailable && hasOpenFollowUp ? buildLeadFollowUp(null, message, 'Site web', now, true) : {});
            const isNew = !exists;
            const highIntent = salesIntent?.priority === 'high';
            const savedMessages = Array.isArray(exists?.data?.messages) ? exists.data.messages.slice(-8) : [];
            const conversationSummary = [
              ...savedMessages.map((entry) => `${entry.sender === 'bot' ? 'Assistant' : 'Client'} : ${String(entry.text || '').slice(0, 350)}`),
              `Client : ${String(message).slice(0, 350)}`,
            ].join('\n').slice(-2_000);
            if (orderConfirmed) {
              const requestId = messageId || `session_${sessionKey}_${now.getTime()}`;
              createdOrder = createPendingOrderRequest({
                id: `web_${requestId}`,
                channel: 'Site web',
                summary: String(draft?.summary || conversationSummary),
                customerName: wf.name || exists?.data?.name,
                phone: wf.phone || exists?.data?.phone,
                city: wf.city || exists?.data?.city,
                kind: confirmedDealKind,
                now,
              });
            }
            const invalidateOldDraft = draft?.status === 'awaiting_confirmation' && !orderConfirmed;
            const nextDraft = invalidateOldDraft
              ? { ...draft, status: 'collecting', summary: conversationSummary, updatedAt: nowIso }
              : null;
            await supabaseUpsertProspect(env, pid, assistantId, {
              ...(!exists ? { source: 'site web' } : {}),
              channel: 'site web',
              sessionId: sessionKey,
              ...(wf.phone ? { phone: wf.phone } : {}),
              ...(wf.name ? { name: wf.name } : {}),
              ...(wf.city ? { city: wf.city } : {}),
              ...(wf.email ? { email: wf.email } : {}),
              ...(isNew || orderConfirmed || salesIntent ? { status: 'qualifie' } : {}),
              ...((isNew || (salesIntent && !orderConfirmed)) ? { need: String(message).slice(0, 2_000) } : {}),
              ...(salesIntent ? { salesIntentType: salesIntent.type } : {}),
              ...(Object.keys(followUpPatch).length ? { ...followUpPatch } : {}),
              ...(createdOrder ? { orders: [createdOrder], orderDraft: createdOrder.customerName ? null : { status: 'awaiting_name', orderId: createdOrder.id, updatedAt: nowIso } } : invalidateOldDraft ? { orderDraft: nextDraft } : {}),
              lastInteractionAt: nowIso,
              messages: [{ sender: 'user', text: String(message).slice(0, 500), timestamp: nowIso }],
            });
            trackedProspectId = pid;
            followUpRecorded = Boolean(followUpPatch.followUpStatus);
            if (followUpRecorded) businessContext.followUpRecorded = {
              status: 'pending', reason: followUpPatch.followUpReason,
              nextAction: followUpPatch.nextAction,
              note: 'Le suivi est enregistré pour le commerçant dans son espace prospects. Ne prétends pas qu’un rappel client est déjà effectué ou planifié.',
            };
            if (createdOrder) {
              businessContext.orderCreated = buildDealCreatedContext(createdOrder, { askName: !createdOrder.customerName });
              diagnostics.push(`${createdOrder.kindLabel.toLowerCase()} ${createdOrder.reference} enregistrée pour validation`);
            } else {
              diagnostics.push(salesIntent ? `prospect enregistré (${salesIntent.type})` : 'fiche prospect enrichie');
            }
            if (nameCapturedThisTurn) businessContext.nameCaptured = { name: nameCapturedThisTurn, instruction: "Le client vient de donner son nom pour compléter sa demande. Remercie-le et confirme que son dossier est complet, sans répéter tout l'historique." };

            // Une notification externe seulement pour un nouveau contact ou un
            // signal commercial fort ; les questions de prix isolées restent
            // visibles dans le CRM sans spammer le marchand.
            if ((isNew && Boolean(wf.phone || wf.email)) || highIntent || createdOrder) {
              const leadPayload = {
                ...wf,
                need: String(message).slice(0, 200),
                source: 'site web',
                ...(salesIntent ? { salesIntentType: salesIntent.type, nextAction: salesIntent.nextAction } : {}),
                ...(createdOrder ? { orderReference: createdOrder.reference, dealKind: createdOrder.kind, dealKindLabel: createdOrder.kindLabel } : {}),
              };
              try { await notifyLead(env, assistantId, leadPayload); } catch { /* notification best-effort */ }
              try {
                await forwardLeadInBackground(
                  env, assistantId, { ...leadPayload, contactKey: sessionKey },
                  typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : undefined,
                );
              } catch { /* best-effort */ }
            }
          }
        }
      } catch (leadErr) {
        console.warn('[chat][lead] capture impossible:', leadErr?.message || leadErr);
        diagnostics.push('suivi prospect indisponible');
      }
    }

    // Insérer les données RAG dans le dernier tour utilisateur (pas dans le
    // prompt système mis en cache) après confirmation éventuelle du suivi.
    const contextText = buildBusinessContextText(businessContext);
    const currentTurn = contents[contents.length - 1];
    if (contextText && currentTurn?.role === 'user' && Array.isArray(currentTurn.parts)) {
      currentTurn.parts.unshift({ text: contextText });
    }

    // ✋ STOP / reprise : le visiteur garde la main (règle de comportement).
    if (config.behavior?.stopCommand !== false && supabaseConfigured(env)) {
      const sessionKey = String(sessionId || 'web');
      const normMsg = String(message || '').trim().toLowerCase().replace(/[!?.,;:]+$/g, '').trim();
      const STOP_WORDS = ['stop', 'arrete', 'arrête', 'arrêtes', 'silence', 'assez', 'توقف'];
      const RESUME_WORDS = ['reprends', 'reprend', 'continue', 'continu', 'go', 'كمل'];
      try {
        if (STOP_WORDS.includes(normMsg)) {
          await supabaseRequest(env, 'bot_mutes', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ assistant_id: assistantId, session_id: sessionKey }) });
          return reply("D'accord, je ne vous dérange plus. Écrivez « reprends » quand vous voudrez me relancer. 😊", diagnostics);
        }
        if (RESUME_WORDS.includes(normMsg)) {
          await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}`, { method: 'DELETE' });
          const leadRes = await supabaseRequest(env, `prospects?id=eq.${encodeURIComponent(webProspectId(assistantId, sessionKey))}&assistant_id=eq.${encodeURIComponent(assistantId)}&select=id&limit=1`);
          if (leadRes.ok && (await leadRes.json().catch(() => [])).length) {
            await supabaseUpsertProspect(env, webProspectId(assistantId, sessionKey), assistantId, { handoffStatus: 'bot', handoffAt: new Date().toISOString() });
          }
          return reply("C'est reparti ! 😊 Comment puis-je vous aider ?", diagnostics);
        }
        const mRes = await supabaseRequest(env, `bot_mutes?assistant_id=eq.${encodeURIComponent(assistantId)}&session_id=eq.${encodeURIComponent(sessionKey)}&select=assistant_id`);
        if (mRes.ok) {
          const mRows = await mRes.json().catch(() => []);
          if (Array.isArray(mRows) && mRows.length > 0) {
            console.log('[chat] bot silencieux (le visiteur a dit stop)');
            return new Response(JSON.stringify({ text: '', message: '', response: '', muted: true, diagnostics }), { status: 200, headers: cors });
          }
        }
      } catch { /* ne jamais casser le chat pour ça */ }
    }

    if (shoppingRan) quotaWeight += 2;

    // 4. Appel Gemini — réponse complète (pas de streaming, le front ne le consomme pas)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:generateContent?key=${apiKey}`;
    const cachedContent = getGeminiContextCache(
      env, chatModel, systemPrompt,
      typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : undefined,
    );
    if (cachedContent) diagnostics.push('cache du prompt Gemini réutilisé');
    const geminiPayload = {
      ...(cachedContent
        ? { cachedContent }
        : { systemInstruction: { parts: [{ text: systemPrompt }] } }),
      contents,
      generationConfig: {
        temperature: 0.65,
        // 🧮 plafond selon le réglage « quantité » du client (coût de sortie ÷2)
        maxOutputTokens: (createdOrder || salesIntent?.priority === 'high') ? 180 : (config.behavior?.length === 'detailed' ? 700 : 450),
        // 🧮 zéro réflexion cachée (Gemini 3 facture la réflexion au prix fort)
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      diagnostics.push(`Gemini ${chatModel}: HTTP ${geminiRes.status} ${errBody.slice(0, 200)}`);
      console.error('[chat] appel Gemini refusé:', diagnostics[diagnostics.length - 1]);
      throw new Error('Gemini error');
    }

    const geminiData = await geminiRes.json();
    // 📊 Comptabilité : Gemini renvoie la consommation réelle de chaque appel
    const usageMeta = geminiData?.usageMetadata || {};
    const usage = {
      model: chatModel,
      promptTokens: Number(usageMeta.promptTokenCount || 0),
      outputTokens: Number(usageMeta.candidatesTokenCount || 0),
      weight: quotaWeight,
    };
    lastUsage = usage;
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiText) {
      diagnostics.push(`Gemini ${chatModel}: réponse vide (blockReason: ${geminiData?.promptFeedback?.blockReason || 'inconnu'})`);
      console.error('[chat] réponse Gemini vide:', JSON.stringify(geminiData).slice(0, 300));
      throw new Error("Réponse Gemini vide");
    }

    const askedDealKind = detectConfirmationQuestionKind(aiText);
    if (supabaseConfigured(env) && trackedProspectId && !createdOrder && askedDealKind) {
      const draftMessages = [
        ...conversationHistory.filter((entry) => entry?.sender === 'user').slice(-4).map((entry) => `Client : ${String(entry.text || '').slice(0, 350)}`),
        `Client : ${String(message).slice(0, 350)}`,
      ];
      try {
        await supabaseUpsertProspect(env, trackedProspectId, assistantId, {
          orderDraft: {
            status: 'awaiting_confirmation',
            channel: 'Site web',
            // Nature de la demande : le « oui » qui suit valide CETTE demande
            // (visite, rendez-vous, réservation, devis ou commande).
            kind: askedDealKind,
            summary: draftMessages.join('\\n').slice(-2_000),
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.warn('[chat][order] confirmation en attente non sauvegardée:', error?.message || error);
      }
    }

    if (supabaseConfigured(env) && trackedProspectId) {
      const recordReply = supabaseUpsertProspect(env, trackedProspectId, assistantId, {
        lastInteractionAt: new Date().toISOString(),
        messages: [{ sender: 'bot', text: String(aiText).slice(0, 500), timestamp: new Date().toISOString() }],
      });
      if (typeof context.waitUntil === 'function') context.waitUntil(recordReply.catch((error) => console.warn('[chat][lead] réponse non journalisée:', error?.message || error)));
      else await recordReply.catch((error) => console.warn('[chat][lead] réponse non journalisée:', error?.message || error));
    }

    // 5. Boucle d'apprentissage : auto-évaluation EN ARRIÈRE-PLAN (waitUntil)
    //    après l'envoi de la réponse — zéro latence ajoutée pour le visiteur.
    //    Si l'IA n'avait pas l'info, la question file dans "Apprentissage".
    if (supabaseConfigured(env) && typeof context.waitUntil === 'function') {
      context.waitUntil(runBackgroundLearning(env, { assistantId, question: message, aiText, apiKey, chatModel }));
      // Compteur de quota : 1 ligne = 1 conversation consommée ce mois-ci.
      if (!isDemoAssistant) {
        context.waitUntil(supabaseLogConversation(env, { assistantId, channel: 'web_widget', sessionId: sessionId || 'web', message, response: aiText, tokensIn: lastUsage?.promptTokens, tokensOut: lastUsage?.outputTokens, model: lastUsage?.model, weight: quotaWeight }));
      }
    }

    return reply(aiText, diagnostics, lastUsage);
  } catch (err) {
    // Le widget affiche le texte de secours, mais le motif réel reste visible
    // (journal Cloudflare + tableau de bord + onglet réseau).
    return new Response(JSON.stringify({
      text: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏",
      message: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏",
      response: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏",
      error: err?.message || String(err),
      diagnostics,
    }), { status: 200, headers: cors });
  }
}
