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
import { supabaseConfigured, supabaseListKnowledge } from '../_shared/supabase.ts';

// Modèle Gemini : surchargeable par variable d'environnement (Pages → Settings →
// Environment variables) sans redéploiement de code. Les identifiants « 2.5 »
// sont annoncés en fin de vie (arrêt octobre 2026), d'où ce défaut 3.1.
const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';

const BASE_SYSTEM_PROMPT = `Tu es l'assistant IA d'élite pour le support et la vente en ligne (Développé par JawebFlow).

### 🇩🇿 MAÎTRISE LINGUISTIQUE (DÉTECTION AUTOMATIQUE)
1. **Derja Arabizi (lettres latines + 3,7,9,5)** ➔ Réponds en Derja Arabizi authentique (TOUJOURS "kho", jamais "khouya" ; TOUJOURS "douka", jamais "daba/derk").
2. **Arabe en lettres arabes (حروف عربية)** ➔ Réponds en arabe dialectal algérien (ex: "صحا خويا", "واش راك", "كلشي مريقل", "ماشي مشكل").
3. **Français** ➔ Réponds en français impeccable et chaleureux.
4. **Mix** ➔ Mélange naturellement comme un algérien.

### 🎯 RÈGLES COMMERCIALES
- Concis : 2 à 4 phrases maximum par réponse.
- Vente : Inclus systématiquement les liens (🔗) des produits ou offres trouvés pour que le client clique dessus.
- Si information manquante : ne jamais inventer, propose de laisser un numéro de téléphone pour être rappelé.`;

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
  const reply = (text, diagnostics = []) =>
    new Response(JSON.stringify({ text, message: text, response: text, diagnostics }), { status: 200, headers: cors });

  const diagnostics = [];

  try {
    const { message, assistantId, history } = await context.request.json();
    const env = context.env;
    const apiKey = env.GEMINI_API_KEY;
    const chatModel = env.GEMINI_MODEL || DEFAULT_CHAT_MODEL;

    if (!apiKey || !message?.trim()) {
      if (!apiKey) diagnostics.push('GEMINI_API_KEY absente côté Pages Functions');
      console.error('[chat] requête refusée:', diagnostics.join(' | ') || 'message vide');
      return reply("Saha kho ! Kifach n9der n3awnek ? 😄", diagnostics);
    }

    // Isolation stricte : sans assistantId valide, on ne pioche dans AUCUNE base
    // (avant, un fallback partagé pouvait mélanger les données entre clients).
    if (!assistantId || !assistantId.trim()) {
      diagnostics.push('assistantId manquant dans la requête du widget');
      return reply("Configuration du widget manquante (assistantId). Contacte le support JawebFlow.", diagnostics);
    }

    // 1. Récupération de la configuration complète de l'assistant depuis Firestore.
    //    Lecture Admin (compte de service) : une lecture REST avec seulement la clé
    //    Web est anonyme et se fait refuser par les règles — la config restait alors
    //    vide et l'IA répondait sans la base de connaissances du client.
    let config = {};
    const configRead = await adminGetDocument(env, `assistants/${assistantId}`);
    if (configRead.ok) {
      config = parseFirestoreDoc({ fields: configRead.fields }) || {};
    } else {
      diagnostics.push(`config assistant non chargée: ${configRead.error}`);
      console.error(`[chat] config ${assistantId} non chargée:`, configRead.error);
    }

    // 2. Construction du prompt avec toute la base de connaissance réelle de l'assistant
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (config.customInstructions) systemPrompt += `\n\n### 🧠 INSTRUCTIONS DU CLIENT :\n${config.customInstructions}`;
    if (config.businessName) systemPrompt += `\n\n### 🏢 ENTREPRISE :\n"${config.businessName}"`;
    if (config.businessDescription) systemPrompt += `\n${config.businessDescription}`;

    // Notes de connaissance (issues du scan automatique ET des ajouts manuels)
    if (Array.isArray(config.knowledgeNotes) && config.knowledgeNotes.length > 0) {
      const activeNotes = config.knowledgeNotes.filter(n => n.enabled !== false);
      if (activeNotes.length > 0) {
        systemPrompt += `\n\n### 📋 BASE DE CONNAISSANCE DE L'ENTREPRISE :\n`;
        activeNotes.forEach(n => {
          systemPrompt += `- [${n.category || n.title || 'Note'}] ${n.content || ''}\n`;
        });
      }
    }
    if (supabaseConfigured(env)) {
      const documents = await supabaseListKnowledge(env, assistantId);
      if (documents.length > 0) {
        systemPrompt += `\n\n### 📚 DOCUMENTS INDEXÉS DU SITE (les liens sont des sources à citer) :\n`;
        for (const doc of documents) {
          systemPrompt += `- ${doc.title || 'Document'} : ${doc.content || ''}${doc.source_url ? ` | Source: ${doc.source_url}` : ''}\n`;
        }
      }
    }
    if (config.faqText) systemPrompt += `\n\n### ❓ FAQ :\n${config.faqText}`;
    if (config.pricingServicesText) systemPrompt += `\n\n### 💰 TARIFS & SERVICES :\n${config.pricingServicesText}`;
    if (config.specialRulesText) systemPrompt += `\n\n### ⚠️ RÈGLES SPÉCIALES :\n${config.specialRulesText}`;

    // 3. Historique de conversation
    const contents = (Array.isArray(history) ? history : [])
      .slice(-6)
      .map(h => ({ role: h.sender === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }));
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    // 4. Appel Gemini — réponse complète (pas de streaming, le front ne le consomme pas)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 800 },
      })
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      diagnostics.push(`Gemini ${chatModel}: HTTP ${geminiRes.status} ${errBody.slice(0, 200)}`);
      console.error('[chat] appel Gemini refusé:', diagnostics[diagnostics.length - 1]);
      throw new Error('Gemini error');
    }

    const geminiData = await geminiRes.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiText) {
      diagnostics.push(`Gemini ${chatModel}: réponse vide (blockReason: ${geminiData?.promptFeedback?.blockReason || 'inconnu'})`);
      console.error('[chat] réponse Gemini vide:', JSON.stringify(geminiData).slice(0, 300));
      throw new Error("Réponse Gemini vide");
    }

    return reply(aiText, diagnostics);
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
