/**
 * JAWEBFLOW — Crawler multi-pages récursif.
 * Visite jusqu'à 20 pages internes, extrait tout le contenu visible.
 */

import {
  adminGetDocument,
  adminPatchDocument,
  verifyFirebaseIdToken,
  isPublicHttpUrl,
  parseFields,
} from "../../_shared/google.ts";

const FALLBACK_MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash-8b", "gemini-1.5-flash"];
const GEMINI_TIMEOUT_MS = 25000;
const MAX_PAGES = 20;

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
// Nettoyage HTML
// ---------------------------------------------------------------------------

function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)[^<]*)*<\/style>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|dt|dd|main|header|footer|nav|span)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function looksLikeEmptySPA(html: string): boolean {
  const bodyText = cleanHtml(html);
  const hasRootDiv = /<div\s+id=["'](root|app|__next|__nuxt)["']/i.test(html);
  const hasFrameworkScript =
    /\/_next\/|\/assets\/index-|vite|react-dom|\.chunk\.js|__nuxt|importmap/i.test(html);
  return (hasRootDiv || hasFrameworkScript) && bodyText.length < 500;
}

// ---------------------------------------------------------------------------
// Extraction complète d'une page HTML
// ---------------------------------------------------------------------------

function extractPageContent(html: string, url: string): string {
  const parts: string[] = [];

  // Titre
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) parts.push(`[TITRE] ${title}`);

  // Métadonnées
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  if (desc) parts.push(`[DESCRIPTION] ${desc.trim()}`);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogDesc && ogDesc !== desc) parts.push(`[OG DESC] ${ogDesc.trim()}`);

  // JSON-LD — source la plus riche pour Shopify/WooCommerce
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const item of items) {
        const type = String(item["@type"] || "");
        if (item.name) parts.push(`[NOM] ${item.name}`);
        if (item.description) parts.push(`[DESC] ${item.description}`);
        if (item.telephone) parts.push(`[TEL] ${item.telephone}`);
        if (item.email) parts.push(`[EMAIL] ${item.email}`);
        if (item.priceRange) parts.push(`[PRIX RANGE] ${item.priceRange}`);
        if (item.address) {
          const a = item.address;
          const addr = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, a.addressCountry]
            .filter(Boolean).join(", ");
          if (addr) parts.push(`[ADRESSE] ${addr}`);
        }
        if (item.openingHours) {
          const h = Array.isArray(item.openingHours) ? item.openingHours.join(", ") : item.openingHours;
          parts.push(`[HORAIRES] ${h}`);
        }
        if (item.paymentAccepted) parts.push(`[PAIEMENT] ${item.paymentAccepted}`);
        if (item.currenciesAccepted) parts.push(`[DEVISE] ${item.currenciesAccepted}`);
        if (Array.isArray(item.sameAs)) parts.push(`[RESEAUX] ${item.sameAs.join(", ")}`);

        // Produit Shopify/WooCommerce
        if (/product/i.test(type)) {
          if (item.sku) parts.push(`[SKU] ${item.sku}`);
          if (item.brand?.name) parts.push(`[MARQUE] ${item.brand.name}`);
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const o of offers.slice(0, 10)) {
              const price = o.price ?? o.lowPrice;
              const currency = o.priceCurrency || "";
              const avail = o.availability?.split("/").pop() || "";
              if (price !== undefined) parts.push(`[PRIX] ${price} ${currency} — ${avail}`);
            }
          }
          if (item.aggregateRating) {
            parts.push(`[NOTE] ${item.aggregateRating.ratingValue}/5 (${item.aggregateRating.reviewCount} avis)`);
          }
        }

        // FAQ
        if (/faqpage/i.test(type) && Array.isArray(item.mainEntity)) {
          for (const faq of item.mainEntity.slice(0, 15)) {
            if (faq.name && faq.acceptedAnswer?.text) {
              parts.push(`[FAQ] Q: ${faq.name}\nR: ${faq.acceptedAnswer.text.slice(0, 400)}`);
            }
          }
        }
      }
    } catch {}
  }

  // Contenu HTML visible complet
  const visible = cleanHtml(html);
  if (visible.length > 50) {
    parts.push(`[CONTENU VISIBLE]\n${visible.slice(0, 8000)}`);
  }

  // Liens internes et externes importants
  const links: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (
      href.startsWith("tel:") ||
      href.startsWith("mailto:") ||
      href.includes("wa.me") ||
      href.includes("whatsapp") ||
      href.includes("instagram") ||
      href.includes("facebook") ||
      href.includes("tiktok") ||
      href.includes("youtube") ||
      href.includes("linkedin") ||
      href.includes("typeform") ||
      href.includes("tally") ||
      href.includes("calendly") ||
      href.includes("forms.gle")
    ) {
      links.push(href);
    }
  }
  if (links.length) {
    parts.push(`[LIENS IMPORTANTS] ${[...new Set(links)].join(" | ")}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Extraction bundle JS (SPA)
// ---------------------------------------------------------------------------

function extractBundleUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const base = new URL(baseUrl);
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.hostname === base.hostname) urls.push(u.toString());
    } catch {}
  }
  return urls.slice(0, 3);
}

function extractStringsFromBundle(js: string): string {
  const results: string[] = [];

  const phones = [...js.matchAll(/["'`](\+?(?:213|0)[5-7]\d{8})["'`]/g)];
  const uniquePhones = [...new Set(phones.map(m => m[1]))].slice(0, 5);
  if (uniquePhones.length) results.push(`[TEL] ${uniquePhones.join(", ")}`);

  const emails = [...js.matchAll(/["'`]([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})["'`]/g)];
  const uniqueEmails = [...new Set(emails.map(m => m[1]))].slice(0, 5);
  if (uniqueEmails.length) results.push(`[EMAIL] ${uniqueEmails.join(", ")}`);

  const whatsapp = [...js.matchAll(/wa\.me\/([\d]+)/g)];
  if (whatsapp.length) results.push(`[WHATSAPP] ${[...new Set(whatsapp.map(m => `https://wa.me/${m[1]}`))].join(", ")}`);

  const socials: string[] = [];
  for (const net of ["instagram.com", "facebook.com", "tiktok.com", "youtube.com", "linkedin.com", "twitter.com", "x.com"]) {
    const m = js.match(new RegExp(`https?://(?:www\\.)?${net.replace(".", "\\.")}/[\\w./@-]+`, "i"));
    if (m) socials.push(m[0].replace(/["'`\\]/g, "").split(/[\s"'`]/)[0]);
  }
  if (socials.length) results.push(`[RESEAUX] ${[...new Set(socials)].join(", ")}`);

  // Strings de contenu (40-600 chars, commence par majuscule)
  const seen = new Set<string>();
  const contentStrings: string[] = [];
  for (const m of js.matchAll(/["'`]([A-ZÀ-Öa-zà-ö][^"'`\n\r\\]{39,599})["'`]/g)) {
    const s = m[1].replace(/\\n/g, "\n").replace(/\\t/g, " ").replace(/\\"/g, '"').trim();
    if (
      seen.has(s) ||
      /^[a-z\-_]+:/.test(s) ||
      /rgba?\(/.test(s) ||
      /[<>{}[\]|]/.test(s) ||
      s.split(" ").length < 5
    ) continue;
    seen.add(s);
    contentStrings.push(s);
    if (contentStrings.length >= 80) break;
  }
  if (contentStrings.length) results.push(`[CONTENU JS]\n${contentStrings.join("\n")}`);

  const prices = [...js.matchAll(/["'`]([^"'`]*\d+[\s]?(?:DA|DZD|MAD|€|\$|USD)[^"'`]{0,80})["'`]/gi)];
  if (prices.length) results.push(`[PRIX] ${[...new Set(prices.map(m => m[1].trim()))].slice(0, 15).join(" | ")}`);

  return results.join("\n");
}

async function extractFromJsBundle(html: string, baseUrl: string): Promise<string> {
  const bundleUrls = extractBundleUrls(html, baseUrl);
  const results: string[] = [];
  for (const bundleUrl of bundleUrls) {
    try {
      const res = await fetch(bundleUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const js = await res.text();
      console.log(`[crawler] Bundle ${bundleUrl}: ${js.length} chars`);
      const extracted = extractStringsFromBundle(js);
      if (extracted.length > 50) results.push(extracted);
    } catch (e: any) {
      console.warn(`[crawler] Bundle erreur:`, e?.message);
    }
  }
  return results.join("\n\n").slice(0, 25000);
}

// ---------------------------------------------------------------------------
// Découverte COMPLÈTE de toutes les pages
// ---------------------------------------------------------------------------

function discoverAllLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();

  for (const m of html.matchAll(/href\s*=\s*["']([^"'#][^"']*?)["']/gi)) {
    try {
      const link = new URL(m[1], baseUrl);
      if (
        (link.protocol === "http:" || link.protocol === "https:") &&
        link.hostname === base.hostname
      ) {
        link.hash = "";
        const str = link.toString();
        // Exclure les fichiers statiques
        if (!str.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|woff|woff2|ttf|ico|xml|txt)(\?|$)/i)) {
          links.add(str);
        }
      }
    } catch {}
  }

  return [...links].filter((l) => l !== baseUrl);
}

async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.php", "/sitemap"]) {
    try {
      const res = await fetch(new URL(path, baseUrl).toString(), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
        .map((m) => m[1].trim())
        .filter((u) => u.startsWith("http"));
      if (urls.length > 0) {
        console.log(`[crawler] Sitemap: ${urls.length} URLs trouvées`);
        return urls;
      }
    } catch { continue; }
  }
  return [];
}

// Pages prioritaires selon le type de site
const PRIORITY_PATHS_ECOMMERCE = [
  "/collections", "/collections/all", "/products", "/catalogue",
  "/boutique", "/shop", "/about", "/a-propos", "/contact",
  "/pages/contact", "/pages/about", "/pages/faq", "/faq",
  "/livraison", "/pages/livraison", "/pages/shipping",
  "/retours", "/pages/retours", "/garanties",
  "/collections/vetements", "/collections/accessories",
  "/collections/nouveautes", "/collections/soldes",
];

const PRIORITY_PATHS_GENERAL = [
  "/services", "/tarifs", "/prix", "/pricing", "/contact",
  "/a-propos", "/about", "/equipe", "/team", "/portfolio",
  "/faq", "/livraison", "/garanties", "/produits",
  "/blog", "/actualites",
];

// ---------------------------------------------------------------------------
// Fetch d'une page avec retry
// ---------------------------------------------------------------------------

async function fetchPageFull(url: string): Promise<Page> {
  try {
    if (!isPublicHttpUrl(url).ok) throw new Error("URL interne");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const title =
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
      new URL(url).pathname;

    const content = extractPageContent(html, url);

    if (content.length > 30) {
      return { url, title, text: content.slice(0, 10000), status: "done" };
    }

    return { url, title, text: "", status: "failed" };
  } catch {
    return {
      url,
      title: (() => { try { return new URL(url).pathname; } catch { return url; } })(),
      text: "",
      status: "failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Crawl récursif multi-pages
// ---------------------------------------------------------------------------

async function crawlSite(rootUrl: string, rootHtml: string, isSPA: boolean): Promise<Page[]> {
  const visited = new Set<string>([rootUrl]);
  const queue: string[] = [];
  const pages: Page[] = [];

  // Détection Shopify
  const isShopify = rootHtml.includes("cdn.shopify.com") || rootHtml.includes("Shopify.theme");
  const isWooCommerce = rootHtml.includes("woocommerce") || rootHtml.includes("wc-");

  console.log(`[crawler] Type détecté: Shopify=${isShopify}, WooCommerce=${isWooCommerce}, SPA=${isSPA}`);

  if (isSPA) {
    // SPA : extraction bundle JS + pages prioritaires
    const bundleContent = await extractFromJsBundle(rootHtml, rootUrl);
    const htmlMeta = extractPageContent(rootHtml, rootUrl);
    const combined = [htmlMeta, bundleContent].filter(Boolean).join("\n\n");

    if (combined.length > 50) {
      const title = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
      pages.push({ url: rootUrl, title, text: combined.slice(0, 25000), status: "done" });
    }

    // Essaie quand même quelques pages courantes
    const tryPaths = [...PRIORITY_PATHS_GENERAL, ...PRIORITY_PATHS_ECOMMERCE].slice(0, 8);
    const extraPages = await Promise.all(
      tryPaths.map((p) => {
        try { return fetchPageFull(new URL(p, rootUrl).toString()); } catch { return Promise.resolve(null); }
      })
    );
    for (const p of extraPages) {
      if (p && p.status === "done") pages.push(p);
    }

    return pages;
  }

  // ── Sites normaux : crawl récursif ────────────────────────────────────────

  // Page racine
  const rootPage = await fetchPageFull(rootUrl);
  if (rootPage.status === "done") pages.push(rootPage);

  // Collecte tous les liens depuis la home
  const homeLinks = discoverAllLinks(rootHtml, rootUrl);

  // Sitemap pour avoir TOUTES les URLs
  const sitemapLinks = await discoverViaSitemap(rootUrl);

  // Pages prioritaires selon le type
  const priorityPaths = isShopify || isWooCommerce
    ? PRIORITY_PATHS_ECOMMERCE
    : PRIORITY_PATHS_GENERAL;
  const priorityLinks = priorityPaths.map((p) => {
    try { return new URL(p, rootUrl).toString(); } catch { return ""; }
  }).filter(Boolean);

  // Fusionner et dédupliquer — priorité aux pages importantes
  const allLinks = [...new Set([
    ...priorityLinks,
    ...sitemapLinks,
    ...homeLinks,
  ])].filter((l) => !visited.has(l));

  // Score de priorité pour chaque lien
  const scoredLinks = allLinks.map((link) => {
    let score = 0;
    const path = new URL(link).pathname.toLowerCase();

    // Pages très importantes
    if (/contact|about|a-propos|faq|services|tarif|prix|livraison|garantie/.test(path)) score += 100;
    // E-commerce
    if (/collection|product|boutique|shop|catalogue|categorie/.test(path)) score += 80;
    // Contenu
    if (/blog|article|actualite|portfolio/.test(path)) score += 40;
    // Pages profondes (moins prioritaires)
    const depth = path.split("/").filter(Boolean).length;
    score -= depth * 5;
    // Favorise les pages avec des mots-clés dans le sitemap
    if (sitemapLinks.includes(link)) score += 20;

    return { link, score };
  });

  // Trier par score et prendre les MAX_PAGES meilleures
  scoredLinks.sort((a, b) => b.score - a.score);
  queue.push(...scoredLinks.slice(0, MAX_PAGES - 1).map((s) => s.link));

  console.log(`[crawler] Queue: ${queue.length} pages à visiter`);

  // Crawl en parallèle par batch de 5
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const batch = queue.splice(0, 5).filter((u) => !visited.has(u));
    batch.forEach((u) => visited.add(u));

    const results = await Promise.all(batch.map(fetchPageFull));

    for (const page of results) {
      if (page.status === "done" && page.text.length > 30) {
        pages.push(page);
        console.log(`[crawler] ✅ ${page.url} (${page.text.length} chars)`);
      }
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Synthèse IA
// ---------------------------------------------------------------------------

const ALLOWED_CATEGORIES = [
  "services", "tarifs", "livraison", "garanties", "contact", "faq", "general",
];

async function synthesizeWithGemini(
  pages: Page[],
  siteUrl: string,
  apiKey: string,
  preferredModel?: string
) {
  // Résumé de chaque page pour Gemini
  const dossier = pages
    .filter((p) => p.status === "done")
    .map((p) => `\n=== PAGE: ${p.title} ===\nURL: ${p.url}\n${p.text.slice(0, 4000)}`)
    .join("\n")
    .slice(0, 35000);

  const prompt = `Tu es un assistant qui construit une base de connaissances complète pour un chatbot à partir du contenu d'un site web.

Site : ${siteUrl}
Nombre de pages analysées : ${pages.filter(p => p.status === "done").length}

RETOURNE UNIQUEMENT un JSON valide (sans markdown) :
{
  "businessName": "",
  "businessCategory": "",
  "businessDescription": "",
  "phone": "",
  "email": "",
  "whatsapp": "",
  "address": "",
  "contactLinks": [],
  "deliveryInfo": "",
  "paymentMethods": "",
  "openingHours": "",
  "socialMedia": "",
  "siteType": "vitrine" | "ecommerce" | "service" | "restaurant" | "portfolio",
  "confidence": 0,
  "knowledgeNotes": [
    {
      "title": "",
      "category": "services" | "tarifs" | "livraison" | "garanties" | "contact" | "faq" | "general",
      "content": ""
    }
  ]
}

RÈGLES :
- Utilise UNIQUEMENT les informations présentes dans le contenu
- phone : numéro de téléphone principal (format original)
- whatsapp : lien wa.me complet si trouvé
- contactLinks : TOUS les liens de contact (formulaires, WhatsApp, email, réseaux)
- socialMedia : tous les réseaux sociaux avec leurs URLs complètes
- deliveryInfo : délais, zones, prix livraison
- paymentMethods : modes de paiement acceptés
- knowledgeNotes : 5 à 10 fiches détaillées couvrant :
  * Tous les services/produits avec prix si disponibles
  * Processus de commande / contact
  * Informations de livraison
  * FAQ et garanties
  * Infos de contact complètes
- confidence : 0-100 selon richesse des données trouvées
- Ne jamais inventer des données absentes

CONTENU DES ${pages.filter(p => p.status === "done").length} PAGES :
${dossier}`;

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
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const parsed = JSON.parse(
        text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()
      );
      console.log(`[crawler] ✅ Gemini: ${model}`);
      return parsed;
    } catch (e: any) {
      clearTimeout(timer);
      console.warn(`[crawler] ${model} échoué:`, e?.message);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

function fallbackFromPages(pages: Page[], siteUrl: string) {
  const good = pages.filter((p) => p.status === "done");
  const corpus = good.map((p) => p.text).join("\n");
  const phones = corpus.match(/\[TEL\] ([^\n]+)/g)?.map(m => m.replace("[TEL] ", "")) || [];
  const emails = corpus.match(/\[EMAIL\] ([^\n]+)/g)?.map(m => m.replace("[EMAIL] ", "")) || [];
  const wa = corpus.match(/\[WHATSAPP\] ([^\n]+)/)?.[1] || "";
  return {
    siteType: "vitrine" as const,
    confidence: 30,
    businessName: good[0]?.title || new URL(siteUrl).hostname,
    businessCategory: "",
    businessDescription: good[0]?.text?.slice(0, 500) || "",
    phone: phones[0] || "",
    email: emails[0] || "",
    whatsapp: wa,
    address: "",
    contactLinks: [],
    deliveryInfo: "",
    paymentMethods: "",
    openingHours: "",
    socialMedia: "",
    knowledgeNotes: good.slice(0, 5).map((p) => ({
      title: p.title,
      category: "general" as const,
      content: p.text.slice(0, 600),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fusion notes
// ---------------------------------------------------------------------------

function mergeKnowledgeNotes(existing: KnowledgeNote[], scanned: KnowledgeNote[]): KnowledgeNote[] {
  const manual = existing.filter((n) => n?.source !== "scanned");
  const seen = new Set<string>();
  const newNotes: KnowledgeNote[] = [];
  for (const note of scanned) {
    const cat = ALLOWED_CATEGORIES.includes((note.category || "").toLowerCase())
      ? note.category!.toLowerCase() : "general";
    if (seen.has(cat)) continue;
    seen.add(cat);
    newNotes.push({
      id: `scanned_${cat}_${Date.now()}`,
      title: note.title || "Information",
      category: cat,
      content: (note.content || "").trim(),
      enabled: true,
      source: "scanned",
    });
  }
  return [...manual, ...newNotes];
}

function fillIfEmpty(existing: any, newVal: any): any {
  const empty = existing === undefined || existing === null || String(existing).trim() === "";
  return empty ? newVal || "" : existing;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const body = (await context.request.json().catch(() => ({}))) as {
      url?: string;
      assistantId?: string;
    };

    if (!body.url) return json({ error: "URL is required" }, 400);

    const rawUrl = body.url.startsWith("http") ? body.url : `https://${body.url}`;
    const urlCheck = isPublicHttpUrl(rawUrl);
    if (!urlCheck.ok) return json({ error: `URL refusée : ${urlCheck.reason}` }, 400);

    const authHeader = context.request.headers.get("Authorization");
    const caller = await verifyFirebaseIdToken(context.env, authHeader);
    if (!caller) return json({ error: "Authentification requise." }, 401);

    let existingFields: Record<string, any> | null = null;
    if (body.assistantId) {
      const doc = await adminGetDocument(context.env, `assistants/${body.assistantId}`);
      if (doc.ok && doc.fields) {
        const parsed = parseFields(doc.fields);
        if (parsed.userId && parsed.userId !== caller.uid) {
          return json({ error: "Accès refusé." }, 403);
        }
        existingFields = parsed;
      }
    }

    const url = new URL(rawUrl);
    url.hash = "";
    const rootUrl = url.toString();

    const rootRes = await fetch(rootUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!rootRes.ok) return json({ error: `Site inaccessible : HTTP ${rootRes.status}` }, 502);

    const rootHtml = await rootRes.text();
    const isSPA = looksLikeEmptySPA(rootHtml);

    console.log(`[crawler] Démarrage crawl: ${rootUrl} | SPA=${isSPA}`);

    // Crawl complet
    const pages = await crawlSite(rootUrl, rootHtml, isSPA);
    const usable = pages.filter((p) => p.status === "done" && p.text.length > 30);

    console.log(`[crawler] Total: ${pages.length} pages visitées, ${usable.length} exploitables`);

    if (usable.length === 0) {
      return json({ error: "Aucun contenu accessible." }, 502);
    }

    // Synthèse IA
    let result: any;
    try {
      result = context.env.GEMINI_API_KEY
        ? await synthesizeWithGemini(usable, rootUrl, context.env.GEMINI_API_KEY, context.env.GEMINI_MODEL)
        : fallbackFromPages(usable, rootUrl);
    } catch (e: any) {
      console.error("[crawler] Gemini échoué:", e?.message);
      result = fallbackFromPages(usable, rootUrl);
    }

    // Sauvegarde
    let saved = false;
    let savedNoteCount = 0;

    if (body.assistantId) {
      const existing: KnowledgeNote[] = Array.isArray(existingFields?.knowledgeNotes)
        ? existingFields!.knowledgeNotes : [];
      const merged = mergeKnowledgeNotes(existing, result.knowledgeNotes || []);

      const update = {
        businessName: fillIfEmpty(existingFields?.businessName, result.businessName),
        businessCategory: fillIfEmpty(existingFields?.businessCategory, result.businessCategory),
        businessDescription: fillIfEmpty(existingFields?.businessDescription, result.businessDescription),
        phone: fillIfEmpty(existingFields?.phone, result.phone),
        email: fillIfEmpty(existingFields?.email, result.email),
        whatsapp: fillIfEmpty(existingFields?.whatsapp, result.whatsapp),
        address: fillIfEmpty(existingFields?.address, result.address),
        contactLinks: result.contactLinks?.length ? result.contactLinks : (existingFields?.contactLinks || []),
        deliveryInfo: fillIfEmpty(existingFields?.deliveryInfo, result.deliveryInfo),
        paymentMethods: fillIfEmpty(existingFields?.paymentMethods, result.paymentMethods),
        openingHours: fillIfEmpty(existingFields?.openingHours, result.openingHours),
        socialMedia: fillIfEmpty(existingFields?.socialMedia, result.socialMedia),
        websiteUrl: fillIfEmpty(existingFields?.websiteUrl, rootUrl),
        knowledgeNotes: merged,
        lastScanAt: new Date().toISOString(),
      };

      const write = await adminPatchDocument(context.env, `assistants/${body.assistantId}`, update);
      if (write.ok) {
        saved = true;
        savedNoteCount = merged.length;
        console.log(`[crawler] ✅ ${merged.length} notes sauvegardées`);
      } else {
        console.error("[crawler] ❌ Firestore:", write.error);
      }
    }

    return json({
      ...result,
      saved,
      savedNoteCount,
      isSPA,
      pagesVisited: pages.length,
      pagesUsable: usable.length,
      scrapingStrategy: isSPA
        ? ["Bundle JS", "Extraction strings", "Pages prioritaires"]
        : ["Crawl récursif multi-pages", "Sitemap complet", "JSON-LD", "Contenu visible"],
      scannedPages: pages.map(({ url: u, title, status }) => ({ url: u, title, status })),
    });

  } catch (err: any) {
    console.error("[crawler] erreur:", err?.message);
    return json({ error: err?.message || "Erreur interne." }, 500);
  }
}

export function onRequestGet() {
  return json({ error: "POST uniquement." }, 405);
}
