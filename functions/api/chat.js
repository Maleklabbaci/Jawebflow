/**
 * JAWEBFLOW - CHAT WIDGET (CLOUDFLARE EDGE + FIRESTORE REST)
 * Trilingue : Derja Arabizi + Arabe (حروف عربية) + Français
 * Streaming SSE + Recherche sémantique (embeddings) + mots-clés dans Firestore
 */

const CHAT_MODEL = 'gemini-3.1-flash-lite';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;

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

// Génère un embedding pour un texte via l'API Gemini
async function embedText(text, apiKey) {
  if (!text || !text.trim() || !apiKey) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 2000) }] },
        outputDimensionality: EMBEDDING_DIM
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Recherche hybride (mots-clés + sémantique) dans Firestore, isolée par assistantId
async function searchKnowledge(assistantId, query, env) {
  const db = env.FIRESTORE_DATABASE_ID || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/assistants/${assistantId}/knowledge_base?key=${env.FIRESTORE_API_KEY}&pageSize=200`;

  try {
    const [res, queryEmbedding] = await Promise.all([
      fetch(url),
      embedText(query, env.GEMINI_API_KEY)
    ]);
    if (!res.ok) return { products: [], infos: [] };
    const data = await res.json();
    if (!data.documents) return { products: [], infos: [] };

    const docs = data.documents.map(d => parseFirestoreDoc(d)).filter(Boolean);

    const normalize = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[أإآا]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[ىي]/g, 'ي');

    const qWords = normalize(query).split(/\s+/).filter(w => w.length > 2);

    const scored = docs.map(r => {
      let score = 0;
      const searchable = normalize([r.title, r.content, (r.tags || []).join(' '), r.type].join(' '));
      for (const w of qWords) {
        if (searchable.includes(w)) score += 10;
        if (normalize(r.title).includes(w)) score += 5;
        if ((r.tags || []).some(t => normalize(t).includes(w))) score += 8;
      }
      // Recherche sémantique : ajoute un score basé sur la similarité cosinus
      // quand la fiche a un embedding stocké (généré au scan/à la création).
      if (queryEmbedding && r.embedding) {
        const sim = cosineSimilarity(queryEmbedding, r.embedding);
        if (sim > 0.68) score += sim * 60; // capte les reformulations/synonymes
      }
      return { ...r, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

    return {
      products: scored.filter(r => ['produit', 'service', 'immobilier'].includes(r.type)).slice(0, 4),
      infos: scored.filter(r => !['produit', 'service', 'immobilier'].includes(r.type)).slice(0, 3)
    };
  } catch {
    return { products: [], infos: [] };
  }
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

  try {
    const { message, assistantId, history } = await context.request.json();
    const env = context.env;
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey || !message?.trim()) {
      return new Response(JSON.stringify({ reply: "Saha kho ! Kifach n9der n3awnek ? 😄" }), { status: 200, headers: cors });
    }

    // Isolation stricte : sans assistantId valide, on ne pioche dans AUCUNE base
    // (avant, un fallback "asst_live" pouvait faire fuiter les données d'un autre client).
    if (!assistantId || !assistantId.trim()) {
      return new Response(JSON.stringify({ reply: "Configuration du widget manquante (assistantId). Contacte le support JawebFlow." }), { status: 200, headers: cors });
    }

    // 1. Récupération de la configuration complète de l'assistant depuis Firestore
    const db = env.FIRESTORE_DATABASE_ID || '(default)';
    const assistantRes = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/assistants/${assistantId}?key=${env.FIRESTORE_API_KEY}`);
    let config = {};
    if (assistantRes.ok) {
      config = parseFirestoreDoc(await assistantRes.json()) || {};
    }

    // 2. Recherche hybride (mots-clés + sémantique) dans les fiches scannées
    const { products, infos } = await searchKnowledge(assistantId, message, env);

    // 3. Construction du prompt avec le cerveau de l'IA
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (config.customInstructions) systemPrompt += `\n\n### 🧠 INSTRUCTIONS DU CLIENT :\n${config.customInstructions}`;
    if (config.businessName) systemPrompt += `\n\n### 🏢 ENTREPRISE :\n"${config.businessName}"`;
    if (config.businessDescription) systemPrompt += `\n${config.businessDescription}`;

    // Notes manuelles saisies dans le dashboard (FAQ, tarifs, livraison, règles...)
    // -> AVANT cette correction, ces notes n'étaient jamais envoyées à l'IA en prod.
    if (Array.isArray(config.knowledgeNotes) && config.knowledgeNotes.length > 0) {
      const activeNotes = config.knowledgeNotes.filter(n => n.enabled !== false);
      if (activeNotes.length > 0) {
        systemPrompt += `\n\n### 📋 NOTES DE L'ENTREPRISE (saisies manuellement, prioritaires) :\n`;
        activeNotes.forEach(n => {
          systemPrompt += `- [${n.category || n.title || 'Note'}] ${n.content || ''}\n`;
        });
      }
    }
    if (config.faqText) systemPrompt += `\n\n### ❓ FAQ :\n${config.faqText}`;
    if (config.pricingServicesText) systemPrompt += `\n\n### 💰 TARIFS & SERVICES :\n${config.pricingServicesText}`;
    if (config.specialRulesText) systemPrompt += `\n\n### ⚠️ RÈGLES SPÉCIALES :\n${config.specialRulesText}`;

    if (products.length > 0) {
      systemPrompt += `\n\n### 🛍️ OFFRES / PRODUITS DU SITE (Inclus les liens dans ta réponse) :\n`;
      products.forEach((p, i) => {
        systemPrompt += `${i + 1}. **${p.title}** ${p.price ? `— ${p.price} ${p.currency || 'DA'}` : ''}\n   🔗 ${p.url}\n`;
      });
    }

    if (infos.length > 0) {
      systemPrompt += `\n\n### 📚 INFOS UTILES DU SITE :\n`;
      infos.forEach(info => {
        systemPrompt += `- ${info.title} : ${(info.content || '').substring(0, 250)}\n`;
      });
    }

    // 4. Historique de conversation
    const contents = (Array.isArray(history) ? history : [])
      .slice(-6)
      .map(h => ({ role: h.sender === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }));
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    // 5. Appel Gemini en Streaming SSE
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 400 },
      })
    });

    if (!geminiRes.ok) throw new Error("Gemini error");

    return new Response(geminiRes.body, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ reply: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏" }), { status: 200, headers: cors });
  }
}
