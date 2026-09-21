/**
 * JAWEBFLOW — Extraction via données collées par l'utilisateur.
 * Reçoit du texte/JSON extrait depuis le navigateur de l'utilisateur
 * et le synthétise avec Gemini.
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
const GEMINI_TIMEOUT_MS = 20000;

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

// ---------------------------------------------------------------------------
// Nettoyage et préparation des données reçues
// ---------------------------------------------------------------------------

function prepareExtractedData(pages: any[]): string {
  const parts: string[] = [];

  for (const page of pages) {
    if (!page) continue;

    parts.push(`\n=== PAGE: ${page.url || "URL inconnue"} ===`);
    parts.push(`Type: ${page.type || "inconnu"}`);

    // Page produit
    if (page.type === "PAGE PRODUIT") {
      if (page.title) parts.push(`Produit: ${page.title}`);
      if (page.price) parts.push(`Prix: ${page.price}`);
      if (page.description) parts.push(`Description: ${page.description.slice(0, 1000)}`);
      if (page.variants?.length) {
        parts.push(`Variantes: ${page.variants.map((v: any) => `${v.title} — ${v.price}`).join(", ")}`);
      }
      if (page.images?.length) parts.push(`Images: ${page.imagesCount || page.images.length} image(s)`);
    }

    // Page catalogue/accueil
    else if (page.type?.includes("CATALOGUE") || page.type?.includes("ACCUEIL")) {
      if (page.totalProductsFound) parts.push(`Produits trouvés: ${page.totalProductsFound}`);
      if (page.products?.length) {
        parts.push(`\nListe des produits:`);
        for (const prod of page.products.slice(0, 50)) {
          const line = [prod.title, prod.price, prod.link].filter(Boolean).join(" — ");
          if (line) parts.push(`• ${line}`);
        }
      }
    }

    // Page contact
    else if (page.type?.includes("CONTACT")) {
      if (page.phones?.length) parts.push(`Téléphones: ${page.phones.join(", ")}`);
      if (page.emails?.length) parts.push(`Emails: ${page.emails.join(", ")}`);
      if (page.whatsapp) parts.push(`WhatsApp: ${page.whatsapp}`);
      if (page.address) parts.push(`Adresse: ${page.address}`);
      if (page.socialLinks?.length) parts.push(`Réseaux: ${page.socialLinks.join(", ")}`);
      if (page.formLinks?.length) parts.push(`Formulaires: ${page.formLinks.join(", ")}`);
    }

    // Page générale (texte brut)
    else {
      if (page.title) parts.push(`Titre: ${page.title}`);
      if (page.text) parts.push(`Contenu:\n${page.text.slice(0, 3000)}`);
      if (page.phones?.length) parts.push(`Téléphones: ${page.phones.join(", ")}`);
      if (page.emails?.length) parts.push(`Emails: ${page.emails.join(", ")}`);
      if (page.whatsapp) parts.push(`WhatsApp: ${page.whatsapp}`);
      if (page.links?.length) {
        const importantLinks = page.links.filter((l: string) =>
          l.includes("wa.me") || l.includes("instagram") || l.includes("facebook") ||
          l.includes("tiktok") || l.includes("youtube") || l.startsWith("tel:") ||
          l.startsWith("mailto:") || l.includes("typeform") || l.includes("tally")
        );
        if (importantLinks.length) parts.push(`Liens importants: ${importantLinks.join(", ")}`);
      }
      if (page.products?.length) {
        parts.push(`Produits/Services:`);
        for (const prod of page.products.slice(0, 30)) {
          const line = [prod.title, prod.price].filter(Boolean).join(" — ");
          if (line) parts.push(`• ${line}`);
        }
      }
    }

    // Données brutes si format inconnu
    if (page.rawText) {
      parts.push(`Texte brut:\n${page.rawText.slice(0, 3000)}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Synthèse Gemini
// ---------------------------------------------------------------------------

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

Les données ci-dessous ont été extraites directement depuis le navigateur de l'utilisateur — elles sont 100% fiables et représentent exactement ce que les visiteurs voient sur le site.

RETOURNE UNIQUEMENT un JSON valide sans markdown :
{
  "businessName": "nom exact de la marque/entreprise",
  "businessCategory": "secteur d'activité précis",
  "businessDescription": "description complète 3-5 phrases",
  "phone": "numéro principal",
  "email": "email principal",
  "whatsapp": "lien wa.me complet",
  "address": "adresse complète",
  "contactLinks": ["tous les liens de contact"],
  "deliveryInfo": "délais, zones, prix livraison",
  "paymentMethods": "modes de paiement acceptés",
  "openingHours": "horaires",
  "socialMedia": "réseaux avec URLs complètes",
  "siteType": "vitrine" ou "ecommerce" ou "service" ou "restaurant" ou "portfolio",
  "confidence": 95,
  "knowledgeNotes": [
    {
      "title": "titre précis",
      "category": "services" ou "tarifs" ou "livraison" ou "garanties" ou "contact" ou "faq" ou "general",
      "content": "contenu détaillé 3-6 phrases avec toutes les infos"
    }
  ]
}

RÈGLES :
- Utilise UNIQUEMENT les infos présentes
- Ne jamais inventer — champ vide si absent
- knowledgeNotes : 5-15 fiches couvrant TOUT ce qui est trouvé
- Pour les produits : crée une fiche par catégorie avec les prix
- Pour les services : détaille chaque service avec son prix
- contactLinks : TOUS les moyens de contact (WhatsApp, Instagram, formulaires, tel, email)
- confidence élevé car données extraites directement du navigateur

DONNÉES EXTRAITES :
${content}`;

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
      console.warn(`[extract] ${model} échoué:`, e?.message);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

// ---------------------------------------------------------------------------
// Fusion notes
// ---------------------------------------------------------------------------

function mergeKnowledgeNotes(
  existing: KnowledgeNote[],
  scanned: KnowledgeNote[]
): KnowledgeNote[] {
  const manual = existing.filter((n) => n?.source !== "extracted");
  const seen = new Set<string>();
  const newNotes: KnowledgeNote[] = [];

  for (const note of scanned) {
    const cat = ALLOWED_CATEGORIES.includes((note.category || "").toLowerCase())
      ? note.category!.toLowerCase()
      : "general";
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
  const empty =
    existing === undefined || existing === null || String(existing).trim() === "";
  return empty ? newVal ?? "" : existing;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const body = (await context.request.json().catch(() => ({}))) as {
      pages?: any[];           // Données extraites par le bookmarklet
      rawText?: string;        // Texte brut collé par l'utilisateur
      siteUrl?: string;        // URL du site
      assistantId?: string;
      mode?: "replace" | "merge"; // Remplacer ou fusionner
    };

    // Validation
    if (!body.pages?.length && !body.rawText) {
      return json({ error: "Aucune donnée reçue. Utilisez le bookmarklet ou collez du texte." }, 400);
    }

    if (!body.siteUrl) {
      return json({ error: "URL du site manquante." }, 400);
    }

    // Auth
    const authHeader = context.request.headers.get("Authorization");
    const caller = await verifyFirebaseIdToken(context.env, authHeader);
    if (!caller) return json({ error: "Authentification requise." }, 401);

    // Vérification assistant
    let existingFields: Record<string, any> | null = null;
    if (body.assistantId) {
      const doc = await adminGetDocument(
        context.env,
        `assistants/${body.assistantId}`
      );
      if (doc.ok && doc.fields) {
        const parsed = parseFields(doc.fields);
        if (parsed.userId && parsed.userId !== caller.uid) {
          return json({ error: "Accès refusé." }, 403);
        }
        existingFields = parsed;
      }
    }

    // Prépare le contenu pour Gemini
    let content = "";

    if (body.pages?.length) {
      content = prepareExtractedData(body.pages);
      console.log(`[extract] ${body.pages.length} page(s) reçue(s) — ${content.length} chars`);
    }

    if (body.rawText) {
      content += `\n\nTEXTE BRUT FOURNI:\n${body.rawText}`;
      console.log(`[extract] Texte brut: ${body.rawText.length} chars`);
    }

    if (content.length < 10) {
      return json({ error: "Données insuffisantes pour l'analyse." }, 400);
    }

    // Synthèse Gemini
    if (!context.env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY manquante." }, 500);
    }

    let result: any;
    try {
      result = await synthesizeWithGemini(
        content,
        body.siteUrl,
        context.env.GEMINI_API_KEY,
        context.env.GEMINI_MODEL
      );
    } catch (e: any) {
      console.error("[extract] Gemini échoué:", e?.message);
      return json({ error: "Analyse IA échouée. Réessayez." }, 500);
    }

    // Sauvegarde Firestore
    let saved = false;
    let savedNoteCount = 0;

    if (body.assistantId) {
      const existingNotes: KnowledgeNote[] = Array.isArray(existingFields?.knowledgeNotes)
        ? existingFields!.knowledgeNotes
        : [];

      // Mode replace = on vire les anciennes notes extracted
      // Mode merge = on garde tout
      const baseNotes = body.mode === "replace"
        ? existingNotes.filter(n => n?.source !== "extracted")
        : existingNotes;

      const merged = mergeKnowledgeNotes(baseNotes, result.knowledgeNotes || []);

      const update = {
        businessName: fillIfEmpty(existingFields?.businessName, result.businessName),
        businessCategory: fillIfEmpty(existingFields?.businessCategory, result.businessCategory),
        businessDescription: fillIfEmpty(existingFields?.businessDescription, result.businessDescription),
        phone: fillIfEmpty(existingFields?.phone, result.phone),
        email: fillIfEmpty(existingFields?.email, result.email),
        whatsapp: fillIfEmpty(existingFields?.whatsapp, result.whatsapp),
        address: fillIfEmpty(existingFields?.address, result.address),
        contactLinks: result.contactLinks?.length
          ? result.contactLinks
          : (existingFields?.contactLinks ?? []),
        deliveryInfo: fillIfEmpty(existingFields?.deliveryInfo, result.deliveryInfo),
        paymentMethods: fillIfEmpty(existingFields?.paymentMethods, result.paymentMethods),
        openingHours: fillIfEmpty(existingFields?.openingHours, result.openingHours),
        socialMedia: fillIfEmpty(existingFields?.socialMedia, result.socialMedia),
        websiteUrl: fillIfEmpty(existingFields?.websiteUrl, body.siteUrl),
        knowledgeNotes: merged,
        lastExtractAt: new Date().toISOString(),
      };

      const write = await adminPatchDocument(
        context.env,
        `assistants/${body.assistantId}`,
        update
      );

      if (write.ok) {
        saved = true;
        savedNoteCount = merged.length;
        console.log(`[extract] ✅ ${merged.length} notes sauvegardées`);
      } else {
        console.error("[extract] ❌ Firestore:", write.error);
      }
    }

    return json({
      ...result,
      saved,
      savedNoteCount,
      pagesProcessed: body.pages?.length || 0,
      contentLength: content.length,
    });

  } catch (err: any) {
    console.error("[extract] Erreur:", err?.message);
    return json({ error: err?.message || "Erreur interne." }, 500);
  }
}

export function onRequestGet() {
  return json({ error: "POST uniquement." }, 405);
}
