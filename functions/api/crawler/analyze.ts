/**
 * JAWEBFLOW — Scanner de site web (Cloudflare Pages Function).
 *
 * Correctifs appliqués :
 *   1. Modèles Gemini fiables avec repli automatique + timeout strict.
 *   2. Détection des sites SPA (React/Next/Vue côté client, ex: Vercel) :
 *      repli sur sitemap.xml, chemins courants, et métadonnées SEO.
 *   3. ÉCRITURE RÉELLE dans Firestore via adminPatchDocument (avant, rien
 *      n'était jamais sauvegardé côté serveur).
 *   4. Fusion intelligente : les notes ajoutées manuellement ne sont
 *      JAMAIS écrasées. Seules les notes source:"scanned" sont remplacées.
 */

import {
  adminGetDocument,
  adminPatchDocument,
  verifyFirebaseIdToken,
  isPublicHttpUrl,
  parseFields,
} from "../../_shared/google.ts";

const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const GEMINI_TIMEOUT_MS = 15000;

type Page = { url: string; title: string; text: string; status: "done" | "failed" };
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
// Extraction HTML
// ---------------------------------------------------------------------------

function cleanHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)[^<]*)*<\/style>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|dt|dd|main|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function looksLikeEmptySPA(html: string): boolean {
  const bodyText = cleanHtml(html);
  const hasRootDiv = /<div\s+id=["'](root|app|__next|__nuxt)["']/i.test(html);
  const hasFrameworkScript = /\/_next\/|\/assets\/index-|vite|react-dom|\.chunk\.js/i.test(html);
  return (hasRootDiv || hasFrameworkScript) && bodyText.length < 250;
}

function extractMetaFallback(html: string, url: string): { title: string; description: string } {
  const title =
    html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
    new URL(url).pathname ||
    url;
  const description =
    html.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["']/i)?.[1] ||
    "";
  return { title: title.trim(), description: description.trim() };
}

async function fetchPage(url: string): Promise<Page> {
  try {
    if (!isPublicHttpUrl(url).ok) throw new Error("URL interne refusée");
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JawebFlowCrawler/1.0)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const cleaned = cleanHtml(html);

    if (cleaned.length > 60) {
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(url).pathname || "Page web";
      return { url, title, text: cleaned.slice(0, 9000), status: "done" };
    }

    const meta = extractMetaFallback(html, url);
    if (meta.description.length > 15) {
      return { url, title: meta.title, text: meta.description, status: "done" };
    }

    return { url, title: meta.title, text: "", status: "failed" };
  } catch (_) {
    return { url, title: new URL(url).pathname || url, text: "", status: "failed" };
  }
}

function discoverLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const link = new URL(match[1], baseUrl);
      if (link.protocol === "http:" || link.protocol === "https:") {
        link.hash = "";
        if (link.hostname === base.hostname) links.add(link.toString());
      }
    } catch (_) {
      /* lien invalide, on ignore */
    }
  }
  return [...links].filter((link) => link !== baseUrl).slice(0, 8);
}

async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  try {
    const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
    return urls.slice(0, 15);
  } catch {
    return [];
  }
}

const COMMON_PATHS = [
  "/services",
  "/tarifs",
  "/prix",
  "/pricing",
  "/contact",
  "/livraison",
  "/faq",
  "/a-propos",
  "/about",
  "/produits",
];

// ---------------------------------------------------------------------------
// Synthèse IA
// ---------------------------------------------------------------------------

const ALLOWED_CATEGORIES = ["services", "tarifs", "livraison", "garanties", "contact", "faq", "general"];

async function synthesizeWithGemini(pages: Page[], siteUrl: string, apiKey: string, preferredModel?: string) {
  const dossier = pages
    .filter((p) => p.status === "done")
    .map((p) => `PAGE: ${p.title}\nURL: ${p.url}\n${p.text}`)
    .join("\n\n")
    .slice(0, 28000);

  const prompt = `Analyse UNIQUEMENT les informations réelles ci-dessous extraites du site ${siteUrl}. Ne complète JAMAIS avec des informations inventées : si une donnée n'est pas présente, laisse le champ vide.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "businessName": string,
  "businessCategory": string,
  "businessDescription": string,
  "phone": string,
  "email": string,
  "deliveryInfo": string,
  "paymentMethods": string,
  "siteType": "vitrine" | "ecommerce" | "service",
  "confidence": number (0 à 100),
  "knowledgeNotes": [
    { "title": string, "category": one of ["services","tarifs","livraison","garanties","contact","faq"], "content": string }
  ]
}

knowledgeNotes doit contenir entre 3 et 8 fiches utiles et concises (2 à 4 phrases chacune), une par catégorie pertinente trouvée dans le contenu.

CONTENU DU SITE :
${dossier}`;

  const models = Array.from(new Set([preferredModel, ...FALLBACK_MODELS].filter(Boolean))) as string[];
  const errors: string[] = [];

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (response.status === 429) {
        errors.push(`${model}: quota dépassé (429)`);
        break;
      }
      if (!response.ok) {
        errors.push(`${model}: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 150)}`);
        continue;
      }

      const data = (await response.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        errors.push(`${model}: réponse vide`);
        continue;
      }

      const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
      console.log(`[crawler] synthèse Gemini réussie avec ${model}`);
      return parsed;
    } catch (e: any) {
      clearTimeout(timer);
      errors.push(`${model}: ${e?.name === "AbortError" ? "timeout" : e?.message || e}`);
    }
  }
  throw new Error(`Tous les modèles Gemini ont échoué: ${errors.join(" | ")}`);
}

function fallbackFromPages(pages: Page[], siteUrl: string) {
  const good = pages.filter((p) => p.status === "done");
  const corpus = good.map((p) => p.text).join("\n");
  const title = good[0]?.title || new URL(siteUrl).hostname;
  const phones = corpus.match(/(?:\+213|00213|0)[567]\d{8}/g) || [];
  const emails = corpus.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
  const excerpt = (text: string) => text.replace(/\s+/g, " ").slice(0, 1800);
  return {
    siteType: /prix|produit|panier|boutique|shop/i.test(corpus) ? "ecommerce" : "vitrine",
    confidence: 50,
    businessName: title,
    businessCategory: "Activité détectée sur le site",
    businessDescription: excerpt(good[0]?.text || `Contenu public récupéré depuis ${siteUrl}.`),
    phone: phones[0] || "",
    email: emails[0] || "",
    deliveryInfo: "",
    paymentMethods: "",
    knowledgeNotes: good.slice(0, 8).map((p) => ({
      title: p.title,
      category: /contact/i.test(p.url) ? "contact" : /prix|tarif/i.test(p.text) ? "tarifs" : "general",
      content: excerpt(p.text),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fusion avec les notes existantes
// ---------------------------------------------------------------------------

function mergeKnowledgeNotes(existing: KnowledgeNote[], scannedRaw: KnowledgeNote[]): KnowledgeNote[] {
  const manualNotes = existing.filter((n) => n && n.source !== "scanned");

  const seenCategories = new Set<string>();
  const scannedNotes: KnowledgeNote[] = [];
  for (const note of scannedRaw) {
    const category = ALLOWED_CATEGORIES.includes((note.category || "").toLowerCase())
      ? (note.category as string).toLowerCase()
      : "general";
    if (seenCategories.has(category)) continue;
    seenCategories.add(category);
    scannedNotes.push({
      id: `scanned_${category}`,
      title: note.title || "Information du site",
      category,
      content: (note.content || "").trim(),
      enabled: true,
      source: "scanned",
    });
  }

  return [...manualNotes, ...scannedNotes];
}

function fillIfEmpty(existingValue: any, newValue: any): any {
  const existingIsEmpty = existingValue === undefined || existingValue === null || String(existingValue).trim() === "";
  return existingIsEmpty ? newValue || "" : existingValue;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const body = (await context.request.json().catch(() => ({}))) as { url?: string; assistantId?: string };
    if (!body.url) return json({ error: "URL is required" }, 400);

    const urlCheck = isPublicHttpUrl(body.url.startsWith("http") ? body.url : `https://${body.url}`);
    if (!urlCheck.ok) return json({ error: `URL refusée : ${urlCheck.reason}` }, 400);

    const caller = await verifyFirebaseIdToken(context.env, context.request.headers.get("Authorization"));
    if (!caller) return json({ error: "Authentification requise : connectez-vous pour lancer un scan." }, 401);

    let existingAssistantFields: Record<string, any> | null = null;
    if (body.assistantId) {
      const ownerCheck = await adminGetDocument(context.env, `assistants/${body.assistantId}`);
      if (ownerCheck.ok && ownerCheck.fields) {
        const parsed = parseFields(ownerCheck.fields);
        const ownerId = parsed.userId;
        if (ownerId && ownerId !== caller.uid) {
          console.warn(`[crawler] accès refusé: uid=${caller.uid} assistantId=${body.assistantId}`);
          return json({ error: "Accès refusé : cet assistant ne vous appartient pas." }, 403);
        }
        existingAssistantFields = parsed;
      }
    }

    const url = new URL(body.url.startsWith("http") ? body.url : `https://${body.url}`);
    url.hash = "";
    const rootUrl = url.toString();

    const rootResponse = await fetch(rootUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JawebFlowCrawler/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!rootResponse.ok) return json({ error: `Le site a répondu HTTP ${rootResponse.status}.` }, 502);

    const rootHtml = await rootResponse.text();
    const isSPA = looksLikeEmptySPA(rootHtml);

    let links = discoverLinks(rootHtml, rootUrl);

    if (isSPA || links.length === 0) {
      const sitemapLinks = await discoverViaSitemap(rootUrl);
      const commonLinks = COMMON_PATHS.map((path) => new URL(path, rootUrl).toString());
      links = [...new Set([...sitemapLinks, ...commonLinks])].slice(0, 10);
      console.log(
        `[crawler] site détecté comme SPA (${new URL(rootUrl).hostname}) : ${links.length} chemin(s) testé(s) en repli.`
      );
    }

    const pages = [await fetchPage(rootUrl), ...(await Promise.all(links.map(fetchPage)))];
    const usablePages = pages.filter((p) => p.status === "done" && p.text.length > 15);

    console.log(
      `[crawler] scan de ${rootUrl} : ${pages.length} page(s) testée(s), ${usablePages.length} exploitable(s), SPA=${isSPA}`
    );

    if (usablePages.length === 0) {
      return json(
        {
          error: isSPA
            ? "Ce site semble être une application JavaScript (React/Next/Vue) dont le contenu ne se charge qu'après exécution du code dans un navigateur. Le scan automatique ne peut lire que le HTML initial. Ajoutez vos informations manuellement via « Ajouter une Note »."
            : "Aucun contenu HTML exploitable n'a été trouvé sur ce site.",
        },
        502
      );
    }

    let result: any;
    if (context.env.GEMINI_API_KEY) {
      try {
        result = await synthesizeWithGemini(pages, rootUrl, context.env.GEMINI_API_KEY, context.env.GEMINI_MODEL);
      } catch (e: any) {
        console.error("[crawler] Gemini a échoué, repli sur extraction brute:", e?.message || e);
        result = fallbackFromPages(pages, rootUrl);
      }
    } else {
      result = fallbackFromPages(pages, rootUrl);
    }

    let saved = false;
    let savedNoteCount = 0;
    if (body.assistantId) {
      const existingNotes: KnowledgeNote[] = Array.isArray(existingAssistantFields?.knowledgeNotes)
        ? existingAssistantFields!.knowledgeNotes
        : [];
      const mergedNotes = mergeKnowledgeNotes(existingNotes, result.knowledgeNotes || []);

      const updateData = {
        businessName: fillIfEmpty(existingAssistantFields?.businessName, result.businessName),
        businessCategory: fillIfEmpty(existingAssistantFields?.businessCategory, result.businessCategory),
        businessDescription: fillIfEmpty(existingAssistantFields?.businessDescription, result.businessDescription),
        phone: fillIfEmpty(existingAssistantFields?.phone, result.phone),
        email: fillIfEmpty(existingAssistantFields?.email, result.email),
        deliveryInfo: fillIfEmpty(existingAssistantFields?.deliveryInfo, result.deliveryInfo),
        paymentMethods: fillIfEmpty(existingAssistantFields?.paymentMethods, result.paymentMethods),
        websiteUrl: fillIfEmpty(existingAssistantFields?.websiteUrl, rootUrl),
        knowledgeNotes: mergedNotes,
        lastScanAt: new Date().toISOString(),
      };

      const writeResult = await adminPatchDocument(context.env, `assistants/${body.assistantId}`, updateData);
      if (writeResult.ok) {
        saved = true;
        savedNoteCount = mergedNotes.length;
        console.log(`[crawler] ${mergedNotes.length} note(s) enregistrée(s) pour assistantId=${body.assistantId}`);
      } else {
        console.error(`[crawler] échec d'écriture Firestore:`, writeResult.error);
      }
    }

    return json({
      ...result,
      saved,
      savedNoteCount,
      scrapingStrategy: isSPA
        ? ["Détection SPA", "Sitemap", "Chemins courants", "Métadonnées SEO"]
        : ["Accueil", "Pages internes", "Services et offres", "Tarifs", "FAQ", "Contact"],
      scannedPages: pages.map(({ url: pageUrl, title, status }) => ({ url: pageUrl, title, status })),
    });
  } catch (error: any) {
    console.error("[crawler] erreur générale:", error?.message || error);
    return json({ error: error?.message || "Impossible de scanner le site." }, 500);
  }
}

export function onRequestGet() {
  return json({ error: "Cette route accepte uniquement POST." }, 405);
}
