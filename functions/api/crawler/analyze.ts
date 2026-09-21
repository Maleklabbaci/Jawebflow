/**
 * JAWEBFLOW — Scanner de site web (Cloudflare Pages Function).
 * Extraction universelle : HTML statique, SPA, e-commerce, JSON-LD, sitemap.
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
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|dt|dd|main|header|footer|nav)>/gi, "\n")
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
    /\/_next\/|\/assets\/index-|vite|react-dom|\.chunk\.js|__nuxt/i.test(html);
  return (hasRootDiv || hasFrameworkScript) && bodyText.length < 500;
}

// ---------------------------------------------------------------------------
// Extraction universelle (SPA + e-commerce + JSON-LD)
// ---------------------------------------------------------------------------

function extractAllMeta(html: string, url: string): string {
  const parts: string[] = [];

  // ── Balises de base ──────────────────────────────────────────────────────
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) parts.push(`Titre : ${title}`);

  const metaPatterns: [string, string][] = [
    ["description", "Description"],
    ["keywords", "Mots-clés"],
    ["author", "Auteur"],
    ["robots", "Robots"],
  ];
  for (const [name, label] of metaPatterns) {
    const val =
      html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"))?.[1];
    if (val) parts.push(`${label} : ${val.trim()}`);
  }

  // ── Open Graph ───────────────────────────────────────────────────────────
  const ogTags: [string, string][] = [
    ["og:title", "Titre"],
    ["og:description", "Description"],
    ["og:site_name", "Nom du site"],
    ["og:type", "Type"],
    ["og:locale", "Langue"],
    ["og:price:amount", "Prix"],
    ["og:price:currency", "Devise"],
    ["product:price:amount", "Prix produit"],
    ["product:brand", "Marque"],
    ["product:availability", "Disponibilité"],
  ];
  for (const [prop, label] of ogTags) {
    const val =
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"))?.[1];
    if (val) parts.push(`${label} (OG) : ${val.trim()}`);
  }

  // ── Twitter Cards ────────────────────────────────────────────────────────
  const twTags: [string, string][] = [
    ["twitter:title", "Titre Twitter"],
    ["twitter:description", "Description Twitter"],
    ["twitter:site", "Compte Twitter"],
  ];
  for (const [name, label] of twTags) {
    const val =
      html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"))?.[1];
    if (val) parts.push(`${label} : ${val.trim()}`);
  }

  // ── JSON-LD Structured Data (source la plus riche pour e-commerce) ───────
  const jsonLdBlocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const block of jsonLdBlocks) {
    try {
      const raw = JSON.parse(block[1]);
      const items = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];

      for (const item of items) {
        const type = item["@type"] || "";

        // Infos communes
        if (item.name) parts.push(`Nom : ${item.name}`);
        if (item.description) parts.push(`Description : ${item.description}`);
        if (item.telephone) parts.push(`Téléphone : ${item.telephone}`);
        if (item.email) parts.push(`Email : ${item.email}`);
        if (item.url) parts.push(`URL : ${item.url}`);
        if (item.priceRange) parts.push(`Gamme de prix : ${item.priceRange}`);
        if (item.currenciesAccepted) parts.push(`Devises acceptées : ${item.currenciesAccepted}`);
        if (item.paymentAccepted) parts.push(`Paiements acceptés : ${item.paymentAccepted}`);
        if (item.openingHours) {
          const hours = Array.isArray(item.openingHours)
            ? item.openingHours.join(", ")
            : item.openingHours;
          parts.push(`Horaires : ${hours}`);
        }

        // Adresse
        if (item.address) {
          const addr = item.address;
          const addrParts = [
            addr.streetAddress,
            addr.postalCode,
            addr.addressLocality,
            addr.addressCountry,
          ].filter(Boolean);
          if (addrParts.length) parts.push(`Adresse : ${addrParts.join(", ")}`);
        }

        // Produit / E-commerce
        if (/product/i.test(type)) {
          if (item.sku) parts.push(`SKU : ${item.sku}`);
          if (item.brand?.name) parts.push(`Marque : ${item.brand.name}`);
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const offer of offers.slice(0, 5)) {
              const price = offer.price || offer.lowPrice;
              const currency = offer.priceCurrency || "DZD";
              const availability = offer.availability?.replace(/.*\//, "") || "";
              if (price) parts.push(`Prix : ${price} ${currency} ${availability}`);
            }
          }
          if (item.aggregateRating) {
            parts.push(
              `Note : ${item.aggregateRating.ratingValue}/5 (${item.aggregateRating.reviewCount} avis)`
            );
          }
        }

        // FAQ
        if (/faqpage/i.test(type) && Array.isArray(item.mainEntity)) {
          for (const faq of item.mainEntity.slice(0, 10)) {
            if (faq.name && faq.acceptedAnswer?.text) {
              parts.push(`FAQ — ${faq.name} : ${faq.acceptedAnswer.text.slice(0, 300)}`);
            }
          }
        }

        // BreadcrumbList → structure du site
        if (/breadcrumb/i.test(type) && Array.isArray(item.itemListElement)) {
          const crumbs = item.itemListElement
            .map((c: any) => c.name || c.item?.name)
            .filter(Boolean);
          if (crumbs.length) parts.push(`Navigation : ${crumbs.join(" > ")}`);
        }

        // Organization / LocalBusiness
        if (/organization|localbusiness|store/i.test(type)) {
          if (item.foundingDate) parts.push(`Fondé en : ${item.foundingDate}`);
          if (item.numberOfEmployees?.value)
            parts.push(`Employés : ${item.numberOfEmployees.value}`);
          if (Array.isArray(item.sameAs))
            parts.push(`Réseaux sociaux : ${item.sameAs.join(", ")}`);
          if (item.hasMap) parts.push(`Carte : ${item.hasMap}`);
          if (item.servesCuisine) parts.push(`Cuisine : ${item.servesCuisine}`);
          if (item.menu) parts.push(`Menu : ${item.menu}`);
          if (item.areaServed) parts.push(`Zone desservie : ${item.areaServed}`);
        }

        // Review / Avis
        if (/review/i.test(type)) {
          if (item.reviewBody)
            parts.push(`Avis : ${item.reviewBody.slice(0, 200)}`);
        }
      }
    } catch {
      /* JSON-LD invalide */
    }
  }

  // ── __NEXT_DATA__ (Next.js) ──────────────────────────────────────────────
  const nextData = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (nextData) {
    try {
      const nd = JSON.parse(nextData);
      const props = nd?.props?.pageProps;
      if (props) {
        const extractStrings = (obj: any, depth = 0, prefix = ""): void => {
          if (depth > 4 || !obj || typeof obj !== "object") return;
          for (const [key, val] of Object.entries(obj)) {
            if (["__typename", "id", "slug", "cursor"].includes(key)) continue;
            if (typeof val === "string" && val.length > 10 && val.length < 800) {
              parts.push(`${prefix}${key} : ${val}`);
            } else if (typeof val === "number" && key.toLowerCase().includes("price")) {
              parts.push(`${prefix}${key} : ${val}`);
            } else if (typeof val === "object") {
              extractStrings(val, depth + 1, `${key}.`);
            }
          }
        };
        extractStrings(props);
      }
    } catch {
      /* invalide */
    }
  }

  // ── Nuxt / Vue (__NUXT_DATA__) ───────────────────────────────────────────
  const nuxtData = html.match(
    /<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (nuxtData) {
    try {
      const strings = JSON.parse(nuxtData)
        .filter((v: any) => typeof v === "string" && v.length > 10 && v.length < 500);
      if (strings.length) parts.push(`Données Nuxt : ${strings.slice(0, 20).join(" | ")}`);
    } catch {
      /* invalide */
    }
  }

  // ── Shopify (window.ShopifyAnalytics / meta[name="shopify-..."] ) ────────
  const shopifyMeta = html.match(/Shopify\.shop\s*=\s*["']([^"']+)["']/i)?.[1];
  if (shopifyMeta) parts.push(`Boutique Shopify : ${shopifyMeta}`);

  const shopifyCurrency = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([^"]+)"/i)?.[1];
  if (shopifyCurrency) parts.push(`Devise Shopify : ${shopifyCurrency}`);

  // Produits Shopify dans le HTML
  const shopifyProductJson = html.match(
    /<script[^>]+type=["']application\/json["'][^>]+data-product-json[^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (shopifyProductJson) {
    try {
      const prod = JSON.parse(shopifyProductJson);
      if (prod.title) parts.push(`Produit Shopify : ${prod.title}`);
      if (prod.description) parts.push(`Description produit : ${prod.description.slice(0, 400)}`);
      if (prod.variants?.length) {
        const prices = prod.variants.map((v: any) => v.price).filter(Boolean);
        if (prices.length) parts.push(`Prix variants : ${prices.join(", ")}`);
      }
    } catch {
      /* invalide */
    }
  }

  // ── WooCommerce (données dans le HTML) ───────────────────────────────────
  const wooPrice = html.match(/<span class=["']woocommerce-Price-amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi);
  if (wooPrice?.length) {
    const prices = wooPrice
      .map((p) => cleanHtml(p))
      .filter((p) => p.length < 30)
      .slice(0, 5);
    if (prices.length) parts.push(`Prix WooCommerce : ${prices.join(", ")}`);
  }

  // ── Données de contact dans le texte visible ─────────────────────────────
  const visibleText = cleanHtml(html);
  const phones = visibleText.match(
    /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g
  ) || [];
  const validPhones = phones
    .filter((p) => p.replace(/\D/g, "").length >= 8)
    .slice(0, 3);
  if (validPhones.length) parts.push(`Téléphones détectés : ${validPhones.join(", ")}`);

  const emails = visibleText.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
  if (emails.length) parts.push(`Emails détectés : [...new Set(emails)].slice(0, 3).join(", ")`);

  // ── Liens vers réseaux sociaux ───────────────────────────────────────────
  const socialNetworks = [
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com", "tiktok.com", "snapchat.com",
    "pinterest.com", "whatsapp.com",
  ];
  const socialLinks: string[] = [];
  for (const network of socialNetworks) {
    const match = html.match(new RegExp(`https?://(?:www\\.)?${network.replace(".", "\\.")}/[\\w./-]+`, "i"));
    if (match) socialLinks.push(match[0]);
  }
  if (socialLinks.length) parts.push(`Réseaux sociaux : ${socialLinks.join(", ")}`);

  // ── Texte visible (fallback si peu de métadonnées) ───────────────────────
  if (parts.length < 5 && visibleText.length > 50) {
    parts.push(`Contenu visible : ${visibleText.slice(0, 3000)}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Fetch d'une page avec extraction universelle
// ---------------------------------------------------------------------------

async function fetchPage(url: string): Promise<Page> {
  try {
    if (!isPublicHttpUrl(url).ok) throw new Error("URL interne refusée");

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const cleaned = cleanHtml(html);
    const title =
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
      new URL(url).pathname ||
      "Page";

    // Page avec contenu HTML suffisant
    if (cleaned.length > 100) {
      return { url, title, text: cleaned.slice(0, 9000), status: "done" };
    }

    // SPA ou page légère → extraction universelle
    const meta = extractAllMeta(html, url);
    if (meta.length > 30) {
      console.log(
        `[crawler] extraction meta pour ${new URL(url).pathname} (${meta.length} chars)`
      );
      return { url, title, text: meta.slice(0, 9000), status: "done" };
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
// Découverte de liens
// ---------------------------------------------------------------------------

function discoverLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const regex = /href\s*=\s*["']([^"'#?][^"']*?)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const link = new URL(match[1], baseUrl);
      if (
        (link.protocol === "http:" || link.protocol === "https:") &&
        link.hostname === base.hostname
      ) {
        link.hash = "";
        link.search = "";
        links.add(link.toString());
      }
    } catch (_) {}
  }
  return [...links]
    .filter((l) => l !== baseUrl && !l.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js)$/i))
    .slice(0, 10);
}

async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap/", "/sitemap.php"];
  for (const path of candidates) {
    try {
      const res = await fetch(new URL(path, baseUrl).toString(), {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
        .map((m) => m[1].trim())
        .filter((u) => u.startsWith("http"));
      if (urls.length > 0) return urls.slice(0, 15);
    } catch {
      continue;
    }
  }
  return [];
}

const COMMON_PATHS = [
  "/services", "/tarifs", "/prix", "/pricing", "/contact",
  "/livraison", "/faq", "/a-propos", "/about", "/produits",
  "/boutique", "/shop", "/catalogue", "/garanties", "/cgv",
  "/mentions-legales", "/equipe", "/team", "/portfolio",
];

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
  const dossier = pages
    .filter((p) => p.status === "done")
    .map((p) => `=== PAGE: ${p.title} ===\nURL: ${p.url}\n${p.text}`)
    .join("\n\n")
    .slice(0, 30000);

  const prompt = `Tu es un assistant qui extrait des informations commerciales réelles depuis le contenu d'un site web.

Site analysé : ${siteUrl}

RÈGLES STRICTES :
- Utilise UNIQUEMENT les informations présentes dans le contenu ci-dessous
- Ne complète JAMAIS avec des informations inventées
- Si une information est absente, laisse le champ vide ("")
- Pour les prix, recopie les valeurs exactes trouvées
- Pour les services, liste uniquement ce qui est mentionné

Retourne UNIQUEMENT un JSON valide (sans markdown) :
{
  "businessName": "",
  "businessCategory": "",
  "businessDescription": "",
  "phone": "",
  "email": "",
  "address": "",
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

CONTENU EXTRAIT :
${dossier}`;

  const models = Array.from(
    new Set([preferredModel, ...FALLBACK_MODELS].filter(Boolean))
  ) as string[];
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
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (response.status === 429) {
        errors.push(`${model}: quota 429`);
        continue;
      }
      if (!response.ok) {
        errors.push(`${model}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { errors.push(`${model}: vide`); continue; }

      const parsed = JSON.parse(
        text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()
      );
      console.log(`[crawler] ✅ Gemini OK avec ${model}`);
      return parsed;
    } catch (e: any) {
      clearTimeout(timer);
      errors.push(`${model}: ${e?.name === "AbortError" ? "timeout" : e?.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function fallbackFromPages(pages: Page[], siteUrl: string) {
  const good = pages.filter((p) => p.status === "done");
  const corpus = good.map((p) => p.text).join("\n");
  const phones = corpus.match(/(?:\+?\d[\d\s.-]{7,}\d)/g) || [];
  const emails = corpus.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
  return {
    siteType: /prix|produit|panier|boutique|shop|cart/i.test(corpus) ? "ecommerce" : "vitrine",
    confidence: 40,
    businessName: good[0]?.title || new URL(siteUrl).hostname,
    businessCategory: "",
    businessDescription: good[0]?.text?.slice(0, 500) || "",
    phone: phones[0] || "",
    email: emails[0] || "",
    address: "",
    deliveryInfo: "",
    paymentMethods: "",
    openingHours: "",
    socialMedia: "",
    knowledgeNotes: good.slice(0, 6).map((p) => ({
      title: p.title,
      category: "general",
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
      ? note.category!.toLowerCase()
      : "general";
    if (seen.has(cat)) continue;
    seen.add(cat);
    newNotes.push({
      id: `scanned_${cat}`,
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
// Handler
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
    if (!caller) {
      return json({ error: "Authentification requise." }, 401);
    }

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

    // Fetch racine
    const rootRes = await fetch(rootUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!rootRes.ok) return json({ error: `Site inaccessible : HTTP ${rootRes.status}` }, 502);

    const rootHtml = await rootRes.text();
    const isSPA = looksLikeEmptySPA(rootHtml);
    let links = discoverLinks(rootHtml, rootUrl);

    if (isSPA || links.length < 3) {
      const sitemap = await discoverViaSitemap(rootUrl);
      const common = COMMON_PATHS.map((p) => {
        try { return new URL(p, rootUrl).toString(); } catch { return ""; }
      }).filter(Boolean);
      links = [...new Set([...sitemap, ...common, ...links])].slice(0, 12);
    }

    const pages = [
      await fetchPage(rootUrl),
      ...(await Promise.all(links.map(fetchPage))),
    ];
    const usable = pages.filter((p) => p.status === "done" && p.text.length > 15);

    console.log(
      `[crawler] ${rootUrl} — ${pages.length} pages, ${usable.length} exploitables, SPA=${isSPA}`
    );

    if (usable.length === 0) {
      return json({
        error:
          "Aucun contenu accessible. Si votre site est une application React/Vue sans SSR, ajoutez vos informations manuellement.",
      }, 502);
    }

    let result: any;
    try {
      result = context.env.GEMINI_API_KEY
        ? await synthesizeWithGemini(usable, rootUrl, context.env.GEMINI_API_KEY, context.env.GEMINI_MODEL)
        : fallbackFromPages(usable, rootUrl);
    } catch (e: any) {
      console.error("[crawler] Gemini échoué:", e?.message);
      result = fallbackFromPages(usable, rootUrl);
    }

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
        address: fillIfEmpty(existingFields?.address, result.address),
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
