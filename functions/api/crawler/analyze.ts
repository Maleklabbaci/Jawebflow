/**
 * JAWEBFLOW — Import universel : texte, PDF, JSON, n'importe quoi.
 * v2.0 — Tous les correctifs appliqués
 */

import {
  adminGetDocument,
  adminPatchDocument,
  verifyFirebaseIdToken,
  parseFields,
} from "../../_shared/google.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_MODELS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b-latest",
  "gemini-1.5-pro-latest",
];

const GEMINI_TIMEOUT_MS = 20000;
const PDF_TIMEOUT_MS = 25000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CONTENT_LENGTH = 30000;
const MAX_RAW_TEXT_LENGTH = 50000;
const ASSISTANT_ID_REGEX = /^[a-zA-Z0-9_-]{10,40}$/;

const ALLOWED_CATEGORIES = [
  "services",
  "tarifs",
  "livraison",
  "garanties",
  "contact",
  "faq",
  "general",
] as const;

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

type KnowledgeNote = {
  id?: string;
  title?: string;
  category?: AllowedCategory | string;
  content?: string;
  enabled?: boolean;
  source?: string;
};

type GeminiResult = {
  businessName?: string;
  businessCategory?: string;
  businessDescription?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  address?: string;
  contactLinks?: string[];
  deliveryInfo?: string;
  paymentMethods?: string;
  openingHours?: string;
  socialMedia?: string;
  siteType?: string;
  confidence?: number;
  knowledgeNotes?: KnowledgeNote[];
};

type PageData = {
  url?: string;
  type?: string;
  title?: string;
  price?: string;
  description?: string;
  phones?: string[];
  emails?: string[];
  whatsapp?: string;
  links?: string[];
  rawText?: string;
  products?: { title: string; price?: string; link?: string }[];
};

type RequestBody = {
  rawText?: string;
  pages?: PageData[];
  siteUrl?: string;
  assistantId?: string;
  mode?: string;
};

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = {
  info: (msg: string, data?: object) =>
    console.log(
      JSON.stringify({ level: "info", msg, ...data, ts: Date.now() })
    ),
  warn: (msg: string, data?: object) =>
    console.warn(
      JSON.stringify({ level: "warn", msg, ...data, ts: Date.now() })
    ),
  error: (msg: string, data?: object) =>
    console.error(
      JSON.stringify({ level: "error", msg, ...data, ts: Date.now() })
    ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * FIX #1 — Conversion ArrayBuffer → base64 par chunks
 * Évite le crash mémoire sur les gros fichiers dans Cloudflare Workers
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * FIX #5 — fillIfEmpty avec mode forceUpdate pour le mode "replace"
 */
function fillIfEmpty(
  existing: unknown,
  newVal: unknown,
  forceUpdate = false
): unknown {
  if (forceUpdate) return newVal ?? existing ?? "";
  return existing === undefined ||
    existing === null ||
    String(existing).trim() === ""
    ? (newVal ?? "")
    : existing;
}

/**
 * FIX #3 — mergeKnowledgeNotes : plusieurs notes par catégorie autorisées
 * FIX #7 — IDs via crypto.randomUUID() pour éviter les race conditions
 */
function mergeKnowledgeNotes(
  existing: KnowledgeNote[],
  scanned: KnowledgeNote[]
): KnowledgeNote[] {
  const manual = existing.filter((n) => n?.source !== "extracted");
  const newNotes: KnowledgeNote[] = [];

  for (const [index, note] of scanned.entries()) {
    if (!note) continue;

    const rawCat = (note.category || "").toLowerCase();
    const cat: AllowedCategory = ALLOWED_CATEGORIES.includes(
      rawCat as AllowedCategory
    )
      ? (rawCat as AllowedCategory)
      : "general";

    const content = (note.content || "").trim();
    if (!content) continue; // Ignore les notes vides

    newNotes.push({
      id: `extracted_${cat}_${crypto.randomUUID()}`,
      title: (note.title || "Information").trim(),
      category: cat,
      content,
      enabled: true,
      source: "extracted",
    });

    log.info("Note ajoutée", { index, cat, title: note.title });
  }

  log.info("Merge terminé", {
    manual: manual.length,
    new: newNotes.length,
    total: manual.length + newNotes.length,
  });

  return [...manual, ...newNotes];
}

/**
 * Construit le contenu texte à partir des pages scrapées
 */
function buildContentFromPages(pages: PageData[]): string {
  let content = "";
  for (const page of pages) {
    if (!page) continue;
    content += `\n\n=== PAGE: ${page.url || "URL"} ===\n`;
    content += `Type: ${page.type || "général"}\n`;
    if (page.title) content += `Titre: ${page.title}\n`;
    if (page.price) content += `Prix: ${page.price}\n`;
    if (page.description) content += `Description: ${page.description}\n`;
    if (page.phones?.length)
      content += `Téléphones: ${page.phones.join(", ")}\n`;
    if (page.emails?.length) content += `Emails: ${page.emails.join(", ")}\n`;
    if (page.whatsapp) content += `WhatsApp: ${page.whatsapp}\n`;
    if (page.links?.length) content += `Liens: ${page.links.join(", ")}\n`;
    if (page.rawText) content += `Contenu: ${page.rawText.slice(0, 3000)}\n`;
    if (page.products?.length) {
      content += `Produits:\n`;
      page.products.forEach((p) => {
        content += `• ${p.title} — ${p.price || ""} — ${p.link || ""}\n`;
      });
    }
  }
  return content;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

/**
 * Extraction du texte d'un PDF via Gemini Vision
 * FIX #4 — Timeout réduit à PDF_TIMEOUT_MS (25s)
 */
async function extractPdfWithGemini(
  base64: string,
  fileName: string,
  apiKey: string
): Promise<string> {
  try {
    log.info("Extraction PDF", { fileName, base64Length: base64.length });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extrais tout le texte et les informations importantes de ce document PDF (${fileName}). Retourne le texte brut complet sans formatage markdown.`,
                },
                {
                  inline_data: {
                    mime_type: "application/pdf",
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      log.warn("PDF extraction HTTP error", { status: res.status, fileName });
      return "";
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    log.info("PDF extrait", { fileName, chars: text.length });
    return text;
  } catch (e: unknown) {
    log.error("PDF extraction failed", {
      fileName,
      error: e instanceof Error ? e.message : String(e),
    });
    return "";
  }
}

/**
 * Synthèse des données avec Gemini — fallback automatique entre modèles
 */
async function synthesizeWithGemini(
  content: string,
  siteUrl: string,
  apiKey: string,
  preferredModel?: string
): Promise<GeminiResult> {
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
- Plusieurs fiches peuvent avoir la même catégorie si les thèmes sont distincts
- Si tu trouves des produits avec prix → fiche tarifs détaillée
- Si tu trouves des contacts → fiche contact avec tous les liens
- confidence élevé car données fournies directement par l'utilisateur

CONTENU FOURNI :
${content.slice(0, MAX_CONTENT_LENGTH)}`;

  const models = Array.from(
    new Set([preferredModel, ...FALLBACK_MODELS].filter(Boolean))
  ) as string[];

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      log.info("Gemini tentative", { model });

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

      if (res.status === 429) {
        log.warn("Gemini quota dépassé", { model });
        continue;
      }
      if (!res.ok) {
        log.warn("Gemini HTTP error", { model, status: res.status });
        continue;
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        log.warn("Gemini réponse vide", { model });
        continue;
      }

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as GeminiResult;
      log.info("Gemini succès", {
        model,
        noteCount: parsed.knowledgeNotes?.length ?? 0,
      });
      return parsed;
    } catch (e: unknown) {
      clearTimeout(timer);
      log.warn("Gemini erreur", {
        model,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  throw new Error("Tous les modèles Gemini ont échoué");
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export function onRequestGet(): Response {
  return json({ error: "POST uniquement." }, 405);
}

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, string>;
}): Promise<Response> {
  try {
    // ── FIX #2 — AUTH EN PREMIER avant tout traitement coûteux ──────────────
    const authHeader = context.request.headers.get("Authorization");
    const caller = await verifyFirebaseIdToken(context.env, authHeader);
    if (!caller) {
      log.warn("Auth échouée", { ip: context.request.headers.get("cf-connecting-ip") ?? "unknown" });
      return json({ error: "Authentification requise." }, 401);
    }

    log.info("Auth OK", { uid: caller.uid });

    // ── Validation GEMINI_API_KEY tôt ────────────────────────────────────────
    if (!context.env.GEMINI_API_KEY) {
      log.error("GEMINI_API_KEY manquante");
      return json({ error: "Configuration serveur manquante." }, 500);
    }

    const contentType = context.request.headers.get("Content-Type") || "";

    let rawText = "";
    let siteUrl = "https://monsite.com";
    let assistantId = "";
    let mode = "merge";
    let pages: PageData[] = [];
    let filesProcessed = 0;

    // ── Multipart (PDF, fichiers) ────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      siteUrl = (formData.get("siteUrl") as string) || siteUrl;
      assistantId = (formData.get("assistantId") as string) || "";
      mode = (formData.get("mode") as string) || "merge";
      rawText = (formData.get("rawText") as string) || "";

      // Tronquer rawText si trop long
      if (rawText.length > MAX_RAW_TEXT_LENGTH) {
        rawText = rawText.slice(0, MAX_RAW_TEXT_LENGTH);
        log.warn("rawText tronqué", { originalLength: rawText.length });
      }

      const files = formData.getAll("files");

      for (const file of files) {
        if (!(file instanceof File)) continue;

        // FIX #8 — Limite taille fichier
        if (file.size > MAX_FILE_SIZE) {
          return json(
            {
              error: `Fichier "${file.name}" trop volumineux. Maximum : 10MB.`,
            },
            413
          );
        }

        const fileType = file.type;
        const fileName = file.name.toLowerCase();

        log.info("Traitement fichier", {
          name: file.name,
          type: fileType,
          size: file.size,
        });

        if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
          // FIX #1 — Conversion base64 par chunks
          const arrayBuffer = await file.arrayBuffer();
          const base64 = arrayBufferToBase64(arrayBuffer);
          rawText += `\n\n[FICHIER PDF: ${file.name}]\n`;
          const pdfContent = await extractPdfWithGemini(
            base64,
            file.name,
            context.env.GEMINI_API_KEY
          );
          rawText += pdfContent;
          filesProcessed++;
        } else if (
          fileType.includes("text") ||
          fileName.endsWith(".txt") ||
          fileName.endsWith(".csv") ||
          fileName.endsWith(".md")
        ) {
          const text = await file.text();
          rawText += `\n\n[FICHIER: ${file.name}]\n${text}`;
          filesProcessed++;
        } else if (fileName.endsWith(".json")) {
          const text = await file.text();
          try {
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            pages = [...pages, ...items];
            filesProcessed++;
          } catch {
            rawText += `\n\n[FICHIER JSON: ${file.name}]\n${text}`;
            filesProcessed++;
          }
        } else {
          // Fichier inconnu → essai lecture texte
          try {
            const text = await file.text();
            rawText += `\n\n[FICHIER: ${file.name}]\n${text.slice(0, 5000)}`;
            filesProcessed++;
          } catch {
            log.warn("Fichier illisible ignoré", { name: file.name });
          }
        }
      }

    // ── JSON normal ──────────────────────────────────────────────────────────
    } else {
      const body = (await context.request
        .json()
        .catch(() => ({}))) as RequestBody;
      rawText = body.rawText || "";
      pages = body.pages || [];
      siteUrl = body.siteUrl || siteUrl;
      assistantId = body.assistantId || "";
      mode = body.mode || "merge";
    }

    // ── FIX #6 — Validation assistantId ──────────────────────────────────────
    if (assistantId && !ASSISTANT_ID_REGEX.test(assistantId)) {
      log.warn("assistantId invalide", { assistantId });
      return json({ error: "assistantId invalide." }, 400);
    }

    // ── Validation contenu ────────────────────────────────────────────────────
    if (!rawText.trim() && pages.length === 0) {
      return json({ error: "Aucune donnée reçue." }, 400);
    }

    // ── Chargement du document existant ──────────────────────────────────────
    let existingFields: Record<string, unknown> | null = null;

    if (assistantId) {
      const doc = await adminGetDocument(
        context.env,
        `assistants/${assistantId}`
      );
      if (doc.ok && doc.fields) {
        const parsed = parseFields(doc.fields) as Record<string, unknown>;
        if (parsed.userId && parsed.userId !== caller.uid) {
          log.warn("Accès refusé", {
            uid: caller.uid,
            ownerId: parsed.userId,
          });
          return json({ error: "Accès refusé." }, 403);
        }
        existingFields = parsed;
      }
    }

    // ── Construction du contenu final ─────────────────────────────────────────
    let content = rawText.trim();
    content += buildContentFromPages(pages);

    if (content.length < 5) {
      return json({ error: "Contenu insuffisant." }, 400);
    }

    log.info("Contenu prêt", { chars: content.length, pages: pages.length });

    // ── Synthèse Gemini ───────────────────────────────────────────────────────
    let result: GeminiResult;
    try {
      result = await synthesizeWithGemini(
        content,
        siteUrl,
        context.env.GEMINI_API_KEY,
        context.env.GEMINI_MODEL
      );
    } catch (e: unknown) {
      log.error("Gemini synthèse échouée", {
        error: e instanceof Error ? e.message : String(e),
      });
      return json({ error: "Analyse IA échouée. Réessayez." }, 500);
    }

    // ── Sauvegarde Firestore ───────────────────────────────────────────────────
    let saved = false;
    let savedNoteCount = 0;

    if (assistantId) {
      const existing: KnowledgeNote[] = Array.isArray(
        existingFields?.knowledgeNotes
      )
        ? (existingFields!.knowledgeNotes as KnowledgeNote[])
        : [];

      // FIX #5 — mode "replace" force la mise à jour des champs existants
      const forceUpdate = mode === "replace";

      const base =
        mode === "replace"
          ? existing.filter((n) => n?.source !== "extracted")
          : existing;

      const merged = mergeKnowledgeNotes(base, result.knowledgeNotes || []);

      const update = {
        businessName: fillIfEmpty(
          existingFields?.businessName,
          result.businessName,
          forceUpdate
        ),
        businessCategory: fillIfEmpty(
          existingFields?.businessCategory,
          result.businessCategory,
          forceUpdate
        ),
        businessDescription: fillIfEmpty(
          existingFields?.businessDescription,
          result.businessDescription,
          forceUpdate
        ),
        phone: fillIfEmpty(existingFields?.phone, result.phone, forceUpdate),
        email: fillIfEmpty(existingFields?.email, result.email, forceUpdate),
        whatsapp: fillIfEmpty(
          existingFields?.whatsapp,
          result.whatsapp,
          forceUpdate
        ),
        address: fillIfEmpty(
          existingFields?.address,
          result.address,
          forceUpdate
        ),
        contactLinks:
          result.contactLinks?.length
            ? result.contactLinks
            : (existingFields?.contactLinks ?? []),
        deliveryInfo: fillIfEmpty(
          existingFields?.deliveryInfo,
          result.deliveryInfo,
          forceUpdate
        ),
        paymentMethods: fillIfEmpty(
          existingFields?.paymentMethods,
          result.paymentMethods,
          forceUpdate
        ),
        openingHours: fillIfEmpty(
          existingFields?.openingHours,
          result.openingHours,
          forceUpdate
        ),
        socialMedia: fillIfEmpty(
          existingFields?.socialMedia,
          result.socialMedia,
          forceUpdate
        ),
        websiteUrl: fillIfEmpty(
          existingFields?.websiteUrl,
          siteUrl,
          forceUpdate
        ),
        knowledgeNotes: merged,
        lastExtractAt: new Date().toISOString(),
      };

      const write = await adminPatchDocument(
        context.env,
        `assistants/${assistantId}`,
        update
      );

      if (write.ok) {
        saved = true;
        savedNoteCount = merged.length;
        log.info("Sauvegarde OK", { assistantId, noteCount: merged.length });
      } else {
        log.error("Sauvegarde Firestore échouée", { error: write.error });
      }
    }

    // ── FIX #10 — Réponse enrichie ────────────────────────────────────────────
    return json({
      ...result,
      saved,
      savedNoteCount,
      meta: {
        contentLength: content.length,
        filesProcessed,
        pagesProcessed: pages.length,
        mode,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    log.error("Erreur inattendue", {
      error: err instanceof Error ? err.message : String(err),
    });
    return json({ error: "Erreur interne." }, 500);
  }
}
