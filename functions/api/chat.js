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

const CHAT_MODEL = 'gemini-3.1-flash-lite';

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
  const reply = (text) => new Response(JSON.stringify({ text, message: text, response: text }), { status: 200, headers: cors });

  try {
    const { message, assistantId, history } = await context.request.json();
    const env = context.env;
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey || !message?.trim()) {
      return reply("Saha kho ! Kifach n9der n3awnek ? 😄");
    }

    // Isolation stricte : sans assistantId valide, on ne pioche dans AUCUNE base
    // (avant, un fallback partagé pouvait mélanger les données entre clients).
    if (!assistantId || !assistantId.trim()) {
      return reply("Configuration du widget manquante (assistantId). Contacte le support JawebFlow.");
    }

    // 1. Récupération de la configuration complète de l'assistant depuis Firestore
    const db = env.FIRESTORE_DATABASE_ID || '(default)';
    const assistantRes = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/assistants/${assistantId}?key=${env.FIRESTORE_API_KEY}`);
    let config = {};
    if (assistantRes.ok) {
      config = parseFirestoreDoc(await assistantRes.json()) || {};
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
    if (config.faqText) systemPrompt += `\n\n### ❓ FAQ :\n${config.faqText}`;
    if (config.pricingServicesText) systemPrompt += `\n\n### 💰 TARIFS & SERVICES :\n${config.pricingServicesText}`;
    if (config.specialRulesText) systemPrompt += `\n\n### ⚠️ RÈGLES SPÉCIALES :\n${config.specialRulesText}`;

    // 3. Historique de conversation
    const contents = (Array.isArray(history) ? history : [])
      .slice(-6)
      .map(h => ({ role: h.sender === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }));
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    // 4. Appel Gemini — réponse complète (pas de streaming, le front ne le consomme pas)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`;
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
    const geminiData = await geminiRes.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiText) throw new Error("Réponse Gemini vide");

    return reply(aiText);
  } catch (err) {
    return new Response(JSON.stringify({
      text: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏",
      message: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏",
      response: "Saha kho, 3ndna un petit souci technique douka. Re-gouli message stp ! 🙏"
    }), { status: 200, headers: cors });
  }
}
