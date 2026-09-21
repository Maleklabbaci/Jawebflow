/**
 * JAWEBFLOW — Import universel : texte, PDF, JSON, n'importe quoi.
 */

import {
  adminGetDocument,
  adminPatchDocument,
  verifyFirebaseIdToken,
  parseFields,
} from "../../_shared/google.ts";

const FALLBACK_MODELS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b-latest",
  "gemini-1.5-pro-latest",
];
const GEMINI_TIMEOUT_MS = 25000;

type KnowledgeNote = {
  id?: string;
  title?: string;
  category?: string;
  content?: string;
  enabled?: boolean;
  source?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

const ALLOWED_CATEGORIES = [
  "services", "tarifs", "livraison", "garanties", "contact", "faq", "general",
];

async function synthesizeWithGemini(
  content: string,
  siteUrl: string,
  apiKey: string,
  preferredModel?: string
) {
  const prompt = `Tu es un expert en extraction de données commerciales pour alimenter un chatbot d'entreprise.

Site : ${siteUrl}

Le contenu ci-dessous provient directement de l'utilisateur (texte collé, PDF, catalogue, description, données extraites de son site, etc.).

RETOURNE UNIQUEMENT un JSON valide sans markdown :
{
  "businessName": "nom exact",
  "businessCategory": "secteur précis",
  "businessDescription": "description 3-5 phrases",
  "phone": "numéro principal",
  "email": "email principal",
  "whatsapp": "lien wa.me complet",
  "address": "adresse complète",
  "contactLinks": ["lien1", "lien2"],
  "deliveryInfo": "délais, zones, prix",
  "paymentMethods": "modes de paiement",
  "openingHours": "horaires",
  "socialMedia": "réseaux avec URLs",
  "siteType": "vitrine|ecommerce|service|restaurant|portfolio",
  "confidence": 90,
  "knowledgeNotes": [
    {
      "title": "titre précis",
      "category": "services|tarifs|livraison|garanties|contact|faq|general",
      "content": "contenu détaillé 3-6 phrases"
    }
  ]
}

RÈGLES :
- Utilise UNIQUEMENT les infos présentes dans le contenu
- Ne jamais inventer — champ vide si absent
- knowledgeNotes : 5-15 fiches couvrant TOUT ce qui est trouvé
- Crée une fiche par thème trouvé (services, prix, livraison, contact, FAQ, etc.)
- Si tu trouves des produits avec prix → fiche tarifs détaillée
- Si tu trouves des contacts → fiche contact avec tous les liens
- confidence élevé car données fournies directement par l'utilisateur

CONTENU FOURNI :
${content.slice(0, 30000)}`;

  const models = Array.from(
    new Set([preferredModel, ...FALLBACK_MODELS].filter(Boolean))
  ) as string[];

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 4096,
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (res.status === 429) { console.warn(`[extract] ${model}: quota`); continue; }
      if (!res.ok) { console.warn(`[extract] ${model}: HTTP ${res.status}`); continue; }

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { console.warn(`[extract] ${model}: vide`); continue; }

      const parsed = JSON.parse(
        text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()
      );
      console.log(`[extract] ✅ Gemini OK: ${model}`);
      return parsed;
    } catch (e: any) {
      clearTimeout(timer);
      console.warn(`[extract] ${model}:`, e?.message);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

function mergeKnowledgeNotes(existing: KnowledgeNote[], scanned: KnowledgeNote[]): KnowledgeNote[] {
  const manual = existing.filter(n => n?.source !== "extracted");
  const seen = new Set<string>();
  const newNotes: KnowledgeNote[] = [];

  for (const note of scanned) {
    const cat = ALLOWED_CATEGORIES.includes((note.category || "").toLowerCase())
      ? note.category!.toLowerCase() : "general";
    if (seen.has(cat)) continue;
    seen.add(cat);
    newNotes.push({
      id: `extracted_${cat}_${Date.now()}`,
      title: note.title || "Information",
      category: cat,
      content: (note.content || "").trim(),
      enabled: true,
      source: "extracted",
    });
  }
  return [...manual, ...newNotes];
}

function fillIfEmpty(existing: any, newVal: any): any {
  return (existing === undefined || existing === null || String(existing).trim() === "")
    ? (newVal ?? "") : existing;
}

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const contentType = context.request.headers.get("Content-Type") || "";

    let rawText = "";
    let siteUrl = "https://monsite.com";
    let assistantId = "";
    let mode = "merge";
    let pages: any[] = [];

    // ── Multipart (PDF, fichiers) ──────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      siteUrl = (formData.get("siteUrl") as string) || siteUrl;
      assistantId = (formData.get("assistantId") as string) || "";
      mode = (formData.get("mode") as string) || "merge";
      rawText = (formData.get("rawText") as string) || "";

      // Fichiers uploadés
      const files = formData.getAll("files");
      for (const file of files) {
        if (file instanceof File) {
          const fileType = file.type;
          const fileName = file.name;

          if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
            // PDF → extrait le texte brut (Gemini peut lire les PDFs via base64)
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            rawText += `\n\n[FICHIER PDF: ${fileName}]\n`;

            // Utilise Gemini pour lire le PDF directement
            const pdfContent = await extractPdfWithGemini(base64, fileName, context.env.GEMINI_API_KEY);
            rawText += pdfContent;

          } else if (
            fileType.includes("text") ||
            fileName.endsWith(".txt") ||
            fileName.endsWith(".csv") ||
            fileName.endsWith(".md")
          ) {
            const text = await file.text();
            rawText += `\n\n[FICHIER: ${fileName}]\n${text}`;

          } else if (fileName.endsWith(".json")) {
            const text = await file.text();
            try {
              const parsed = JSON.parse(text);
              pages = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              rawText += `\n\n[FICHIER JSON: ${fileName}]\n${text}`;
            }
          } else {
            // Autre fichier → essaie de lire comme texte
            try {
              const text = await file.text();
              rawText += `\n\n[FICHIER: ${fileName}]\n${text.slice(0, 5000)}`;
            } catch {}
          }
        }
      }

    // ── JSON normal ───────────────────────────────────────────────────────
    } else {
      const body = (await context.request.json().catch(() => ({}))) as {
        rawText?: string;
        pages?: any[];
        siteUrl?: string;
        assistantId?: string;
        mode?: string;
      };
      rawText = body.rawText || "";
      pages = body.pages || [];
      siteUrl = body.siteUrl || siteUrl;
      assistantId = body.assistantId || "";
      mode = body.mode || "merge";
    }

    // Validation
    if (!rawText.trim() && pages.length === 0) {
      return json({ error: "Aucune donnée reçue." }, 400);
    }

    // Auth
    const authHeader = context.request.headers.get("Authorization");
    const caller = await verifyFirebaseIdToken(context.env, authHeader);
    if (!caller) return json({ error: "Authentification requise." }, 401);

    // Assistant
    let existingFields: Record<string, any> | null = null;
    if (assistantId) {
      const doc = await adminGetDocument(context.env, `assistants/${assistantId}`);
      if (doc.ok && doc.fields) {
        const parsed = parseFields(doc.fields);
        if (parsed.userId && parsed.userId !== caller.uid) {
          return json({ error: "Accès refusé." }, 403);
        }
        existingFields = parsed;
      }
    }

    // Prépare le contenu
    let content = rawText.trim();

    if (pages.length > 0) {
      for (const page of pages) {
        if (!page) continue;
        content += `\n\n=== PAGE: ${page.url || "URL"} ===\n`;
        content += `Type: ${page.type || "général"}\n`;
        if (page.title) content += `Titre: ${page.title}\n`;
        if (page.price) content += `Prix: ${page.price}\n`;
        if (page.description) content += `Description: ${page.description}\n`;
        if (page.phones?.length) content += `Téléphones: ${page.phones.join(", ")}\n`;
        if (page.emails?.length) content += `Emails: ${page.emails.join(", ")}\n`;
        if (page.whatsapp) content += `WhatsApp: ${page.whatsapp}\n`;
        if (page.links?.length) content += `Liens: ${page.links.join(", ")}\n`;
        if (page.rawText) content += `Contenu: ${page.rawText.slice(0, 3000)}\n`;
        if (page.products?.length) {
          content += `Produits:\n`;
          page.products.forEach((p: any) => {
            content += `• ${p.title} — ${p.price || ""} — ${p.link || ""}\n`;
          });
        }
      }
    }

    if (content.length < 5) {
      return json({ error: "Contenu insuffisant." }, 400);
    }

    if (!context.env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY manquante." }, 500);
    }

    // Synthèse Gemini
    let result: any;
    try {
      result = await synthesizeWithGemini(
        content, siteUrl, context.env.GEMINI_API_KEY, context.env.GEMINI_MODEL
      );
    } catch (e: any) {
      console.error("[extract] Gemini échoué:", e?.message);
      return json({ error: "Analyse IA échouée. Réessayez." }, 500);
    }

    // Sauvegarde
    let saved = false;
    let savedNoteCount = 0;

    if (assistantId) {
      const existing: KnowledgeNote[] = Array.isArray(existingFields?.knowledgeNotes)
        ? existingFields!.knowledgeNotes : [];
      const base = mode === "replace"
        ? existing.filter(n => n?.source !== "extracted")
        : existing;
      const merged = mergeKnowledgeNotes(base, result.knowledgeNotes || []);

      const update = {
        businessName: fillIfEmpty(existingFields?.businessName, result.businessName),
        businessCategory: fillIfEmpty(existingFields?.businessCategory, result.businessCategory),
        businessDescription: fillIfEmpty(existingFields?.businessDescription, result.businessDescription),
        phone: fillIfEmpty(existingFields?.phone, result.phone),
        email: fillIfEmpty(existingFields?.email, result.email),
        whatsapp: fillIfEmpty(existingFields?.whatsapp, result.whatsapp),
        address: fillIfEmpty(existingFields?.address, result.address),
        contactLinks: result.contactLinks?.length ? result.contactLinks : (existingFields?.contactLinks ?? []),
        deliveryInfo: fillIfEmpty(existingFields?.deliveryInfo, result.deliveryInfo),
        paymentMethods: fillIfEmpty(existingFields?.paymentMethods, result.paymentMethods),
        openingHours: fillIfEmpty(existingFields?.openingHours, result.openingHours),
        socialMedia: fillIfEmpty(existingFields?.socialMedia, result.socialMedia),
        websiteUrl: fillIfEmpty(existingFields?.websiteUrl, siteUrl),
        knowledgeNotes: merged,
        lastExtractAt: new Date().toISOString(),
      };

      const write = await adminPatchDocument(context.env, `assistants/${assistantId}`, update);
      if (write.ok) {
        saved = true;
        savedNoteCount = merged.length;
        console.log(`[extract] ✅ ${merged.length} notes sauvegardées`);
      } else {
        console.error("[extract] ❌ Firestore:", write.error);
      }
    }

    return json({ ...result, saved, savedNoteCount });

  } catch (err: any) {
    console.error("[extract] Erreur:", err?.message);
    return json({ error: err?.message || "Erreur interne." }, 500);
  }
}

// Extraction PDF via Gemini Vision
async function extractPdfWithGemini(base64: string, fileName: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Extrais tout le texte et les informations importantes de ce document PDF (${fileName}). Retourne le texte brut complet.` },
              { inline_data: { mime_type: "application/pdf", data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) return "";
    const data = (await res.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch {
    return "";
  }
}

export function onRequestGet() {
  return json({ error: "POST uniquement." }, 405);
}
