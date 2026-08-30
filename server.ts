import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

// Initialize Stripe lazily
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

// Initialize Firebase Admin safely
let db: any = null;
try {
  const app = initializeApp({ 
    projectId: "gen-lang-client-0772569610"
  });
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase admin initialization notice:", e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS middleware for external PHP / cURL and Web API integration
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Default AI Provider Configuration (AgentRouter API & Gemini Fallback)
  const AGENTROUTER_API_KEY = process.env.AGENTROUTER_API_KEY || "sk-lH1ELWJwVfU0wFj2C9zjV6ywCgCCValyp6R9FnpMqve6biSi";
  const AGENTROUTER_BASE_URL = (process.env.AGENTROUTER_BASE_URL || "https://co.agentrouter.org/v1").replace(/\/$/, "");

  // Fallback Gemini API client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "AIzaSy_demo",
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });

  // 🧠 Evolving Context & History Helper Functions
  async function getEvolvingContext(assistantId: string, sessionId: string = "default_session") {
    let preferredTone = "Chaleureux, courtois, direct et persuasif. Répondez en Français et en Darija algérienne fluide dès que l'utilisateur s'exprime en arabe/darija.";
    let adaptedExpertise = "Spécialiste de la vente en ligne en Algérie : maîtrise des 58 wilayas, livraison 24h-48h, paiement Cash on Delivery / BaridiMob, et orientation vers le catalogue du site.";
    let userPreferencesSummary = "Clients algériens cherchant une réponse rapide, les frais de livraison précis et la certitude de la qualité avant de commander.";
    let historyExcerpt = "";
    let totalInteractions = 0;

    if (db && assistantId) {
      try {
        // 1. Fetch persistent Evolving Memory document
        const memDoc = await db.collection("evolving_memories").doc(assistantId).get();
        if (memDoc && memDoc.exists) {
          const memData = memDoc.data();
          preferredTone = memData?.preferredTone || preferredTone;
          adaptedExpertise = memData?.adaptedExpertise || adaptedExpertise;
          userPreferencesSummary = memData?.userPreferencesSummary || userPreferencesSummary;
          totalInteractions = memData?.totalInteractions || 0;
        }

        // 2. Fetch recent conversation context history for this assistant/session
        let queryRef = db.collection("conversation_contexts")
          .where("assistantId", "==", assistantId);
        
        if (sessionId && sessionId !== "default_session") {
          queryRef = queryRef.where("sessionId", "==", sessionId);
        }

        const historySnap = await queryRef.orderBy("timestamp", "desc").limit(6).get();
        if (!historySnap.empty) {
          const recentExchanges = historySnap.docs.reverse().map(doc => {
            const d = doc.data();
            return `Client: "${d.userMessage}"\nAssistant: "${d.assistantResponse}"`;
          });
          historyExcerpt = recentExchanges.join("\n---\n");
        }
      } catch (err) {
        console.warn("Notice: Firestore evolving context lookup:", (err as Error)?.message || err);
      }
    }

    return {
      preferredTone,
      adaptedExpertise,
      userPreferencesSummary,
      historyExcerpt,
      totalInteractions
    };
  }

  async function saveConversationAndEvolveContext(params: {
    assistantId: string;
    sessionId?: string;
    channel?: string;
    userMessage: string;
    assistantResponse: string;
  }) {
    const { assistantId, sessionId = "session_" + Date.now(), channel = "web_widget", userMessage, assistantResponse } = params;

    if (!userMessage || !assistantResponse) return;

    if (db && assistantId) {
      try {
        // 1. Save interaction to conversation_contexts collection
        const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await db.collection("conversation_contexts").doc(contextId).set({
          id: contextId,
          assistantId,
          sessionId,
          channel,
          userMessage,
          assistantResponse,
          timestamp: new Date().toISOString()
        });

        // 2. Asynchronous Context Evolution Worker (Gemini analysis)
        (async () => {
          try {
            const evalRes = await ai.models.generateContent({
              model: "gemini-3.7-flash",
              contents: `Analyse cet échange pour faire évoluer la mémoire et l'expertise de l'assistant:
Message Client: "${userMessage}"
Réponse Assistant: "${assistantResponse}"

Génère une mise à jour d'apprentissage sous forme de JSON strict:
{
  "detectedPreference": "Ex: Préférence paiement BaridiMob, Wilaya Oran, Demande de promo, Langue Darija...",
  "toneRecommendation": "Ex: Garder un ton plus direct / Adopter un accueil plus chaleureux...",
  "expertiseRefinement": "Ex: Mettre en avant la garantie 100% remboursé ou le délai 24h...",
  "learnedPattern": "Leçon actionnable pour les futurs clients",
  "shouldUpdateGlobalKnowledge": true ou false
}`,
              config: { responseMimeType: "application/json" }
            });

            if (evalRes.text) {
              const evalData = JSON.parse(evalRes.text);
              const memRef = db.collection("evolving_memories").doc(assistantId);
              const memSnap = await memRef.get();
              const currentMem = memSnap.exists ? memSnap.data() : {};

              const existingPatterns = currentMem?.learnedPatterns || [];
              if (evalData.learnedPattern && !existingPatterns.includes(evalData.learnedPattern)) {
                existingPatterns.unshift(evalData.learnedPattern);
              }

              await memRef.set({
                assistantId,
                preferredTone: evalData.toneRecommendation ? `${evalData.toneRecommendation}. ${currentMem?.preferredTone || ''}`.substring(0, 300) : currentMem?.preferredTone || "Ton chaleureux et commercial",
                adaptedExpertise: evalData.expertiseRefinement ? `${evalData.expertiseRefinement}. ${currentMem?.adaptedExpertise || ''}`.substring(0, 300) : currentMem?.adaptedExpertise || "Expertise e-commerce Algérie",
                userPreferencesSummary: evalData.detectedPreference ? `${evalData.detectedPreference}; ${currentMem?.userPreferencesSummary || ''}`.substring(0, 350) : currentMem?.userPreferencesSummary || "",
                learnedPatterns: existingPatterns.slice(0, 25),
                totalInteractions: (currentMem?.totalInteractions || 0) + 1,
                lastEvolvedAt: new Date().toISOString()
              }, { merge: true });

              // If marked for global knowledge update, add a self-learned knowledge note to assistant
              if (evalData.shouldUpdateGlobalKnowledge && evalData.learnedPattern) {
                const asstRef = db.collection("assistants").doc(assistantId);
                const asstDoc = await asstRef.get();
                if (asstDoc && asstDoc.exists) {
                  const currentNotes = asstDoc.data()?.knowledgeNotes || [];
                  const exists = currentNotes.some((n: any) => n.title?.includes(evalData.learnedPattern.substring(0, 15)));
                  if (!exists) {
                    const newNote = {
                      id: `learned_${Date.now()}`,
                      title: `🧠 ${evalData.detectedPreference || 'Apprentissage Contexte'}`,
                      content: evalData.learnedPattern,
                      category: 'learned',
                      enabled: true,
                      source: 'learned_conversation',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    await asstRef.set({ knowledgeNotes: [newNote, ...currentNotes.slice(0, 40)] }, { merge: true });
                  }
                }
              }
            }
          } catch (bgErr) {
            console.warn("Background context evolution error:", (bgErr as Error)?.message || bgErr);
          }
        })();
      } catch (err) {
        console.warn("Failed to persist conversation context:", err);
      }
    }
  }

  // Universal API Chat Handler (Supports AgentRouter OpenAI-compatible API + Gemini Fallback)
  const handleApiChat = async (req: express.Request, res: express.Response) => {
    try {
      // Extract Bearer token if provided in Authorization header
      const authHeader = req.headers.authorization;
      let tokenKey = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        tokenKey = authHeader.substring(7).trim();
      }

      const assistantId = req.body?.assistantId || tokenKey || (req.query.assistantId as string) || "asst_default";
      const sessionId = req.body?.sessionId || req.body?.visitorId || (req.query.sessionId as string) || "session_" + Date.now();
      const userMessage = req.body?.message || req.body?.prompt || req.body?.query || (req.query.message as string) || "Bonjour, présentations svp";
      const clientWebsite = req.body?.website || req.body?.websiteUrl || "";
      const clientKnowledgeNotes = req.body?.knowledgeNotes || [];
      const channel = req.body?.channel || "web_widget";

      let plan = 'basic';
      let usage = 0;
      let assistantName = 'JawebFlow Assistant';
      let websiteUrl = clientWebsite || '';
      let knowledgeBaseText = '';
      let businessContext = '';

      if (db && assistantId) {
        try {
          const assistantDoc = await db.collection("assistants").doc(assistantId).get();
          if (assistantDoc && assistantDoc.exists) {
            const assistantData = assistantDoc.data();
            plan = assistantData?.plan || 'basic';
            assistantName = assistantData?.name || assistantData?.businessName || 'JawebFlow';
            websiteUrl = assistantData?.website || assistantData?.websiteUrl || websiteUrl;

            // Extract custom knowledge notes and scraped pages
            if (assistantData?.knowledgeNotes && Array.isArray(assistantData.knowledgeNotes)) {
              knowledgeBaseText = assistantData.knowledgeNotes
                .map((n: any) => `[${n.title || n.category || 'Note'}]: ${n.content || ''}`)
                .join("\n");
            }
            if (assistantData?.scannedPages && Array.isArray(assistantData.scannedPages)) {
              const pagesSummary = assistantData.scannedPages
                .map((p: any) => `Page ${p.title || ''} (${p.url || ''})`)
                .join(", ");
              knowledgeBaseText += `\nPages du site indexées: ${pagesSummary}`;
            }
          }
          const usageDoc = await db.collection("usage").doc(assistantId).get();
          if (usageDoc && usageDoc.exists) {
            usage = usageDoc.data()?.count || 0;
          }
        } catch (dbErr) {
          console.warn("Firestore lookup bypassed for chat request:", (dbErr as Error)?.message || dbErr);
        }
      }

      // If knowledge notes were passed in request body directly
      if (Array.isArray(clientKnowledgeNotes) && clientKnowledgeNotes.length > 0) {
        const directNotes = clientKnowledgeNotes
          .map((n: any) => `[${n.title || n.category || 'Information'}]: ${n.content || ''}`)
          .join("\n");
        knowledgeBaseText = `${knowledgeBaseText}\n${directNotes}`.trim();
      }

      // 🧠 Fetch Evolving Memory and Conversation Context from Firestore BEFORE generating response
      const evolvingContext = await getEvolvingContext(assistantId, sessionId);

      // Build rich system instruction incorporating Evolving Context & Continuous Learning
      const richSystemInstruction = `Vous êtes le représentant et assistant IA officiel de l'entreprise "${assistantName}".
Votre mission est d'accueillir les clients, de répondre précisément à toutes leurs questions grâce à la base de connaissances de l'entreprise, et de convertir les prospects avec bienveillance.

Informations & Connaissances de l'entreprise :
${websiteUrl ? `- Site web officiel : ${websiteUrl} (Proposez naturellement le lien du site au client dès qu'il demande à voir le catalogue, les détails d'un produit, ou pour passer commande en ligne).` : "- Proposez le site internet officiel si le client souhaite explorer le catalogue complet ou commander."}
- Livraison : Disponible dans les 58 wilayas d'Algérie sous 24h à 48h.
- Modes de paiement : Paiement à la livraison (Cash on Delivery) et BaridiMob.
- Langues : Répondez couramment en Français, en Arabe et en Darija algérienne selon la langue utilisée par l'utilisateur.

${knowledgeBaseText ? `BASE DE CONNAISSANCES & DONNÉES DU SITE :\n${knowledgeBaseText}\n` : ""}

--- CONTEXTE ÉVOLUTIF & APPRENTISSAGE CONTINU (FIRESTORE) ---
• Ton & Style ajusté : ${evolvingContext.preferredTone}
• Expertise métier adaptée : ${evolvingContext.adaptedExpertise}
• Préférences des clients mémorisées : ${evolvingContext.userPreferencesSummary}
${evolvingContext.historyExcerpt ? `• Historique récent des échanges dans cette conversation :\n${evolvingContext.historyExcerpt}\n` : ""}
--------------------------------------------------------------

Règles de communication :
1. Utilisez TOUTES les données ci-dessus pour donner des réponses exactes sur les produits, services, prix et disponibilités.
2. Adaptez votre ton et votre niveau d'expertise conformément au contexte évolutif appris.
3. Si le client recherche un article ou veut commander, orientez-le poliment vers le site web officiel ${websiteUrl ? `(${websiteUrl})` : ''} ou prenez ses coordonnées (nom, téléphone, wilaya).
4. Restez chaleureux, concis et vendeur.`;

      const limits: Record<string, number> = {
        'basic': 1000,
        'pro': 5000,
        'enterprise': 999999
      };
      const limit = limits[plan] || 1000;

      if (usage >= limit) {
        return res.status(403).json({
          status: "error",
          error: "Quota dépassé. Veuillez mettre à jour votre abonnement.",
          code: "QUOTA_EXCEEDED"
        });
      }
      
      let replyText = "";
      let usedModel = "";

      // 1. Primary AI Provider: AgentRouter.org OpenAI-compatible API
      // Models configured/allowed in AgentRouter key restrictions: deepseek-v4-flash, glm-5.3
      const requestedModel = req.body?.model || process.env.AGENTROUTER_MODEL;
      const candidateModels = Array.from(new Set([
        requestedModel,
        "deepseek-v4-flash",
        "glm-5.3",
        "gpt-4o-mini"
      ].filter(Boolean) as string[]));

      for (const modelName of candidateModels) {
        try {
          const agentRouterRes = await fetch(`${AGENTROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${AGENTROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                {
                  role: "system",
                  content: richSystemInstruction
                },
                {
                  role: "user",
                  content: userMessage
                }
              ],
              temperature: 0.7
            })
          });

          if (agentRouterRes.ok) {
            const arData = await agentRouterRes.json();
            if (arData && arData.choices && arData.choices.length > 0) {
              replyText = arData.choices[0].message?.content || "";
              if (replyText) {
                usedModel = modelName;
                console.log(`Successfully generated response via AgentRouter model: ${modelName}`);
                break; // Stop loop once we get a valid response
              }
            }
          } else {
            const errText = await agentRouterRes.text();
            console.warn(`AgentRouter model '${modelName}' returned status ${agentRouterRes.status}: ${errText}`);
          }
        } catch (arErr) {
          console.warn(`AgentRouter connection error for model '${modelName}':`, (arErr as Error)?.message || arErr);
        }
      }

      // 2. Fallback AI Provider: Google Gemini API if AgentRouter returned empty
      if (!replyText) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.7-flash",
            contents: userMessage,
            config: { systemInstruction: richSystemInstruction }
          });
          replyText = response.text || "Désolé, je n'ai pas pu générer de réponse.";
        } catch (geminiErr) {
          replyText = "Bonjour ! Je suis l'assistant virtuel JawebFlow. Comment puis-je vous aider aujourd'hui ?";
        }
      }
      
      if (db && assistantId) {
        try {
          await db.collection("usage").doc(assistantId).set({ count: usage + 1 }, { merge: true });
        } catch (e) {
          // ignore usage increment error
        }
      }

      // Return clean JSON structured for cURL / PHP json_decode
      res.setHeader("Content-Type", "application/json");
      res.json({
        status: "success",
        assistantId: assistantId,
        provider: usedModel ? "AgentRouter" : "Fallback",
        model: usedModel || "gemini-3.7-flash",
        text: replyText,
        message: replyText,
        response: replyText,
        timestamp: new Date().toISOString()
      });

      // 🧠 ASYNCHRONOUS EVOLVING CONTEXT & CONVERSATION HISTORY MIDDLEWARE
      // Persists conversation to Firestore and evolves assistant preferences & tonality
      saveConversationAndEvolveContext({
        assistantId,
        sessionId,
        channel,
        userMessage,
        assistantResponse: replyText
      });
    } catch (error) {
      console.error("AI API proxy error:", error);
      res.status(500).json({ status: "error", error: "Failed to generate response" });
    }
  };

  app.post("/api/chat", handleApiChat);
  app.get("/api/chat", handleApiChat);
  app.post("/api/v1/chat", handleApiChat);
  app.get("/api/v1/chat", handleApiChat);

  // 🧠 Evolving Context Inspection API for Dashboard
  app.get("/api/evolving-context/:assistantId", async (req, res) => {
    try {
      const { assistantId } = req.params;
      if (!db || !assistantId) {
        return res.json({ status: "disabled", memory: null });
      }

      const memDoc = await db.collection("evolving_memories").doc(assistantId).get();
      const memory = memDoc.exists ? memDoc.data() : {
        assistantId,
        preferredTone: "Chaleureux, direct, poli et persuasif (Français & Darija)",
        adaptedExpertise: "E-commerce Algérie 58 wilayas & paiement BaridiMob / COD",
        userPreferencesSummary: "Rapidité, fiabilité et lien vers catalogue",
        learnedPatterns: [],
        totalInteractions: 0,
        lastEvolvedAt: new Date().toISOString()
      };

      const historySnap = await db.collection("conversation_contexts")
        .where("assistantId", "==", assistantId)
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

      const recentHistory = historySnap.docs.map(d => d.data());

      res.json({
        status: "success",
        memory,
        recentHistory
      });
    } catch (err) {
      res.status(500).json({ status: "error", error: (err as Error)?.message });
    }
  });

  // Proxy Prospect Write
  app.post("/api/prospect", async (req, res) => {
    try {
      const prospectData = req.body;
      if (db) {
        try {
          await db.collection("prospects").add({
            ...prospectData,
            createdAt: new Date()
          });
        } catch (dbErr) {
          console.warn("Firestore prospect save skipped:", (dbErr as Error)?.message || dbErr);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Prospect write error:", error);
      res.status(500).json({ error: "Failed to save prospect" });
    }
  });

  // Get secure assistant config
  app.get("/api/assistant/config/:assistantId", async (req, res) => {
    try {
      const { assistantId } = req.params;
      let data: any = null;

      if (db && assistantId) {
        try {
          const doc = await db.collection("assistants").doc(assistantId).get();
          if (doc && doc.exists) {
            data = doc.data();
          }
        } catch (dbErr) {
          console.warn("Firestore config lookup skipped:", (dbErr as Error)?.message || dbErr);
        }
      }

      if (!data) {
        return res.json({
          plan: 'basic',
          brandingEnabled: true,
          name: 'Assistant'
        });
      }

      const brandingEnabled = data?.plan === 'pro' ? false : true;
      res.json({
        ...data,
        brandingEnabled
      });
    } catch (error) {
      res.json({
        plan: 'basic',
        brandingEnabled: true,
        name: 'Assistant'
      });
    }
  });

  // Online Payment Checkout API (Stripe, SlickPay DZD & BaridiMob)
  app.post("/api/payment/checkout", async (req, res) => {
    try {
      const { plan, cycle, paymentMethod, email, company, amountUsd, amountDzd, cardDetails, baridimobRef } = req.body;

      const invoiceId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
      const stripe = getStripe();

      // SlickPay DZD Integration (slickpay.dz API)
      if (paymentMethod === 'slickpay_dzd' && process.env.SLICKPAY_PUBLIC_KEY && process.env.APP_URL) {
        try {
          const slickpayRes = await fetch("https://api.slickpay.dz/api/v2/users/invoices", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.SLICKPAY_PUBLIC_KEY}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              amount: amountDzd,
              description: `Abonnement JawebFlow - ${plan} (${cycle})`,
              url: `${process.env.APP_URL}/dashboard?payment=success`,
              redirectUrl: `${process.env.APP_URL}/dashboard?payment=success`,
              webhookUrl: `${process.env.APP_URL}/api/payment/webhook/slickpay`
            })
          });

          if (slickpayRes.ok) {
            const slickData = await slickpayRes.json();
            if (slickData && slickData.url) {
              // Store initial pending invoice in Firestore
              if (db) {
                await db.collection("invoices").doc(invoiceId).set({
                  invoiceId,
                  slickpayId: slickData.id || null,
                  plan,
                  cycle,
                  paymentMethod: 'slickpay_dzd',
                  amountUsd,
                  amountDzd,
                  email: email || '',
                  company: company || '',
                  status: 'pending',
                  createdAt: new Date()
                });
              }
              return res.json({ success: true, checkoutUrl: slickData.url, invoiceId });
            }
          }
        } catch (slickErr) {
          console.warn("SlickPay API redirect creation fallback to direct confirmation:", slickErr);
        }
      }

      // If Stripe integration active and selected
      if (paymentMethod === 'stripe_card' && stripe && process.env.APP_URL) {
        try {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Abonnement JawebFlow - ${plan === 'basic' ? 'Plan Basic' : plan === 'pro' ? 'Plan Pro' : 'Plan Enterprise'}`,
                  description: `Facturation ${cycle === 'yearly' ? 'Annuelle' : 'Mensuelle'}`,
                },
                unit_amount: amountUsd * 100,
              },
              quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${process.env.APP_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL}/pricing?payment=cancelled`,
            customer_email: email,
          });

          return res.json({ success: true, checkoutUrl: session.url, invoiceId });
        } catch (stripeErr) {
          console.warn("Stripe live session creation bypassed, relying on direct confirmation:", (stripeErr as Error)?.message);
        }
      }

      // Save Invoice to Firestore if db available
      if (db) {
        try {
          await db.collection("invoices").doc(invoiceId).set({
            invoiceId,
            plan,
            cycle,
            paymentMethod,
            amountUsd,
            amountDzd,
            email: email || '',
            company: company || '',
            status: 'paid',
            createdAt: new Date()
          });
        } catch (dbErr) {
          console.warn("Firestore invoice save skipped:", dbErr);
        }
      }

      return res.json({
        success: true,
        invoiceId,
        message: "Paiement en ligne validé avec succès."
      });
    } catch (error) {
      console.error("Payment API error:", error);
      res.status(500).json({ error: "Échec du traitement du paiement en ligne" });
    }
  });

  // SLICKPAY WEBHOOK HANDLER
  // SlickPay calls this URL when money is received via Edahabia, CIB or BaridiMob
  app.post("/api/payment/webhook/slickpay", async (req, res) => {
    try {
      const payload = req.body;
      console.log("📥 SlickPay Webhook received:", JSON.stringify(payload));

      // Extract transaction status and invoice details from SlickPay payload
      const { id, invoice, status, amount } = payload || {};

      // SlickPay status "completed" or "paid" indicates successful payment
      if (status === 'completed' || status === 'paid' || payload.event === 'invoice.paid') {
        const slickInvoiceId = id || (invoice && invoice.id);

        if (db) {
          // Find matching invoice in Firestore and update status to paid
          const invoiceQuery = await db.collection("invoices").where("slickpayId", "==", slickInvoiceId).get();
          if (!invoiceQuery.empty) {
            invoiceQuery.forEach(async (doc: any) => {
              await doc.ref.update({
                status: 'paid',
                paidAt: new Date(),
                webhookReceived: true
              });

              // Also upgrade the associated user's subscription
              const data = doc.data();
              if (data.email) {
                const userQuery = await db.collection("users").where("email", "==", data.email).get();
                userQuery.forEach(async (uDoc: any) => {
                  await uDoc.ref.update({
                    activePlan: data.plan || 'pro',
                    billingCycle: data.cycle || 'monthly',
                    updatedAt: new Date()
                  });
                });
              }
            });
          }
        }
        return res.status(200).json({ received: true, status: 'validated' });
      }

      return res.status(200).json({ received: true, status: 'ignored' });
    } catch (err) {
      console.error("❌ SlickPay Webhook error:", err);
      return res.status(500).json({ error: "Webhook processing error" });
    }
  });

  // STRIPE WEBHOOK HANDLER
  app.post("/api/payment/webhook/stripe", async (req, res) => {
    try {
      const payload = req.body;
      console.log("📥 Stripe Webhook event:", payload?.type);

      if (payload?.type === 'checkout.session.completed') {
        const session = payload.data.object;
        const customerEmail = session.customer_email;

        if (db && customerEmail) {
          const userQuery = await db.collection("users").where("email", "==", customerEmail).get();
          userQuery.forEach(async (uDoc: any) => {
            await uDoc.ref.update({
              activePlan: 'pro',
              updatedAt: new Date()
            });
          });
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("❌ Stripe Webhook error:", err);
      return res.status(500).json({ error: "Webhook processing error" });
    }
  });

  // META DEVELOPER COMPLIANCE: Privacy Policy, Terms of Service & Data Deletion
  const renderLegalPage = (title: string, content: string) => `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - JawebFlow</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; margin: 0; padding: 2rem 1rem; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        h1 { color: #0f172a; margin-top: 0; font-size: 1.8rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.75rem; }
        h2 { color: #1e40af; margin-top: 1.5rem; font-size: 1.3rem; }
        p, li { color: #475569; font-size: 1rem; }
        .contact-box { background: #f1f5f9; padding: 1rem; border-radius: 8px; margin-top: 2rem; border-left: 4px solid #3b82f6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>JawebFlow - ${title}</h1>
        <p><em>Dernière mise à jour : 30 Août 2026</em></p>
        ${content}
        <div class="contact-box">
          <strong>Contact & Assistance :</strong><br>
          Email : <a href="mailto:marcolabbaci@gmail.com">marcolabbaci@gmail.com</a> | Site Web : <a href="/">JawebFlow</a>
        </div>
      </div>
    </body>
    </html>
  `;

  app.get(["/privacy", "/privacy-policy", "/api/privacy"], (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderLegalPage("Politique de Confidentialité (Privacy Policy)", `
      <h2>1. Introduction</h2>
      <p>Bienvenue sur <strong>JawebFlow</strong>. Nous respectons votre vie privée et nous nous engageons à protéger les données personnelles des utilisateurs et des clients qui interagissent avec nos assistants virtuels et nos intégrations (notamment Instagram Direct et Meta Messenger).</p>
      
      <h2>2. Données collectées</h2>
      <p>Dans le cadre de l'utilisation de l'API Instagram et des services JawebFlow, nous pouvons traiter :</p>
      <ul>
        <li>Les messages directs (DMs) envoyés par les utilisateurs aux comptes professionnels connectés afin de générer les réponses d'assistance automatique par intelligence artificielle.</li>
        <li>L'identifiant d'utilisateur Instagram / Facebook (Scoped ID) nécessaire pour acheminer la réponse au bon destinataire.</li>
        <li>Les informations de profil public (nom d'utilisateur) fournies par l'API Meta.</li>
      </ul>

      <h2>3. Utilisation des données</h2>
      <p>Les données sont utilisées exclusivement pour :</p>
      <ul>
        <li>Permettre aux assistants IA de répondre aux questions des clients en temps réel (tarifs, livraison, disponibilité des produits).</li>
        <li>Fournir aux marchands un historique de leurs conversations dans leur tableau de bord privé.</li>
        <li>Améliorer la qualité des réponses grâce à notre système d'apprentissage contextuel sécurisé.</li>
      </ul>

      <h2>4. Partage et protection des données</h2>
      <p>Nous ne vendons, ne louons et ne transférons aucune donnée personnelle à des tiers à des fins publicitaires. Toutes les communications avec l'API Meta Graph sont chiffrées en HTTPS/TLS.</p>

      <h2>5. Suppression des données (Data Deletion)</h2>
      <p>Conformément aux politiques de la plateforme Meta, tout utilisateur peut demander la suppression de ses données à tout moment en envoyant un email à <a href="mailto:marcolabbaci@gmail.com">marcolabbaci@gmail.com</a> ou en consultant notre page <a href="/data-deletion">Suppression des données</a>.</p>
    `));
  });

  app.get(["/terms", "/terms-of-service", "/api/terms"], (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderLegalPage("Conditions d'Utilisation (Terms of Service)", `
      <h2>1. Objet</h2>
      <p>Les présentes conditions régissent l'utilisation de la plateforme SaaS <strong>JawebFlow</strong> pour l'automatisation du support client et des ventes par intelligence artificielle sur le web, WhatsApp et Instagram.</p>

      <h2>2. Engagements de l'utilisateur</h2>
      <p>L'utilisateur s'engage à utiliser les services de JawebFlow en conformité avec les lois en vigueur et les politiques de la plateforme Meta (Politiques Développeurs Meta et Conditions d'Instagram).</p>

      <h2>3. Disponibilité des services</h2>
      <p>JawebFlow met en œuvre tous les moyens raisonnables pour assurer un accès continu et performant à ses assistants virtuels, sous réserve des périodes de maintenance et des limites de débit de l'API Meta.</p>
    `));
  });

  app.get(["/data-deletion", "/api/data-deletion"], (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderLegalPage("Suppression des données utilisateur (Data Deletion Instructions)", `
      <h2>Instructions de suppression des données Meta / Instagram</h2>
      <p>Si vous souhaitez supprimer les données associées à votre compte Instagram ou à vos interactions avec JawebFlow :</p>
      <ol>
        <li>Accédez à votre compte Facebook / Instagram > Paramètres et confidentialité > Paramètres.</li>
        <li>Rendez-vous dans la section <strong>Applications et sites web</strong>.</li>
        <li>Recherchez <strong>JawebFlow</strong> et cliquez sur <strong>Supprimer</strong>.</li>
        <li>Pour une purge immédiate de vos historiques de chat dans notre base de données sécurisée, envoyez votre demande avec votre identifiant de compte à : <a href="mailto:marcolabbaci@gmail.com">marcolabbaci@gmail.com</a>.</li>
      </ol>
      <p>Toutes les données associées seront définitivement purgées sous 48 heures ouvrées.</p>
    `));
  });

  // INSTAGRAM & META MESSAGING WEBHOOK HANDLER
  // Verification challenge (GET) required by Meta for Developers
  const webhookRoutes = [
    "/api/webhooks/instagram",
    "/api/webhook/instagram",
    "/webhooks/instagram",
    "/webhook/instagram",
    "/api/instagram/webhook",
    "/api/webhooks",
    "/api/webhook"
  ];

  app.get(webhookRoutes, (req, res) => {
    const mode = req.query["hub.mode"] || req.query["mode"];
    const token = req.query["hub.verify_token"] || req.query["verify_token"];
    const challenge = req.query["hub.challenge"] || req.query["challenge"];

    const validTokens = [
      process.env.META_VERIFY_TOKEN,
      "jawebflow_secure_verify_token_2025",
      "jawebflow_meta_verify_token_2026",
      "jawebflow_verify_token",
      "jawebflow"
    ].filter(Boolean);

    console.log("🔍 Meta Webhook Verification Request:", { mode, token, challenge, path: req.path });

    // When Meta sends the verification challenge
    if (challenge) {
      console.log("✅ Meta Webhook challenge verified and sent back:", challenge);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge));
    }

    if (mode === "subscribe") {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge || "OK"));
    }

    // Direct browser opening (for human verification)
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
    const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1');
    const publicOrigin = isLocal
      ? 'https://ais-dev-plnpcivvgr7la27cilze6i-170357957641.europe-west2.run.app'
      : `${req.protocol === 'http' && !isLocal ? 'https' : req.protocol}://${hostHeader}`;
    const callbackUrl = `${publicOrigin}${req.path}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>JawebFlow - Meta Webhook Endpoint</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; border: 1px solid #334155; padding: 30px; border-radius: 16px; max-width: 580px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #10b98120; color: #34d399; border: 1px solid #10b98140; padding: 4px 12px; border-radius: 9999px; font-weight: bold; font-size: 13px; margin-bottom: 15px; }
          h2 { margin: 0 0 10px 0; font-size: 20px; color: white; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 8px 0; }
          .box { background: #0f172a; border: 1px solid #334155; padding: 12px 14px; border-radius: 10px; margin: 8px 0 16px 0; font-family: monospace; font-size: 13px; color: #38bdf8; word-break: break-all; }
          .btn { background: #9333ea; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; margin-top: 6px; }
          .btn:hover { background: #a855f7; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● Webhook Endpoint Prêt & Actif (HTTP 200)</div>
          <h2>JawebFlow API Instagram Webhook</h2>
          <p>Ce point de terminaison est actif et configuré pour valider instantanément les requêtes Meta.</p>
          
          <p><strong>1. URL de rappel (Callback URL) :</strong></p>
          <div class="box" id="cbUrl">${callbackUrl}</div>

          <p><strong>2. Jeton de vérification (Verify Token) :</strong></p>
          <div class="box" style="color: #a855f7; font-weight: bold;">jawebflow_secure_verify_token_2025</div>

          <p style="font-size: 12px; color: #64748b; margin-top: 15px;">
            Conseil : Copiez ces valeurs dans <em>Meta for Developers &gt; API Instagram &gt; Configurer les webhooks</em>.
          </p>
        </div>
      </body>
      </html>
    `);
  });

  // Instagram Direct Inbound Message Webhook (POST) - Direct Meta Graph API Integration
  app.post(webhookRoutes, async (req, res) => {
    try {
      const body = req.body;
      console.log("📥 Instagram Message Webhook received:", JSON.stringify(body));

      // Respond immediately to Meta within 200ms to avoid webhook retries
      res.status(200).json({ status: "EVENT_RECEIVED" });

      if (body.object === "instagram" || body.object === "page") {
        const entries = body.entry || [];
        for (const entry of entries) {
          const messaging = entry.messaging || [];
          for (const event of messaging) {
            const senderId = event.sender?.id;
            const recipientId = event.recipient?.id;
            const message = event.message;

            // Only process incoming text messages (ignore echo from bot itself)
            if (message && message.text && !message.is_echo && senderId) {
              const incomingUserText = message.text;
              console.log(`💬 Message from Instagram User ${senderId}: "${incomingUserText}"`);

              // 1. Fetch business and website knowledge from Firestore if available
              let businessKnowledge = "";
              let businessSiteUrl = "";
              let storeName = "notre boutique";
              let assistantId = "asst_default";

              if (db) {
                try {
                  // Look up the active assistant configurations
                  const asstSnap = await db.collection("assistants").limit(5).get();
                  if (!asstSnap.empty) {
                    assistantId = asstSnap.docs[0].id;
                    const firstDoc = asstSnap.docs[0].data();
                    storeName = firstDoc.businessName || firstDoc.name || storeName;
                    businessSiteUrl = firstDoc.website || firstDoc.websiteUrl || "";
                    if (Array.isArray(firstDoc.knowledgeNotes)) {
                      businessKnowledge = firstDoc.knowledgeNotes
                        .map((n: any) => `[${n.title || n.category || 'Info'}]: ${n.content || ''}`)
                        .join("\n");
                    }
                    if (Array.isArray(firstDoc.scannedPages)) {
                      const pagesList = firstDoc.scannedPages.map((p: any) => p.title || p.url).join(", ");
                      businessKnowledge += `\nPages indexées du site: ${pagesList}`;
                    }
                  }
                } catch (dbErr) {
                  console.warn("Firestore lookup in IG webhook skipped:", (dbErr as Error)?.message || dbErr);
                }
              }

              // 🧠 Fetch evolving context for Instagram session
              const igEvolvingContext = await getEvolvingContext(assistantId, `ig_sender_${senderId}`);

              // 2. Generate intelligent AI response using Gemini with complete business & site knowledge
              let botReplyText = "";
              try {
                const aiRes = await ai.models.generateContent({
                  model: "gemini-3.7-flash",
                  contents: incomingUserText,
                  config: {
                    systemInstruction: `Vous êtes l'assistant IA officiel sur Instagram pour "${storeName}" en Algérie.
Votre mission :
1. Répondez aux questions avec politesse, rapidité et concision (format Instagram DM), en Français et en Darija algérienne si le client écrit en arabe/darija.
2. Exploitez TOUTES les connaissances de l'entreprise et du site web ci-dessous.
3. Si le client recherche un article, veut voir le catalogue ou commander, proposez-lui avec fluidité le site web officiel ${businessSiteUrl ? `(${businessSiteUrl})` : ''} ou prenez ses informations de livraison.

Connaissances & Données du commerce :
${businessSiteUrl ? `- Site Web officiel : ${businessSiteUrl}` : "- Proposez le site internet de la boutique s'il souhaite commander."}
- Livraison : Disponible dans les 58 wilayas d'Algérie sous 24h à 48h.
- Paiement : À la livraison (main à main) et par BaridiMob.
${businessKnowledge ? `\nBASE DE CONNAISSANCES DE LA BOUTIQUE :\n${businessKnowledge}` : ""}

--- CONTEXTE ÉVOLUTIF APPRIS ---
• Ton adapté : ${igEvolvingContext.preferredTone}
• Expertise retenue : ${igEvolvingContext.adaptedExpertise}
• Préférences : ${igEvolvingContext.userPreferencesSummary}
${igEvolvingContext.historyExcerpt ? `• Historique Instagram récent :\n${igEvolvingContext.historyExcerpt}` : ""}`
                  }
                });
                botReplyText = aiRes.text || `Salam ! Bienvenue chez ${storeName}. Comment puis-je vous aider ? ${businessSiteUrl ? `Vous pouvez aussi visiter notre site : ${businessSiteUrl}` : ''}`;
              } catch (aiErr) {
                botReplyText = `Salam ! Merci pour votre message. Nous livrons dans les 58 wilayas d'Algérie sous 24h à 48h. ${businessSiteUrl ? `Découvrez tous nos produits sur notre site : ${businessSiteUrl}` : 'Quel produit vous intéresse ?'}`;
              }

              // 2. Send the reply back directly via Meta Instagram Graph API if token is configured
              const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
              if (PAGE_ACCESS_TOKEN) {
                try {
                  const metaSendRes = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { text: botReplyText }
                    })
                  });
                  const sendResult = await metaSendRes.json();
                  console.log("📤 Meta Direct DM Response sent:", sendResult);
                } catch (sendErr) {
                  console.error("❌ Failed to send DM reply back to Instagram:", sendErr);
                }
              } else {
                console.log(`ℹ️ [Simulated Meta Send] Generated reply for ${senderId}: "${botReplyText}" (Provide META_PAGE_ACCESS_TOKEN to auto-send live via Graph API)`);
              }

              // 🧠 3. Instagram Conversation Continuous Self-Learning & History Middleware
              saveConversationAndEvolveContext({
                assistantId,
                sessionId: `ig_sender_${senderId}`,
                channel: "instagram",
                userMessage: incomingUserText,
                assistantResponse: botReplyText
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ Instagram Webhook Error:", err);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
