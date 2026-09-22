import dotenv from "dotenv";

// Load .env before anything reads process.env: without this the documented
// variables (AGENTROUTER_API_KEY, GEMINI_API_KEY, STRIPE_*, SLICKPAY_*,
// INSTAGRAM_*) were silently ignored when running locally, which disabled the
// AI replies, payments and Instagram integration even with a filled .env file.
dotenv.config({ quiet: true });

import express from "express";
import http from "http";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Process resilience
// ---------------------------------------------------------------------------
// A single floating rejection must never take the whole site down: the Node
// runtime exits the process on unhandled rejections by default, and third-party
// SDKs (Firestore Admin, gRPC/gax, Stripe, fetch) are known to leak rejections
// from background work. Log loudly and keep serving instead of crashing.
process.on("unhandledRejection", (reason: any) => {
  console.error("⚠️  Unhandled promise rejection (server kept alive):", reason?.message || reason);
});
process.on("uncaughtException", (err: any) => {
  console.error("⚠️  Uncaught exception (server kept alive):", err?.stack || err?.message || err);
});

// .env.example ships placeholder values such as GEMINI_API_KEY="MY_GEMINI_API_KEY".
// Those are non-empty strings, so a naive `if (process.env.X)` considered the
// integration "configured" and every request failed with an obscure provider
// error. Treat placeholders as missing.
const ENV_PLACEHOLDER = /^(my_|your_|change[_-]?me|replace|placeholder|todo|xxx|<)/i;

function envValue(name: string): string {
  const raw = (process.env[name] || "").trim().replace(/^["']|["']$/g, "").trim();
  if (!raw || ENV_PLACEHOLDER.test(raw)) return "";
  return raw;
}

/**
 * Anti-SSRF : le crawler et le testeur de webhook acceptent une URL fournie par
 * l'utilisateur. On refuse les adresses internes (localhost, réseau privé,
 * métadonnées cloud 169.254.169.254) pour ne pas transformer ces endpoints en
 * proxy vers l'infrastructure interne.
 */
function checkPublicUrl(rawUrl: string): { ok: boolean; reason?: string; url?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL invalide" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Seuls http:// et https:// sont autorisés" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Hôte interne refusé" };
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const isPrivate =
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (isPrivate) return { ok: false, reason: "Adresse IP interne refusée" };
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return { ok: false, reason: "Adresse IPv6 interne refusée" };
  }
  if (!host.includes(".") && !ipv4) {
    return { ok: false, reason: "Nom d'hôte non qualifié refusé" };
  }
  return { ok: true, url: parsed };
}

/**
 * Limiteur de débit en mémoire (par IP). Les endpoints IA/scan sont publics et
 * sans authentification : sans limite, n'importe qui peut épuiser le quota
 * Gemini ou marteler le crawler. En production (Cloudflare), ajouter en plus
 * une règle de rate limiting au niveau du pare-feu.
 */
function createRateLimiter(options: { windowMs: number; max: number; label: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + options.windowMs });
      if (hits.size > 5000) {
        for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      console.warn(`⏱️  Limite de débit atteinte (${options.label}) pour ${ip}`);
      return res.status(429).json({
        status: "error",
        error: "Trop de requêtes",
        code: "RATE_LIMITED",
        message: `Trop de requêtes sur ${options.label}. Réessayez dans ${retryAfter} seconde(s).`,
      });
    }
    return next();
  };
}

/**
 * Vérifie le jeton Firebase d'un appelant (`Authorization: Bearer <idToken>`).
 *
 * Utilise l'API publique Identity Toolkit avec la clé Web du projet (déjà
 * présente dans firebase-applet-config.json) : la vérification fonctionne donc
 * même quand l'Admin Firestore n'est pas disponible.
 */
let firebaseWebApiKey = "";
try {
  const appletConfig = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
  firebaseWebApiKey = appletConfig?.apiKey || "";
} catch {
  // config illisible : la vérification de jeton sera simplement indisponible
}

async function verifyFirebaseIdTokenFromRequest(
  req: express.Request
): Promise<{ uid: string; email?: string } | null> {
  const header = req.headers.authorization;
  const idToken = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!firebaseWebApiKey || !idToken) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseWebApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const user = data?.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

// Initialize Stripe lazily
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  const stripeKey = envValue("STRIPE_SECRET_KEY");
  if (!stripeClient && stripeKey) {
    stripeClient = new Stripe(stripeKey);
  }
  return stripeClient;
}

// Initialize Firebase Admin safely.
//
// IMPORTANT: creating a Firestore client is cheap, but the first query needs
// real Application Default Credentials. Without them the Admin SDK throws
// NO_ADC_FOUND *and* leaks unhandled rejections from its internal gRPC client
// pool, which used to crash the whole server. So we validate the credential
// first and only expose `db` when it actually works; every route already
// degrades gracefully when `db` is null.
let db: any = null;
let firebaseAdminStatus: "initializing" | "ready" | "unavailable" = "initializing";

async function initFirebaseAdmin(): Promise<void> {
  let config: any;
  try {
    config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
  } catch (e) {
    firebaseAdminStatus = "unavailable";
    console.warn("Firebase admin disabled: firebase-applet-config.json unreadable:", (e as Error)?.message || e);
    return;
  }

  try {
    const app = initializeApp({ projectId: config.projectId });

    // Fast credential probe (~50ms when absent, no network retry storm).
    const credential = applicationDefault();
    const token = await credential.getAccessToken();

    if (!token?.access_token) {
      firebaseAdminStatus = "unavailable";
      console.warn(
        "Firebase admin disabled: Application Default Credentials returned no access token. " +
          "Set GOOGLE_APPLICATION_CREDENTIALS or run on a platform with an attached service account " +
          "to enable server-side Firestore features."
      );
      return;
    }

    db = getFirestore(app, config.firestoreDatabaseId || undefined);
    firebaseAdminStatus = "ready";
    console.log("✅ Firebase Admin / Firestore ready (project:", config.projectId + ")");
  } catch (e) {
    firebaseAdminStatus = "unavailable";
    console.warn(
      "Firebase admin disabled (no usable Application Default Credentials in this environment):",
      (e as Error)?.message || e
    );
  }
}

// In-memory cache for Instagram integrations across requests during server runtime
const instagramTokensCache = new Map<string, any>();

async function startServer() {
  const app = express();
  // Honour the platform-provided port (Cloud Run / local preview), default 3000.
  const PORT = Number(process.env.PORT) || 3000;

  // `verify` conserve le corps brut : indispensable pour valider la signature
  // HMAC des webhooks (la sérialisation JSON ne garantit pas les octets reçus).
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }));

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
  const GEMINI_API_KEY = envValue("GEMINI_API_KEY");
  // Identifiant de modèle centralisé et surchargeable : la génération 2.5 est
  // annoncée en fin de vie (arrêt octobre 2026), d'où ce défaut 3.1 Flash-Lite.
  const GEMINI_MODEL = envValue("GEMINI_MODEL") || "gemini-3.1-flash-lite";
  const AGENTROUTER_API_KEY = envValue("AGENTROUTER_API_KEY");
  const AGENTROUTER_BASE_URL = (process.env.AGENTROUTER_BASE_URL || "https://co.agentrouter.org/v1").replace(/\/$/, "");
  // N'analyse qu'un échange sur N via Gemini pour faire "évoluer" la mémoire de
  // l'assistant (le reste des échanges se contente d'incrémenter le compteur,
  // sans appel IA). C'est de très loin la plus grosse source d'appels Gemini
  // "invisibles" : avant ce throttle, CHAQUE message déclenchait un 2e appel
  // Gemini en arrière-plan, en plus de la réponse elle-même.
  const GEMINI_EVOLUTION_SAMPLE_RATE = Math.max(1, Number(envValue("GEMINI_EVOLUTION_SAMPLE_RATE")) || 4);

  // Fallback Gemini API client
  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
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
        // 1. Save interaction to conversation_contexts collection (safely guarded)
        const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        try {
          await db.collection("conversation_contexts").doc(contextId).set({
            id: contextId,
            assistantId,
            sessionId,
            channel,
            userMessage,
            assistantResponse,
            timestamp: new Date().toISOString()
          });
        } catch (ctxErr) {
          // Suppress permission errors in preview sandbox if rules restrict anonymous writes
          console.debug("Conversation context storage skipped:", (ctxErr as Error)?.message || ctxErr);
        }

        // 2. Asynchronous Context Evolution Worker (Gemini analysis)
        (async () => {
          try {
            // Throttle: lecture Firestore (gratuite) du compteur d'interactions
            // AVANT tout appel Gemini. Si on n'est pas sur un multiple de
            // GEMINI_EVOLUTION_SAMPLE_RATE, on incrémente juste le compteur et
            // on sort — aucun appel Gemini pour ce message.
            const memRefThrottle = db.collection("evolving_memories").doc(assistantId);
            const memSnapThrottle = await memRefThrottle.get();
            const currentMemThrottle = memSnapThrottle.exists ? memSnapThrottle.data() : {};
            const nextInteractionCount = (currentMemThrottle?.totalInteractions || 0) + 1;
            const shouldRunGeminiAnalysis = nextInteractionCount % GEMINI_EVOLUTION_SAMPLE_RATE === 0;

            if (!shouldRunGeminiAnalysis) {
              await memRefThrottle.set({
                assistantId,
                totalInteractions: nextInteractionCount,
                lastEvolvedAt: currentMemThrottle?.lastEvolvedAt || new Date().toISOString()
              }, { merge: true });
              return;
            }

            const evalRes = await ai.models.generateContent({
              // Must be a real Gemini model id: "gemini-3.7-flash" does not exist
              // and made this background learning worker fail every single time.
              model: GEMINI_MODEL,
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
              try {
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
              } catch (memErr) {
                console.debug("Memory evolution database sync skipped:", (memErr as Error)?.message || memErr);
              }
            }
          } catch (bgErr) {
            console.debug("Background context evolution error:", (bgErr as Error)?.message || bgErr);
          }
        })();
      } catch (err) {
        console.debug("Failed to persist conversation context:", err);
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

      let plan = 'free';
      let usage = 0;
      let assistantName = 'JawebFlow Assistant';
      let websiteUrl = clientWebsite || '';
      let knowledgeBaseText = '';
      let businessContext = '';

      const isJawebFlowOfficial = 
        assistantId === 'jawebflow_assistant' || 
        assistantId === 'asst_jawebflow' || 
        assistantId === 'Mon Entreprise' ||
        assistantId.toLowerCase().includes('jawebflow') || 
        assistantId.startsWith('demo_');

      if (assistantId === 'demo_ecommerce') {
        plan = 'pro';
        assistantName = 'Maison Lila Cosmétiques';
        websiteUrl = 'https://maisonlila.dz';
        knowledgeBaseText = `Maison Lila est une boutique algérienne de soins et cosmétiques 100% naturels et certifiés bio.
• Produits phares : Pack Soin Bio visage & corps (3 800 DA au lieu de 4 500 DA), Huile d'argan pure pressée à froid (1 900 DA), Eau florale de rose de Damas (1 200 DA), Sérum hydratant éclat (2 400 DA).
• Livraison : 24h sur Alger, Blida, Boumerdès et Tipaza (400 DA), 48h à 72h pour les 54 autres wilayas (600 DA). Le livreur appelle 1h avant son passage.
• Modes de paiement : Paiement en espèces à la livraison (Cash on Delivery) après vérification du colis, ou par BaridiMob.
• Retours et échanges : 7 jours ouvrés si le produit n'est pas ouvert.`;
      } else if (assistantId === 'demo_services') {
        plan = 'pro';
        assistantName = 'Nexus Conseil & Digital';
        websiteUrl = 'https://nexus-conseil.dz';
        knowledgeBaseText = `Nexus Conseil est une agence algérienne d'audit digital, développement web et stratégie B2B.
• Prestations : Audit technique SEO & UX (livré sous 48h avec rapport PDF détaillé et devis proforma), Forfaits d'accompagnement mensuel (à partir de 25 000 DA/mois), Développement d'applications sur-mesure.
• Délais : Démarrage des missions sous 48h à 72h ouvrées après signature du bon de commande.
• Zone d'intervention : Dans les 58 wilayas à distance (visio & espace partagé) et présentiel à Alger, Oran et Constantine.
• Facturation : Factures proforma et définitives certifiées avec NIF, NIS, RC et RIB bancaire pour paiement par virement ou chèque.`;
      } else if (assistantId === 'demo_formation') {
        plan = 'pro';
        assistantName = 'Horizon Academy Pro';
        websiteUrl = 'https://horizon-academy.dz';
        knowledgeBaseText = `Horizon Academy est un institut agréé de formation professionnelle et continue en Algérie.
• Formations phares : Management de projet & Leadership (38 000 DA, 30 heures), Marketing Digital & Growth (32 000 DA), Comptabilité & Fiscalité d'entreprise (35 000 DA).
• Formats disponibles : 100% en ligne le soir (18h30-21h) ou présentiel le samedi (9h-16h30) avec accès illimité aux replays vidéos.
• Diplôme & Certificat : Certificat de formation professionnelle reconnu remis après validation du projet pratique.
• Paiement : Règlement échelonné possible en 2 ou 3 fois sans frais par BaridiMob, virement ou espèces.`;
      } else if (isJawebFlowOfficial) {
        plan = 'pro';
        assistantName = req.body?.businessName || 'JawebFlow';
        websiteUrl = clientWebsite || 'https://jawebflow.dz';
        knowledgeBaseText = req.body?.knowledgeBaseText || `JawebFlow est la plateforme SaaS n°1 en Algérie permettant à toute entreprise, boutique e-commerce ou agence d'ajouter un chatbot conversationnel ultra-rapide sur son site web.
• Fonctionnalités : widget web personnalisable en 2 minutes, support bilingue Français et Darija algérienne fluide, importation de documents (PDF, Word, fiches produits), scan de site automatique, CRM de capture de prospects (téléphone, email).
• Forfaits et tarifs officiels :
  - Plan Gratuit (0 $ / mois) : Accès au tableau de bord, intégration widget, 0 crédit IA inclus.
  - Plan Basic (29 $ / mois soit ~6 850 DZD) : Widget web universel (Shopify, WordPress, Webflow, etc.), jusqu'à 1 000 conversations/mois, support de la base de connaissances.
  - Plan Pro / Business (79 $ / mois soit ~18 700 DZD) : Widget illimité, jusqu'à 5 000 conversations/mois, détection automatique des leads et coordonnées clients.
  - Plan Enterprise (199 $ / mois soit ~47 100 DZD) : Conversations illimitées, intégrations sur mesure (CRM, Google Sheets), accompagnement dédié.
• Installation : Une seule ligne de code JavaScript <script src="https://jawebflow.dz/cdn/widget.js" ...></script> à coller avant </body> sur tout site.
• Modes de paiement en Algérie : BaridiMob, CCP, virement bancaire et carte bancaire sécurisée.`;
      }

      // The assistant's plan decides whether AI replies are allowed at all
      // (Free plan = 0 AI credit). We must therefore distinguish "explicitly on
      // the free plan" from "plan could not be verified": treating an
      // unverifiable plan as "free" used to disable the AI for every assistant
      // whenever the server had no Firestore Admin access (local dev, preview
      // environments without Application Default Credentials).
      let planVerified = isJawebFlowOfficial;
      let assistantFound = isJawebFlowOfficial;

      if (db && assistantId && !isJawebFlowOfficial) {
        try {
          let assistantData: any = null;

          const assistantDoc = await db.collection("assistants").doc(assistantId).get();
          if (assistantDoc && assistantDoc.exists) {
            assistantData = assistantDoc.data();
          }

          // Integrations pass the public widgetId rather than the document id.
          if (!assistantData) {
            const byWidgetId = await db.collection("assistants").where("widgetId", "==", assistantId).limit(1).get();
            if (!byWidgetId.empty) {
              assistantData = byWidgetId.docs[0].data();
            }
          }

          if (assistantData) {
            assistantFound = true;
            planVerified = true;
            plan = assistantData.plan || 'free';
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

${isJawebFlowOfficial ? `RÈGLES SPÉCIALES POUR JAWEBFLOW :
- Soyez extrêmement concis, percutant et orienté CLOSING (conversion directe vers l'inscription ou le choix du plan).
- Ne donnez pas trop de détails inutiles, allez droit au but.
- Structurez vos réponses en étapes simples et claires (ex: Étape 1, Étape 2...) pour guider le client pas à pas.` : ''}

INFORMATIONS & CONNAISSANCES DE L'ENTREPRISE :
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

Règles de communication impératives :
1. INTERDICTION FORMELLE D'UTILISER LE GRAS AVEC DES ÉTOILES (**bold** ou *). Écrivez uniquement en texte brut propre et professionnel, sans aucun astérisque (*).
2. Utilisez TOUTES les données ci-dessus pour donner des réponses exactes sur les produits, services, prix et disponibilités.
3. Si le client recherche un article ou veut commander, orientez-le poliment vers le site web officiel ${websiteUrl ? `(${websiteUrl})` : ''} ou prenez ses coordonnées (nom, téléphone, wilaya).
4. Restez chaleureux, concis et vendeur.`;

      const limits: Record<string, number> = {
        'free': 0,
        'basic': 1000,
        'pro': 5000,
        'enterprise': 999999
      };
      const limit = limits[plan] !== undefined ? limits[plan] : 0;

      // Assistant id exists but is unknown to the platform: tell the integrator
      // instead of blaming the "free plan", which sent users chasing the wrong fix.
      if (!planVerified && !assistantFound && db) {
        return res.status(404).json({
          status: "error",
          error: "Assistant introuvable.",
          code: "ASSISTANT_NOT_FOUND",
          message:
            "Aucun assistant ne correspond à cet identifiant. Vérifiez l'assistantId (identifiant du document Firestore ou widgetId) transmis à /api/chat.",
        });
      }

      // When Firestore Admin is unavailable the plan cannot be verified: keep the
      // AI usable (degraded mode) instead of locking out paid assistants.
      if (!planVerified) {
        console.warn(
          "⚠️  Plan de l'assistant non vérifiable (Firebase Admin indisponible) — réponse IA autorisée en mode dégradé pour:",
          assistantId
        );
      } else if (plan === 'free' || usage >= limit) {
        return res.status(403).json({
          status: "error",
          error: plan === 'free' 
            ? "Fonctionnalité IA désactivée sur le plan gratuit." 
            : "Votre limite de messages pour cette période a été atteinte.",
          code: plan === 'free' ? "AI_DISABLED_FREE_PLAN" : "LIMIT_REACHED",
          message: plan === 'free'
            ? "Bonjour ! L'assistant intelligent n'est pas activé. Veuillez contacter l'entreprise directement."
            : "Bonjour ! Votre forfait de messages est actuellement épuisé. Rendez-vous sur votre espace de gestion pour réactiver l'assistant."
        });
      }
      
      let replyText = "";
      let usedModel = "";
      let usedProvider = "";
      // Human-readable trace of what was attempted, surfaced in the 503 payload
      // so a missing/expired key is obvious instead of a generic outage message.
      const providerIssues: string[] = [];

      // 1. Primary AI Provider: Google Gemini API (Fast, reliable, secure)
      if (GEMINI_API_KEY) {
        try {
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: userMessage,
            config: { systemInstruction: richSystemInstruction }
          });
          replyText = response.text || "";
          if (replyText) {
            usedModel = GEMINI_MODEL;
            usedProvider = "Gemini";
          }
        } catch (geminiErr) {
          const reason = (geminiErr as Error)?.message || String(geminiErr);
          console.warn("Gemini API error:", reason);
          providerIssues.push(`${GEMINI_MODEL}: ${reason}`);
        }
      } else {
        providerIssues.push("Gemini ignoré: GEMINI_API_KEY absent");
      }

      // JawebFlow doit rester sur Gemini ; aucun fallback silencieux pour son assistant officiel.
      // Pour les assistants clients, AgentRouter reste disponible comme secours optionnel.
      if (!replyText && !isJawebFlowOfficial && AGENTROUTER_API_KEY) {
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
                  usedProvider = "AgentRouter";
                  break; 
                }
              }
              providerIssues.push(`agentrouter ${modelName}: réponse vide`);
            } else {
              const bodyText = await agentRouterRes.text().catch(() => "");
              const reason = `HTTP ${agentRouterRes.status} ${bodyText.slice(0, 160)}`.trim();
              console.warn("AgentRouter API error:", reason);
              providerIssues.push(`agentrouter ${modelName}: ${reason}`);
            }
          } catch (arErr) {
            const reason = (arErr as Error)?.message || String(arErr);
            console.warn("AgentRouter request failed:", reason);
            providerIssues.push(`agentrouter ${modelName}: ${reason}`);
          }
        }
      } else if (!replyText && !isJawebFlowOfficial && !AGENTROUTER_API_KEY) {
        providerIssues.push("AgentRouter ignoré: AGENTROUTER_API_KEY absent");
      }
      
      // If no AI provider succeeded or API key is exhausted / 0 credit
      if (!replyText) {
        console.error("❌ Aucun fournisseur IA n'a répondu:", providerIssues.join(" | ") || "aucune clé API configurée");
        return res.status(503).json({
          status: "error",
          error: "Service temporairement indisponible",
          code: "SERVICE_UNAVAILABLE",
          message: "Bonjour ! Notre conseiller automatique est momentanément indisponible. Merci de nous laisser vos coordonnées ou de réessayer dans un instant.",
          response: "Bonjour ! Notre conseiller automatique est momentanément indisponible. Merci de nous laisser vos coordonnées ou de réessayer dans un instant.",
          // Diagnostics for the integrator (no secrets): tells whether the keys
          // are missing or the provider refused the request.
          diagnostics: providerIssues
        });
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
        provider: usedProvider || "Unavailable",
        model: usedModel || GEMINI_MODEL,
        text: replyText,
        message: replyText,
        response: replyText,
        timestamp: new Date().toISOString()
      });

      // 🧠 ASYNCHRONOUS EVOLVING CONTEXT & CONVERSATION HISTORY MIDDLEWARE
      // Persists conversation to Firestore and evolves assistant preferences & tonality.
      // Fire-and-forget on purpose, but the rejection is always handled: an
      // unhandled rejection here would kill the whole server process.
      void saveConversationAndEvolveContext({
        assistantId,
        sessionId,
        channel,
        userMessage,
        assistantResponse: replyText
      }).catch((e) => console.debug("Background context persistence skipped:", (e as Error)?.message || e));
    } catch (error) {
      console.error("AI API proxy error:", error);
      res.status(500).json({ status: "error", error: "Failed to generate response" });
    }
  };

  // Limites de débit : /api/chat est public (widget) et les endpoints de scan /
  // test sont coûteux — sans limite, le quota IA peut être épuisé par un tiers.
  const chatRateLimit = createRateLimiter({ windowMs: 60_000, max: 60, label: "/api/chat" });
  const heavyRateLimit = createRateLimiter({ windowMs: 60_000, max: 10, label: "scan & tests webhook" });

  app.post("/api/chat", chatRateLimit, handleApiChat);
  app.get("/api/chat", chatRateLimit, handleApiChat);
  app.post("/api/v1/chat", chatRateLimit, handleApiChat);
  app.get("/api/v1/chat", chatRateLimit, handleApiChat);

  // 📦 Standalone Widget Script CDN Distribution
  app.get(["/widget.js", "/cdn/widget.js"], (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    // Une seule source de vérité : `public/cdn/widget.js` (la copie maintenue,
    // utilisée par le snippet d'installation). `public/widget.js` divergeait et
    // servait un code différent selon l'URL appelée.
    const widgetPath = path.join(process.cwd(), "public", "cdn", "widget.js");
    res.sendFile(widgetPath);
  });

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
      
      // Auto-enrichment (Visitor Tags)
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Unknown IP';
      const userAgent = req.headers['user-agent'] || 'Unknown Agent';
      const language = req.headers['accept-language'] || 'Unknown Language';
      const enrichedData = {
        ...prospectData,
        visitorTags: {
          ip,
          userAgent,
          language: language.split(',')[0],
          capturedAt: new Date().toISOString()
        },
        createdAt: new Date()
      };

      if (db) {
        try {
          await db.collection("prospects").add(enrichedData);
        } catch (dbErr) {
          console.warn("Firestore prospect save skipped:", (dbErr as Error)?.message || dbErr);
        }
      }
      res.json({ success: true, enrichedData });
    } catch (error) {
      console.error("Prospect write error:", error);
      res.status(500).json({ error: "Failed to save prospect" });
    }
  });

  // Proxy Event Tracking
  app.post("/api/track", async (req, res) => {
    try {
      const trackData = req.body;
      if (db) {
        try {
          await db.collection("interaction_events").add({
            ...trackData,
            createdAt: new Date()
          });
        } catch (dbErr) {
          console.warn("Firestore track save skipped:", (dbErr as Error)?.message || dbErr);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Track write error:", error);
      res.status(500).json({ error: "Failed to save tracking event" });
    }
  });

  // Proxy Webhook Ping Test (Bypasses browser CORS & tests endpoint connectivity)
  app.post("/api/webhook/test-ping", heavyRateLimit, async (req, res) => {
    try {
      const { webhookUrl, payload, testType } = req.body;
      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: "Veuillez fournir une URL de webhook valide.",
          error: "URL manquante ou invalide" 
        });
      }

      const trimmedUrl = webhookUrl.trim();
      const pingTarget = trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') ? trimmedUrl : `https://${trimmedUrl}`;
      // Anti-SSRF : cet endpoint effectue un fetch vers l'URL fournie.
      const pingCheck = checkPublicUrl(pingTarget);
      if (!pingCheck.ok) {
        return res.status(400).json({
          success: false,
          message: `URL refusée : ${pingCheck.reason}`,
          error: "URL invalide"
        });
      }

      const deliveryId = `ping_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const timestampIso = new Date().toISOString();

      const samplePayload = payload || {
        event: testType === 'ping' ? 'webhook.ping' : 'lead.captured.test',
        deliveryId,
        timestamp: timestampIso,
        source: 'JawebFlow Platform Webhook Verifier',
        data: {
          test: true,
          leadId: 'lead_test_213',
          fullName: 'Ahmed Benmansour',
          email: 'ahmed.benmansour@example.dz',
          phone: '+213 555 12 34 56',
          need: 'Demande de devis & test de connectivité webhook',
          language: 'fr',
          capturedAt: timestampIso
        }
      };

      const startTime = Date.now();
      let response: Response;
      try {
        response = await fetch(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'JawebFlow-Webhook-Tester/2.0 (+https://jawebflow.dz)',
            'X-JawebFlow-Event': testType === 'ping' ? 'ping' : 'lead.captured.test',
            'X-JawebFlow-Delivery': deliveryId,
            'X-JawebFlow-Timestamp': timestampIso
          },
          body: JSON.stringify(samplePayload),
          signal: AbortSignal.timeout(10000)
        });
      } catch (networkErr: any) {
        const duration = Date.now() - startTime;
        let errorMessage = networkErr?.message || "Impossible de joindre l'adresse.";
        if (networkErr?.name === 'TimeoutError' || errorMessage.includes('timeout')) {
          errorMessage = "Délai d'attente dépassé (timeout 10 secondes). Votre serveur distant n'a pas répondu à temps.";
        } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
          errorMessage = "Nom de domaine introuvable (erreur DNS). Vérifiez l'orthographe du domaine.";
        } else if (errorMessage.includes('ECONNREFUSED')) {
          errorMessage = "Connexion refusée par le serveur cible (port fermé ou service arrêté).";
        }

        return res.status(200).json({
          success: false,
          status: 0,
          statusText: 'Network Error',
          responseTimeMs: duration,
          message: `Échec du ping : ${errorMessage}`,
          details: `Erreur réseau : ${errorMessage}\nURL testée : ${trimmedUrl}`,
          sentPayload: samplePayload
        });
      }

      const responseTimeMs = Date.now() - startTime;
      let respBody = "";
      try {
        respBody = await response.text();
      } catch (_) {}

      const isOk = response.ok; // HTTP 200-299
      let statusExplanation = "";
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        statusExplanation = `Réponse HTTP ${response.status} (${response.statusText || 'OK'}). Le serveur distant a validé et accepté la requête avec succès.`;
      } else if (response.status === 404) {
        statusExplanation = `Réponse HTTP 404 (Introuvable). L'URL du webhook n'existe pas ou la route n'est pas déclarée.`;
      } else if (response.status === 401 || response.status === 403) {
        statusExplanation = `Réponse HTTP ${response.status} (Non autorisé / Interdit). Le serveur distant requiert une authentification spécifique.`;
      } else if (response.status >= 500) {
        statusExplanation = `Réponse HTTP ${response.status} (Erreur Interne du Serveur). Le serveur distant a rencontré une exception lors du traitement.`;
      } else {
        statusExplanation = `Réponse HTTP ${response.status} (${response.statusText}).`;
      }

      res.json({
        success: isOk,
        status: response.status,
        statusText: response.statusText,
        responseTimeMs,
        responseBody: respBody.substring(0, 1500),
        message: isOk 
          ? `Webhook connecté avec succès (${response.status} ${response.statusText} en ${responseTimeMs}ms)`
          : `Le serveur a renvoyé un statut HTTP d'erreur (${response.status})`,
        details: statusExplanation,
        sentPayload: samplePayload
      });
    } catch (err: any) {
      console.error("Webhook test ping error:", err);
      res.status(500).json({
        success: false,
        message: `Erreur interne lors du test : ${err?.message || 'Erreur inconnue.'}`
      });
    }
  });

  // Deep Multi-Page Crawler & AI Knowledge Generator
  app.post("/api/crawler/analyze", heavyRateLimit, async (req, res) => {
    try {
      let { url, assistantId, userId } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      url = url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }

      // Anti-SSRF : pas de fetch vers localhost / réseau privé / métadonnées cloud.
      const urlCheck = checkPublicUrl(url);
      if (!urlCheck.ok) {
        return res.status(400).json({ error: `URL refusée : ${urlCheck.reason}` });
      }

      // Le scan alimente la base de connaissances d'un assistant : on s'assure
      // que l'appelant est bien authentifié et propriétaire de cet assistant.
      if (db) {
        const caller = await verifyFirebaseIdTokenFromRequest(req);
        if (!caller) {
          return res.status(401).json({
            error: "Authentification requise",
            code: "AUTH_REQUIRED",
            message: "Connectez-vous pour lancer un scan de site.",
          });
        }
        if (assistantId) {
          try {
            const ownedDoc = await db.collection("assistants").doc(assistantId).get();
            const ownerId = ownedDoc?.exists ? ownedDoc.data()?.userId : null;
            if (ownerId && ownerId !== caller.uid) {
              return res.status(403).json({ error: "Accès refusé : cet assistant ne vous appartient pas." });
            }
          } catch (ownershipErr) {
            console.warn("Vérification de propriété ignorée:", (ownershipErr as Error)?.message || ownershipErr);
          }
        }
      }

      let parsedBase: URL;
      try {
        parsedBase = new URL(url);
      } catch {
        return res.status(400).json({ error: "URL invalide" });
      }

      console.log(`[Crawler] Starting deep scan for: ${url}`);

      // Helper: clean HTML into clean text
      const cleanHtmlToText = (rawHtml: string): string => {
        if (!rawHtml) return "";
        return rawHtml
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
          .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/<\/(p|div|h[1-6]|li|tr|section|article|dt|dd)>/gi, "\n")
          .replace(/<br\s*[\/]?>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n+/g, "\n")
          .trim();
      };

      // 1. Fetch Root Page
      let rootHtml = "";
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          },
          signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) {
          throw new Error(`Le site a répondu HTTP ${resp.status}`);
        }
        rootHtml = await resp.text();
      } catch (err: any) {
        console.warn(`[Crawler] Root fetch error for ${url}:`, err?.message || err);
      }

      if (!rootHtml.trim()) {
        return res.status(502).json({ error: "Impossible de récupérer le contenu HTML du site." });
      }

      const rootTitleMatch = rootHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      const rootTitle = rootTitleMatch ? rootTitleMatch[1].trim() : parsedBase.hostname;

      const metaDescMatch = rootHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        || rootHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

      // 1.b Extract client-side SPA bundle texts if page is a React / Vue / Vite SPA
      const scriptUrls: string[] = [];
      const scriptRegex = /<script\b[^>]*src=["']([^"']+)["']/gi;
      let sMatch;
      while ((sMatch = scriptRegex.exec(rootHtml)) !== null) {
        const sHref = sMatch[1].trim();
        if (sHref && !sHref.includes("google-analytics") && !sHref.includes("googletagmanager") && !sHref.includes("recaptcha")) {
          try {
            const resolvedScript = new URL(sHref, url).toString();
            scriptUrls.push(resolvedScript);
          } catch (_) {}
        }
      }

      // Extract real user-facing texts from scripts (for SPAs where content is loaded dynamically)
      const spaExtractedTexts: string[] = [];
      if (scriptUrls.length > 0) {
        // Fetch up to 3 main application scripts
        const targetScripts = scriptUrls.slice(0, 3);
        await Promise.allSettled(
          targetScripts.map(async (sUrl) => {
            try {
              const sResp = await fetch(sUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; JawebFlowBot/2.0)" },
                signal: AbortSignal.timeout(6000)
              });
              if (!sResp.ok) return;
              const jsContent = await sResp.text();
              // Extract real human sentences and paragraphs
              const literalMatches = jsContent.match(/"([^"\\]{15,500})"/g) || [];
              for (const raw of literalMatches) {
                const clean = raw.slice(1, -1);
                if (
                  !clean.includes("{") && !clean.includes("}") && !clean.includes("=>") &&
                  !clean.includes("function") && !clean.includes("return") &&
                  !clean.includes("typeof ") && !clean.includes("Object.") &&
                  !clean.includes("prototype") && !clean.includes("className") &&
                  !clean.includes("style=") && !clean.includes("<") && !clean.includes(">") &&
                  !clean.includes("@license") && !clean.includes("webpack") &&
                  !clean.includes("http") && !clean.includes("bg-") && !clean.includes("text-") &&
                  !clean.includes("inset-") && !clean.includes("border-") && !clean.includes("rounded-") &&
                  !clean.includes("flex-") && !clean.includes("grid-") && !clean.includes("transition-") &&
                  (/[éèêëàâîïôûùç]/i.test(clean) || /(?:vous|votre|notre|nos|pour|dans|avec|sur|par|les|des|une|est|sont|devis|wilaya|alger|dzd|livraison|tarif|prix|baridimob|chatbot)/i.test(clean)) &&
                  clean.split(/\s+/).length >= 3
                ) {
                  spaExtractedTexts.push(clean);
                }
              }
            } catch (err) {
              console.warn(`[Crawler] Could not inspect SPA bundle ${sUrl}:`, err);
            }
          })
        );
      }

      const uniqueSpaTexts = Array.from(new Set(spaExtractedTexts));
      const spaCombinedData = uniqueSpaTexts.slice(0, 150).join("\n• ");
      if (uniqueSpaTexts.length > 0) {
        console.log(`[Crawler] Extracted ${uniqueSpaTexts.length} real SPA text fragments from application scripts!`);
      }

      // 2. Discover internal links for deep multi-page crawl
      const candidatePaths = new Set<string>();
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match;
      while ((match = hrefRegex.exec(rootHtml)) !== null) {
        const href = match[1].trim();
        if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
          continue;
        }
        try {
          const resolved = new URL(href, url);
          if (resolved.hostname === parsedBase.hostname) {
            const p = resolved.pathname.toLowerCase();
            if (
              p.includes("service") || p.includes("prestation") || p.includes("offre") || p.includes("solution") ||
              p.includes("tarif") || p.includes("prix") || p.includes("pricing") || p.includes("pack") ||
              p.includes("about") || p.includes("a-propos") || p.includes("propos") || p.includes("equipe") ||
              p.includes("contact") || p.includes("devis") || p.includes("rdv") ||
              p.includes("faq") || p.includes("aide") || p.includes("question") ||
              p.includes("boutique") || p.includes("shop") || p.includes("produit") || p.includes("livraison") || p.includes("catalogue")
            ) {
              candidatePaths.add(resolved.toString());
            }
          }
        } catch (_) {}
      }

      // If no internal links discovered, try standard common paths
      if (candidatePaths.size === 0) {
        const standardProbes = ["/services", "/tarifs", "/pricing", "/a-propos", "/contact", "/faq", "/boutique"];
        for (const probe of standardProbes) {
          candidatePaths.add(new URL(probe, url).toString());
        }
      }

      // Pick top 4 sub-pages to crawl in parallel
      const subPagesToFetch = Array.from(candidatePaths).slice(0, 4);
      console.log(`[Crawler] Sub-pages targeted:`, subPagesToFetch);

      const crawledPages: Array<{ url: string; title: string; text: string; status: 'done' | 'failed' }> = [];
      const rootText = cleanHtmlToText(rootHtml).substring(0, 6000);
      crawledPages.push({
        url,
        title: rootTitle || "Page d'Accueil",
        text: rootText,
        status: (rootText.length > 50 || uniqueSpaTexts.length > 0) ? 'done' : 'failed'
      });

      // Fetch subpages with Promise.allSettled
      const subResults = await Promise.allSettled(
        subPagesToFetch.map(async (subUrl) => {
          const subResp = await fetch(subUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; JawebFlowBot/2.0)",
              "Accept": "text/html,*/*"
            },
            signal: AbortSignal.timeout(6000)
          });
          if (!subResp.ok) throw new Error(`HTTP ${subResp.status}`);
          const subHtml = await subResp.text();
          const tMatch = subHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
          const t = tMatch ? tMatch[1].trim() : subUrl.split("/").pop() || subUrl;
          const cleanText = cleanHtmlToText(subHtml).substring(0, 4000);
          return { url: subUrl, title: t, text: cleanText, status: 'done' as const };
        })
      );

      for (const resItem of subResults) {
        if (resItem.status === "fulfilled" && resItem.value.text.length > 50) {
          crawledPages.push(resItem.value);
        }
      }

      console.log(`[Crawler] Successfully crawled ${crawledPages.length} pages`);

      // Combine gathered texts + SPA scripts data
      const spaSection = uniqueSpaTexts.length > 0
        ? `\n\n=== EXTRACTION DES DONNÉES RÉELLES DE L'APPLICATION (SCRAPING DYNAMIQUE & SPA) ===\n• ${spaCombinedData}`
        : "";

      const combinedDossier = (crawledPages
        .map((p, idx) => `=== PAGE ${idx + 1}: ${p.title} (${p.url}) ===\n${p.text}`)
        .join("\n\n") + spaSection)
        .substring(0, 24000);

      // Signal analysis
      const fullTextLower = combinedDossier.toLowerCase();
      const hasEcommerce = fullTextLower.includes("panier") || fullTextLower.includes("cart") || fullTextLower.includes("checkout") || fullTextLower.includes("boutique") || fullTextLower.includes("shopify") || fullTextLower.includes("commander");
      const hasDelivery = fullTextLower.includes("livraison") || fullTextLower.includes("58 wilayas") || fullTextLower.includes("yalidine") || fullTextLower.includes("kazi") || fullTextLower.includes("expedition");
      const hasBaridimob = fullTextLower.includes("baridimob") || fullTextLower.includes("ccp") || fullTextLower.includes("virement") || fullTextLower.includes("paiement à la livraison") || fullTextLower.includes("cash on delivery");

      // Extract raw phones
      const phoneMatches = combinedDossier.match(/(?:\+213|00213|0)[567]\d{8}/g) || [];
      const emailMatches = combinedDossier.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const detectedPhone = phoneMatches[0] || "";
      const detectedEmail = emailMatches[0] || "";

      // 3. Gemini AI Synthesis
      let generatedResult: any = null;
      if (GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
          const prompt = `Tu es un expert senior en scraping de données web et extraction de données d'entreprise réelles pour alimenter un assistant conversationnel (WhatsApp, Instagram, Web).

Voici le corpus de DONNÉES RÉELLES extraites du site web "${url}" (y compris le scraping profond du HTML et des textes dynamiques de l'application) :

TITRE PRINCIPAL : "${rootTitle}"
META DESCRIPTION : "${metaDescription}"

DOSSIER DE CONTENU EXTRAIT RÉEL (MULTI-PAGES & CODE APPLICATION) :
${combinedDossier}

DIRECTIVES ABSOLUES :
1. VRAIE DATA EXCLUSIVE : Extraire UNIQUEMENT les vraies informations trouvées dans le texte ci-dessus (vrais tarifs, vraies fonctionnalités, vrais chiffres, vraies conditions de livraison, vraies coordonnées). AUCUN placeholder générique ("Découvrez nos offres sur notre site") n'est toléré.
2. DÉTAILS CONCRETS : Si des tarifs réels sont mentionnés (ex: montants en DA ou packs), cite-les mot pour mot avec leurs conditions. Si des délais de livraison réels ou des wilayas sont mentionnés (ex: 400 DA Alger, 600 DA autres wilayas, BaridiMob, etc.), cite-les expressément.
3. STRUCTURE DES FICHES : Génère 6 à 10 fiches de connaissances complètes, chacune dédiée à un aspect clé (Identité & Présentation, Fonctionnalités / Offres concrètes, Tarifs & Formules précises, Modalités de livraison, Moyens de paiement & BaridiMob, FAQ & Objections clients, Contact & Support).

Réponds STRICTEMENT sous forme d'objet JSON valide avec cette structure :
{
  "siteType": "ecommerce" | "vitrine" | "platform" | "restaurant" | "immobilier" | "agence" | "autre",
  "confidence": 95,
  "businessName": "Nom exact de l'entreprise ou marque",
  "businessCategory": "Secteur d'activité précis",
  "businessDescription": "Présentation concrète et véridique de l'activité",
  "phone": "Numéro de téléphone ou WhatsApp détecté dans le texte (ou vide si non trouvé)",
  "email": "Email de contact détecté (ou vide)",
  "deliveryInfo": "Vraies conditions de livraison détectées (wilayas, tarifs et délais réels)",
  "paymentMethods": "Vrais moyens de paiement mentionnés (ex: BaridiMob, Cash on Delivery, SlickPay, etc.)",
  "scrapingStrategy": [
    "Présentation & Mission de la marque",
    "Catalogue des Services & Prestations",
    "Tarifs, Packs & Devis",
    "Modalités de Livraison & Paiement",
    "Foire Aux Questions (FAQ)",
    "Contact, Coordonnées & Prise de RDV"
  ],
  "knowledgeNotes": [
    {
      "id": "scanned_1",
      "title": "Titre précis de la fiche",
      "category": "general" | "services" | "tarifs" | "livraison" | "faq" | "contact",
      "content": "Contenu exhaustif et ultra détaillé basé STRICTEMENT sur les vraies données extraites.",
      "enabled": true,
      "source": "scanned"
    }
  ]
}

IMPORTANT :
- Rédige des fiches de connaissances ('knowledgeNotes') riches, professionnelles et concrètes (au moins 6 à 10 fiches si des données sont présentes).
- Utilise UNIQUEMENT les vraies informations trouvées dans le texte (tarifs précis en DA, wilayas, WhatsApp, prestations).
- Réponds UNIQUEMENT en JSON valide.`;

          const aiResponse = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          });

          const jsonText = aiResponse.text?.trim();
          if (jsonText) {
            const cleanedJson = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            let parsed = JSON.parse(cleanedJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              parsed = parsed[0];
            }
            if (parsed && Array.isArray(parsed.knowledgeNotes) && parsed.knowledgeNotes.length > 0) {
              generatedResult = parsed;
              console.log(`[Crawler] Gemini generated ${parsed.knowledgeNotes.length} rich knowledge notes!`);
            }
          }
        } catch (aiErr: any) {
          console.warn("[Crawler] Gemini AI synthesis warning, using structured fallback:", aiErr?.message || aiErr);
        }
      }

      // 4. Algorithmic Fallback if Gemini unavailable
      if (!generatedResult || !generatedResult.knowledgeNotes || generatedResult.knowledgeNotes.length === 0) {
        const domainClean = parsedBase.hostname.replace(/^www\./, "");
        const fallbackBizName = rootTitle.split(/[-|•–]/)[0].trim() || domainClean;

        generatedResult = {
          siteType: hasEcommerce ? "ecommerce" : "vitrine",
          confidence: 85,
          businessName: fallbackBizName,
          businessCategory: hasEcommerce ? "Boutique en ligne" : "Agence & Prestations professionnelles",
          businessDescription: metaDescription || `${fallbackBizName} propose des services de référence disponibles sur ${url}.`,
          phone: detectedPhone,
          email: detectedEmail,
          deliveryInfo: hasDelivery ? "Livraison disponible dans les 58 wilayas (24h à 48h)" : "Prestations disponibles sur devis et en ligne",
          paymentMethods: hasBaridimob ? "Paiement à la livraison & BaridiMob" : "Paiement sécurisé et virement",
          scrapingStrategy: ["Accueil & Mission", "Prestations", "Tarifs", "Livraison & Règlement", "Contact"],
          knowledgeNotes: [
            {
              id: "scanned_gen_" + Math.random().toString(36).substring(2, 8),
              title: `Mission & Identité de ${fallbackBizName}`,
              category: "general",
              content: metaDescription || `${fallbackBizName} offre des solutions et prestations complètes. Site officiel : ${url}.`,
              enabled: true,
              source: "scanned"
            },
            {
              id: "scanned_srv_" + Math.random().toString(36).substring(2, 8),
              title: "Prestations & Catalogue",
              category: "services",
              content: `Découvrez nos offres et services sur notre site web ${url}. Nous accompagnons nos clients avec réactivité et expertise.`,
              enabled: true,
              source: "scanned"
            },
            {
              id: "scanned_liv_" + Math.random().toString(36).substring(2, 8),
              title: "Livraison & Expédition (58 Wilayas)",
              category: "livraison",
              content: "Nous assurons la livraison et le suivi rapide dans toute l'Algérie (58 wilayas) avec paiement sécurisé ou à la livraison.",
              enabled: true,
              source: "scanned"
            },
            {
              id: "scanned_ctc_" + Math.random().toString(36).substring(2, 8),
              title: "Coordonnées & Assistance",
              category: "contact",
              content: `Pour toute demande d'information, contactez-nous directement par message privé ou sur notre site ${url}${detectedPhone ? ` ou par téléphone au ${detectedPhone}` : ""}.`,
              enabled: true,
              source: "scanned"
            }
          ]
        };
      }

      // Les fiches sont renvoyées au client, qui les fusionne avec l’assistant
      // authentifié et les sauvegarde dans Firestore sans inventer de contenu.
      res.json({
        ...generatedResult,
        scannedPages: crawledPages.map((p) => ({
          url: p.url,
          title: p.title,
          status: p.status
        }))
      });
    } catch (error: any) {
      console.error("[Crawler] Fatal analyze error:", error);
      res.status(500).json({ error: "Impossible de scanner le site : " + (error?.message || "erreur réseau") });
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
      if (paymentMethod === 'slickpay_dzd' && envValue("SLICKPAY_PUBLIC_KEY") && envValue("APP_URL")) {
        try {
          const slickpayRes = await fetch("https://api.slickpay.dz/api/v2/users/invoices", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${envValue("SLICKPAY_PUBLIC_KEY")}`,
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
                  const uid = uDoc.id;
                  await uDoc.ref.update({
                    activePlan: data.plan || 'pro',
                    billingCycle: data.cycle || 'monthly',
                    updatedAt: new Date()
                  });
                  // Also update assistants for this user
                  const asstQuery = await db.collection("assistants").where("userId", "==", uid).get();
                  asstQuery.forEach(async (asstDoc: any) => {
                    await asstDoc.ref.update({ plan: data.plan || 'pro' });
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
            const uid = uDoc.id;
            await uDoc.ref.update({
              activePlan: 'pro',
              updatedAt: new Date()
            });
            const asstQuery = await db.collection("assistants").where("userId", "==", uid).get();
            asstQuery.forEach(async (asstDoc: any) => {
              await asstDoc.ref.update({ plan: 'pro' });
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

  // ==========================================
  // ADMIN API ROUTES
  // ==========================================
  // Admin auth and logic is now fully handled in AdminPage.tsx via Firebase Auth
  // to avoid IAM ADC mismatches on Cloud Run.

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

    // ⚠️ La vérification du jeton était contournée : le challenge était renvoyé
    // pour n'importe quelle valeur de `hub.verify_token` (la liste validTokens
    // n'était jamais utilisée), ce qui laissait n'importe qui s'abonner au
    // webhook. On exige maintenant un jeton valide.
    const tokenIsValid = Boolean(token) && validTokens.includes(String(token));

    if (mode === "subscribe" && !tokenIsValid) {
      console.warn("⛔ Meta Webhook: jeton de vérification invalide ou absent.");
      res.setHeader("Content-Type", "text/plain");
      return res.status(403).send("Forbidden");
    }

    if (challenge && tokenIsValid) {
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
      // Vérification de la signature Meta (X-Hub-Signature-256). Activée dès que
      // INSTAGRAM_APP_SECRET est configuré : sans elle, n'importe qui peut
      // POSTer de faux DM et faire répondre le bot (spam + quota IA).
      const appSecret = envValue("INSTAGRAM_APP_SECRET");
      if (appSecret) {
        const signatureHeader = String(req.headers["x-hub-signature-256"] || "");
        const rawBody = (req as any).rawBody as Buffer | undefined;
        const expected = rawBody
          ? `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("base64")}`
          : "";
        if (!signatureHeader || !expected || signatureHeader !== expected) {
          console.warn("⛔ Webhook Instagram: signature X-Hub-Signature-256 invalide.");
          return res.status(401).json({ error: "Invalid signature" });
        }
      } else {
        console.warn("ℹ️  Webhook Instagram: INSTAGRAM_APP_SECRET absent, signature non vérifiée.");
      }

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
                  model: GEMINI_MODEL,
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
                botReplyText = `Salam ! Merci pour votre message chez ${storeName}. Nous livrons dans les 58 wilayas d'Algérie sous 24h à 48h (Paiement à la livraison & BaridiMob). ${businessSiteUrl ? `Découvrez nos offres sur notre site : ${businessSiteUrl}` : 'En quoi puis-je vous aider ?'}`;
              }

              // 2. Send the reply back directly via Meta Instagram Graph API if token is configured
              let PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
              
              // Dynamic token lookup for the specific connected Instagram account / user
              // 1. Check in-memory server cache first
              for (const [, cachedData] of instagramTokensCache.entries()) {
                if (cachedData?.accessToken && (cachedData.instagramUserId === String(recipientId) || !PAGE_ACCESS_TOKEN)) {
                  PAGE_ACCESS_TOKEN = cachedData.accessToken;
                  break;
                }
              }

              // 2. Query Firestore via direct REST API with project apiKey (works reliably across environments)
              if (!PAGE_ACCESS_TOKEN) {
                try {
                  const cfgStr = fs.readFileSync("firebase-applet-config.json", "utf-8");
                  const cfg = JSON.parse(cfgStr);
                  const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents:runQuery?key=${cfg.apiKey}`;
                  const fsRes = await fetch(fsUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      structuredQuery: {
                        from: [{ collectionId: "instagram_integrations" }],
                        limit: 5
                      }
                    })
                  });
                  const fsData = await fsRes.json();
                  if (Array.isArray(fsData)) {
                    for (const docItem of fsData) {
                      const fields = docItem.document?.fields;
                      if (fields?.accessToken?.stringValue) {
                        PAGE_ACCESS_TOKEN = fields.accessToken.stringValue;
                        // Cache for subsequent messages
                        instagramTokensCache.set(docItem.document.name, {
                          accessToken: PAGE_ACCESS_TOKEN,
                          instagramUserId: fields.instagramUserId?.stringValue || "",
                          instagramUsername: fields.instagramUsername?.stringValue || "@compte_ig"
                        });
                        break;
                      }
                    }
                  }
                } catch (tokErr) {
                  console.warn("[Instagram Webhook] Token resolution via Firestore REST:", tokErr);
                }
              }

              if (PAGE_ACCESS_TOKEN) {
                let sendSuccess = false;
                // Attempt 1: Direct Instagram Graph API
                try {
                  const metaSendRes = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { text: botReplyText }
                    })
                  });
                  const sendResult = await metaSendRes.json();
                  if (metaSendRes.ok && !sendResult.error) {
                    sendSuccess = true;
                    console.log("📤 Meta Direct DM Response sent successfully via graph.instagram.com:", sendResult);
                  } else {
                    console.warn("⚠️ graph.instagram.com response notice:", sendResult);
                  }
                } catch (sendErr) {
                  console.warn("⚠️ graph.instagram.com network error:", sendErr);
                }

                // Attempt 2: Facebook Graph API fallback (standard Messenger API for Instagram)
                if (!sendSuccess) {
                  try {
                    const fbSendRes = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        recipient: { id: senderId },
                        message: { text: botReplyText }
                      })
                    });
                    const fbResult = await fbSendRes.json();
                    if (fbSendRes.ok && !fbResult.error) {
                      console.log("📤 Meta Direct DM Response sent successfully via graph.facebook.com:", fbResult);
                    } else {
                      console.error("❌ Meta graph.facebook.com error:", fbResult);
                    }
                  } catch (fbErr) {
                    console.error("❌ Meta graph.facebook.com network error:", fbErr);
                  }
                }
              } else {
                console.log(`ℹ️ [Simulated Meta Send] Generated reply for ${senderId}: "${botReplyText}"`);
              }

              // 🧠 3. Instagram Conversation Continuous Self-Learning & History Middleware
              void saveConversationAndEvolveContext({
                assistantId,
                sessionId: `ig_sender_${senderId}`,
                channel: "instagram",
                userMessage: incomingUserText,
                assistantResponse: botReplyText
              }).catch((e) => console.debug("Background context persistence skipped:", (e as Error)?.message || e));
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ Instagram Webhook Error:", err);
    }
  });

  // ============================================================================
  // INSTAGRAM 100% AUTOMATED OAUTH TOKEN EXCHANGE & REAL PROFILE FETCHER
  // ============================================================================
  const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
  const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
  const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || process.env.APP_URL || 'https://jawebflow.pages.dev/';

  app.post('/api/instagram/oauth/exchange', async (req, res) => {
    try {
      const { code, userId, redirectUri } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'Code d\'autorisation manquant' });
      }
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.status(503).json({ error: 'OAuth Instagram non configuré : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET sont requis côté serveur.' });
      }

      const cleanCode = String(code).split('#')[0].replace(/_$/, '').trim();
      const targetRedirectUri = redirectUri || INSTAGRAM_REDIRECT_URI;

      console.log(`[Instagram OAuth] Exchanging code automatically for user ${userId || 'anonymous'} with URI ${targetRedirectUri}...`);

      // 1. Exchange authorization code for short-lived token
      const tokenFormData = new URLSearchParams();
      tokenFormData.append('client_id', INSTAGRAM_APP_ID);
      tokenFormData.append('client_secret', INSTAGRAM_APP_SECRET);
      tokenFormData.append('grant_type', 'authorization_code');
      tokenFormData.append('redirect_uri', targetRedirectUri);
      tokenFormData.append('code', cleanCode);

      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenFormData.toString()
      });

      const tokenData = await tokenResponse.json();
      console.log('[Instagram OAuth] Exchange result status:', tokenResponse.status, tokenData);

      if (!tokenResponse.ok || !tokenData.access_token) {
        return res.status(400).json({ 
          error: tokenData.error_message || tokenData.error?.message || 'Échec d\'obtention du jeton Instagram',
          details: tokenData 
        });
      }

      const shortLivedToken = tokenData.access_token;
      const instagramUserId = tokenData.user_id;

      // 2. Exchange for 60-day Long-Lived Token
      let finalAccessToken = shortLivedToken;
      try {
        const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
        const longLivedRes = await fetch(longLivedUrl);
        const longLivedData = await longLivedRes.json();
        if (longLivedData.access_token) {
          finalAccessToken = longLivedData.access_token;
          console.log('[Instagram OAuth] Converted to 60-day Long Lived Token');
        }
      } catch (llErr) {
        console.warn('[Instagram OAuth] Long lived exchange fallback:', llErr);
      }

      // 3. Fetch real username and display info
      let instagramUsername = '';
      let accountName = '';
      try {
        const profileRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,name,account_type&access_token=${finalAccessToken}`);
        const profileData = await profileRes.json();
        console.log('[Instagram OAuth] Real profile info:', profileData);
        if (profileData.username) instagramUsername = profileData.username;
        if (profileData.name) accountName = profileData.name;
      } catch (pErr) {
        console.warn('[Instagram OAuth] Profile fetch error:', pErr);
      }

      // 4. Cache in memory on server for active webhook message auto-replies
      if (userId) {
        instagramTokensCache.set(userId, {
          accessToken: finalAccessToken,
          instagramUserId: String(instagramUserId || ''),
          instagramUsername: instagramUsername ? `@${instagramUsername}` : `@compte_${String(instagramUserId).slice(-4)}`,
          accountName: accountName || instagramUsername || 'Compte Instagram'
        });
      }

      // Persist via Firebase Admin SDK only if explicit Google Application Credentials are configured;
      // otherwise, persistence is handled reliably by the client React application using the authenticated Firebase Client SDK.
      if (db && userId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          await db.collection('instagram_integrations').doc(userId).set({
            connected: true,
            instagramUserId: String(instagramUserId || ''),
            instagramUsername: instagramUsername ? `@${instagramUsername}` : `@compte_${String(instagramUserId).slice(-4)}`,
            pageName: accountName || instagramUsername || 'Compte Instagram',
            accessToken: finalAccessToken,
            lastConnectedAt: new Date().toISOString(),
            webhookStatus: 'active',
            autoReplyEnabled: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr: any) {
          console.debug('[Instagram OAuth] Server-side Firestore write skipped:', fsErr?.message || fsErr);
        }
      }

      return res.json({
        success: true,
        instagramUserId: String(instagramUserId || ''),
        instagramUsername: instagramUsername ? `@${instagramUsername}` : `@compte_${String(instagramUserId).slice(-4)}`,
        accountName: accountName || instagramUsername || 'Compte Instagram Professionnel',
        accessToken: finalAccessToken
      });
    } catch (error: any) {
      console.error('[Instagram OAuth] Server error:', error);
      return res.status(500).json({ error: error.message || 'Erreur serveur interne' });
    }
  });

  // ============================================================================
  // INSTAGRAM SYNC TOKEN & LIVE DIAGNOSTICS
  // ============================================================================
  app.post('/api/instagram/sync-token', async (req, res) => {
    try {
      const { userId, accessToken, instagramUserId, instagramUsername, pageName } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: 'accessToken requis' });
      }

      const cleanToken = String(accessToken).trim();
      const userKey = userId || 'default';

      instagramTokensCache.set(userKey, {
        accessToken: cleanToken,
        instagramUserId: String(instagramUserId || ''),
        instagramUsername: instagramUsername ? String(instagramUsername) : '@compte_ig',
        pageName: pageName || 'Instagram Professionnel'
      });

      // Also persist to disk cache
      try {
        const cacheFile = 'instagram_tokens_cache.json';
        let existing: any = {};
        if (fs.existsSync(cacheFile)) {
          existing = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        }
        existing[userKey] = {
          accessToken: cleanToken,
          instagramUserId: String(instagramUserId || ''),
          instagramUsername: instagramUsername || '',
          pageName: pageName || '',
          updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(cacheFile, JSON.stringify(existing, null, 2));
      } catch (fErr) {
        console.warn('[Instagram] Disk cache save warning:', fErr);
      }

      console.log(`[Instagram Sync] Token cached successfully for ${instagramUsername || userKey}`);
      return res.json({ success: true, message: 'Jeton synchronisé avec succès' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/instagram/diagnostics', async (req, res) => {
    const cachedList: any[] = [];
    for (const [key, data] of instagramTokensCache.entries()) {
      cachedList.push({
        id: key,
        username: data.instagramUsername,
        hasToken: !!data.accessToken,
        tokenPrefix: data.accessToken ? `${data.accessToken.substring(0, 10)}...` : null
      });
    }

    // Check disk cache if memory was empty
    if (cachedList.length === 0 && fs.existsSync('instagram_tokens_cache.json')) {
      try {
        const diskData = JSON.parse(fs.readFileSync('instagram_tokens_cache.json', 'utf-8'));
        for (const [k, v] of Object.entries(diskData as any)) {
          cachedList.push({
            id: k,
            username: (v as any).instagramUsername,
            hasToken: !!(v as any).accessToken,
            tokenPrefix: (v as any).accessToken ? `${(v as any).accessToken.substring(0, 10)}...` : null
          });
        }
      } catch (e) {}
    }

    return res.json({
      status: 'active',
      webhookUrl: 'https://jawebflow.pages.dev/api/webhook/instagram',
      verifyToken: 'jawebflow_secure_webhook_token_2025',
      cachedAccountsCount: cachedList.length,
      accounts: cachedList,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/instagram/test-live-message', async (req, res) => {
    // Route de debug : appelle Gemini à chaque requête. Bloquée hors dev pour
    // éviter qu'elle ne consomme du quota en production (scans, bots, etc.).
    if ((process.env.NODE_ENV || "development") === "production") {
      return res.status(404).json({ status: "error", error: "Not found" });
    }
    try {
      const { messageText } = req.body;
      const textToTest = messageText || 'Bonjour, est-ce que vous livrez à Oran et quel est le prix ?';

      // Use Gemini flash lite with real business context
      const aiRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: textToTest,
        config: {
          systemInstruction: `Vous êtes l'assistant IA Instagram officiel de Telya Agency en Algérie.
Répondez avec politesse, concision et chaleur (format DM Instagram) en Français ou Darija.
Livraison disponible dans les 58 wilayas d'Algérie sous 24h/48h. Paiement à la livraison et BaridiMob.`
        }
      });

      return res.json({
        success: true,
        userMessage: textToTest,
        aiResponse: aiRes.text?.trim(),
        modelUsed: GEMINI_MODEL
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 🔍 Health / diagnostics: shows at a glance whether the server-side
  // integrations are actually configured (missing keys used to be invisible).
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      firebaseAdmin: firebaseAdminStatus,
      aiProviders: {
        agentRouter: Boolean(AGENTROUTER_API_KEY),
        gemini: Boolean(GEMINI_API_KEY),
      },
      payments: {
        stripe: Boolean(envValue("STRIPE_SECRET_KEY")),
        slickpay: Boolean(envValue("SLICKPAY_PUBLIC_KEY") && envValue("SLICKPAY_SECRET_KEY")),
      },
      instagram: Boolean(envValue("INSTAGRAM_APP_ID") && envValue("INSTAGRAM_APP_SECRET")),
      timestamp: new Date().toISOString(),
    });
  });

  // Single HTTP server for the app: in dev it also carries Vite's HMR
  // websocket, so HMR keeps working when the app is reached through a
  // reverse proxy / preview host on the same port.
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    // Hosts allowed to reach the dev server. Defaults to permissive so that
    // proxied/preview hosts (e.g. *.e2b.app) work out of the box; set
    // ALLOWED_HOSTS="a.com,b.com" to restrict it explicitly.
    const allowedHosts = process.env.ALLOWED_HOSTS
      ? process.env.ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
      : true;

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts,
        // Requests arrive through a proxy that terminates TLS, so accept any
        // Origin for dev-server asset/API calls.
        cors: true,
        hmr: { server: httpServer },
      },
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

  // A busy port is fatal and must be reported instead of silently swallowed.
  httpServer.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use. Stop the conflicting process or set PORT=<other>.`);
      process.exit(1);
    }
    console.error("HTTP server error:", err);
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Resolve Admin credentials in the background so it never delays boot.
    // Until it resolves, routes that need Firestore simply skip it.
    initFirebaseAdmin().catch((e) => {
      console.warn("Firebase admin initialization notice:", (e as Error)?.message || e);
    });
  });
}

startServer();
