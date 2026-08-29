import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

  // Proxy Gemini API
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { assistantId, message } = req.body;
      
      let plan = 'basic';
      let usage = 0;

      if (db && assistantId) {
        try {
          const assistantDoc = await db.collection("assistants").doc(assistantId).get();
          if (assistantDoc && assistantDoc.exists) {
            const assistantData = assistantDoc.data();
            plan = assistantData?.plan || 'basic';
          }
          const usageDoc = await db.collection("usage").doc(assistantId).get();
          if (usageDoc && usageDoc.exists) {
            usage = usageDoc.data()?.count || 0;
          }
        } catch (dbErr) {
          console.warn("Firestore lookup bypassed for chat request:", (dbErr as Error)?.message || dbErr);
        }
      }

      const limits: Record<string, number> = {
        'basic': 1000,
        'pro': 5000,
        'enterprise': 999999
      };
      const limit = limits[plan] || 1000;

      if (usage >= limit) {
        return res.status(403).json({ error: "Quota dépassé. Veuillez mettre à jour votre abonnement." });
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: message || "Bonjour",
        config: { systemInstruction: "Vous êtes un assistant virtuel serviable pour " + (assistantId || "JawebFlow") }
      });
      
      if (db && assistantId) {
        try {
          await db.collection("usage").doc(assistantId).set({ count: usage + 1 }, { merge: true });
        } catch (e) {
          // ignore usage increment error
        }
      }

      res.json({ text: response.text || "Désolé, je n'ai pas pu générer de réponse." });
    } catch (error) {
      console.error("Gemini proxy error:", error);
      res.status(500).json({ error: "Failed to generate response" });
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
