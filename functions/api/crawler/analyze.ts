/**
 * JAWEBFLOW — Crawler multi-pages universel.
 * Stratégies : HTML direct → Jina Reader (SPA) → Bundle JS (fallback)
 */

import {
  adminGetDocument,
  adminPatchDocument,
  verifyFirebaseIdToken,
  isPublicHttpUrl,
  parseFields,
} from "../../_shared/google.ts";

const FALLBACK_MODELS = ["gemini-1.5-flash-latest", "gemini-1.5-flash-8b-latest", "gemini-1.5-pro-latest"];
const GEMINI_TIMEOUT_MS = 25000;
const MAX_PAGES = 15;

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
  const hasJsRequired = /you need to enable javascript|enable javascript to run/i.test(bodyText);
  return hasJsRequired || ((hasRootDiv || hasFrameworkScript) && bodyText.length < 600);
}

// ---------------------------------------------------------------------------
// Jina Reader — PRIORITÉ pour les SPA
// ---------------------------------------------------------------------------

async function fetchViaJina(url: string): Promise<string> {
  try {
    console.log(`[jina] Fetch: ${url}`);
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "text",
        "X-No-Cache": "true",
        "X-Remove-Selector": "header,footer,nav,.cookie,.popup,.modal,.banner,.overlay",
        "X-Wait-For-Selector": "body",
        "X-Timeout": "15",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.warn(`[jina] HTTP ${res.status}`);
      return "";
    }

    const text = await res.text();
    const cleaned = text
      .replace(/^Title:.*\n/im, "")
      .replace(/^URL Source:.*\n/im, "")
      .replace(/^Published Time:.*\n/im, "")
      .replace(/^Markdown Content:\n/im, "")
      .replace(/!\[.*?\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 (lien: $2)")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log(`[jina] ✅ ${url} — ${cleaned.length} chars`);
    return cleaned.slice(0, 15000);
  } catch (e: any) {
    console.warn(`[jina] Erreur ${url}:`, e?.message);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Extraction HTML standard (sites normaux)
// ---------------------------------------------------------------------------

function extractPageContent(html: string, url: string): string {
  const parts: string[] = [];

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) parts.push(`Titre: ${title}`);

  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  if (desc) parts.push(`Description: ${desc.trim()}`);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogDesc && ogDesc !== desc) parts.push(`Description: ${ogDesc.trim()}`);

  const keywords = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (keywords) parts.push(`Mots-clés: ${keywords.trim()}`);

  // JSON-LD
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];

      for (const item of items) {
        const type = String(item["@type"] || "");

        if (item.name) parts.push(`Nom: ${item.name}`);
        if (item.description) parts.push(`Description: ${String(item.description).slice(0, 500)}`);
        if (item.telephone) parts.push(`Téléphone: ${item.telephone}`);
        if (item.email) parts.push(`Email: ${item.email}`);
        if (item.priceRange) parts.push(`Gamme de prix: ${item.priceRange}`);
        if (item.paymentAccepted) parts.push(`Paiement: ${item.paymentAccepted}`);
        if (item.currenciesAccepted) parts.push(`Devise: ${item.currenciesAccepted}`);
        if (item.areaServed) parts.push(`Zone: ${typeof item.areaServed === "string" ? item.areaServed : JSON.stringify(item.areaServed)}`);

        if (item.address) {
          const a = item.address;
          const addr = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, a.addressCountry]
            .filter(Boolean).join(", ");
          if (addr) parts.push(`Adresse: ${addr}`);
        }

        if (item.openingHours) {
          const h = Array.isArray(item.openingHours) ? item.openingHours.join(", ") : item.openingHours;
          parts.push(`Horaires: ${h}`);
        }

        if (Array.isArray(item.sameAs) && item.sameAs.length) {
          parts.push(`Réseaux sociaux: ${item.sameAs.join(", ")}`);
        }

        if (/product/i.test(type)) {
          if (item.sku) parts.push(`Référence: ${item.sku}`);
          if (item.brand?.name) parts.push(`Marque: ${item.brand.name}`);
          if (item.category) parts.push(`Catégorie: ${item.category}`);
          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const o of offers.slice(0, 20)) {
              const price = o.price ?? o.lowPrice;
              const currency = o.priceCurrency || "";
              const avail = o.availability?.split("/").pop() || "";
              if (price !== undefined) parts.push(`Prix: ${price} ${currency}${avail ? ` (${avail})` : ""}`);
            }
          }
          if (item.aggregateRating) {
            parts.push(`Note: ${item.aggregateRating.ratingValue}/5 (${item.aggregateRating.reviewCount || 0} avis)`);
          }
        }

        if (/itemlist/i.test(type) && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement.slice(0, 30)) {
            const elName = el.name || el.item?.name;
            const elUrl = el.url || el.item?.url;
            if (elName) parts.push(`Élément: ${elName}${elUrl ? ` — ${elUrl}` : ""}`);
          }
        }

        if (/faqpage/i.test(type) && Array.isArray(item.mainEntity)) {
          for (const faq of item.mainEntity.slice(0, 20)) {
            if (faq.name && faq.acceptedAnswer?.text) {
              parts.push(`FAQ: Q: ${faq.name}\nR: ${String(faq.acceptedAnswer.text).slice(0, 400)}`);
            }
          }
        }

        if (/article|blogposting/i.test(type)) {
          if (item.headline) parts.push(`Article: ${item.headline}`);
          if (item.articleBody) parts.push(String(item.articleBody).slice(0, 600));
        }
      }
    } catch {}
  }

  // Shopify
  const shopifyCurrency = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([^"]+)"/i)?.[1];
  if (shopifyCurrency) parts.push(`Devise: ${shopifyCurrency}`);

  const shopifyProductJson = html.match(
    /<script[^>]+type=["']application\/json["'][^>]+data-product-json[^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (shopifyProductJson) {
    try {
      const prod = JSON.parse(shopifyProductJson);
      if (prod.title) parts.push(`Produit: ${prod.title}`);
      if (prod.description) parts.push(`Description: ${cleanHtml(prod.description).slice(0, 400)}`);
      if (prod.vendor) parts.push(`Vendeur: ${prod.vendor}`);
      if (prod.type) parts.push(`Type: ${prod.type}`);
      if (prod.tags?.length) parts.push(`Tags: ${prod.tags.join(", ")}`);
      if (prod.variants?.length) {
        for (const v of prod.variants.slice(0, 20)) {
          const price = v.price ? `${parseInt(v.price) / 100}` : "";
          const details = [v.title, price ? `${price} ${shopifyCurrency || ""}` : "", v.available ? "Disponible" : "Épuisé"]
            .filter(Boolean).join(" — ");
          if (details) parts.push(`Variante: ${details}`);
        }
      }
    } catch {}
  }

  // WooCommerce
  const wooPrices = [...html.matchAll(/<span[^>]+class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  if (wooPrices.length) {
    const prices = wooPrices.map(m => cleanHtml(m[0])).filter(p => p.length < 30).slice(0, 10);
    if (prices.length) parts.push(`Prix: ${prices.join(", ")}`);
  }

  // __NEXT_DATA__
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try {
      const nd = JSON.parse(nextData);
      const props = nd?.props?.pageProps;
      if (props) {
        const extract = (obj: any, depth = 0): void => {
          if (depth > 4 || !obj || typeof obj !== "object") return;
          for (const [key, val] of Object.entries(obj)) {
            if (["__typename", "id", "slug", "cursor", "className", "style", "key"].includes(key)) continue;
            if (typeof val === "string" && val.length > 15 && val.length < 500) {
              if (!val.match(/^[a-z\-_]+:|rgba?\(|^https?:\/\/(?!wa\.me)|[<>{}[\]]/)) {
                parts.push(`${key}: ${val}`);
              }
            } else if (typeof val === "object") {
              extract(val, depth + 1);
            }
          }
        };
        extract(props);
      }
    } catch {}
  }

  // Contenu visible
  const visible = cleanHtml(html);
  if (visible.length > 50) {
    parts.push(`\nContenu:\n${visible.slice(0, 8000)}`);
  }

  // Liens importants
  const importantLinks: string[] = [];
  for (const m of html.matchAll(/href=["']([^"'\s]+)["']/gi)) {
    const href = m[1].trim();
    if (
      href.startsWith("tel:") ||
      href.startsWith("mailto:") ||
      href.includes("wa.me") ||
      href.includes("whatsapp.com") ||
      href.includes("instagram.com") ||
      href.includes("facebook.com") ||
      href.includes("tiktok.com") ||
      href.includes("youtube.com") ||
      href.includes("linkedin.com") ||
      href.includes("twitter.com") ||
      href.includes("x.com") ||
      href.includes("snapchat.com") ||
      href.includes("typeform.com") ||
      href.includes("tally.so") ||
      href.includes("calendly.com") ||
      href.includes("forms.gle") ||
      href.includes("t.me")
    ) {
      importantLinks.push(href);
    }
  }
  if (importantLinks.length) {
    parts.push(`Liens contact: ${[...new Set(importantLinks)].join(" | ")}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Découverte de liens
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
        if (!str.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|woff|woff2|ttf|ico|xml|txt|mp4|mp3|mov)(\?|$)/i)) {
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
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const xml = await res.text();

      if (xml.includes("<sitemapindex")) {
        const childUrl = xml.match(/<loc>([^<]+sitemap[^<]*)<\/loc>/i)?.[1];
        if (childUrl) {
          try {
            const childRes = await fetch(childUrl, { signal: AbortSignal.timeout(5000) });
            if (childRes.ok) {
              const childXml = await childRes.text();
              const urls = [...childXml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
                .map(m => m[1].trim()).filter(u => u.startsWith("http"));
              if (urls.length) { console.log(`[crawler] Sitemap index: ${urls.length} URLs`); return urls.slice(0, 50); }
            }
          } catch {}
        }
      }

      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
        .map(m => m[1].trim()).filter(u => u.startsWith("http"));
      if (urls.length) { console.log(`[crawler] Sitemap: ${urls.length} URLs`); return urls.slice(0, 50); }
    } catch { continue; }
  }
  return [];
}

const PRIORITY_PATHS_ECOMMERCE = [
  "/collections/all", "/collections", "/products", "/catalogue",
  "/boutique", "/shop",
  "/pages/contact", "/contact",
  "/pages/about", "/about", "/a-propos",
  "/pages/faq", "/faq",
  "/pages/livraison", "/livraison", "/pages/shipping",
  "/pages/retours", "/retours",
  "/pages/garanties", "/garanties",
  "/pages/paiement",
];

const PRIORITY_PATHS_GENERAL = [
  "/services", "/nos-services",
  "/tarifs", "/prix", "/pricing",
  "/contact", "/nous-contacter",
  "/a-propos", "/about", "/qui-sommes-nous",
  "/equipe", "/team",
  "/portfolio", "/realisations",
  "/faq",
  "/livraison", "/garanties",
  "/produits", "/nos-produits",
  "/blog", "/actualites",
];

// ---------------------------------------------------------------------------
// Fetch d'une page HTML standard
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
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(url).pathname;

    // Si c'est une SPA, on ignore (sera géré par Jina)
    if (looksLikeEmptySPA(html)) {
      return { url, title, text: "", status: "failed" };
    }

    const content = extractPageContent(html, url);

    if (content.length > 30) {
      return { url, title, text: content.slice(0, 12000), status: "done" };
    }

    return { url, title, text: "", status: "failed" };
  } catch {
    return {
      url,
      title: (() => { try { return new URL(url).pathname || url; } catch { return url; } })(),
      text: "",
      status: "failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Crawl principal
// ---------------------------------------------------------------------------

async function crawlSite(rootUrl: string, rootHtml: string, isSPA: boolean): Promise<{ pages: Page[]; strategy: string[] }> {
  const pages: Page[] = [];
  const visited = new Set<string>([rootUrl]);

  const isShopify = rootHtml.includes("cdn.shopify.com") || rootHtml.includes("Shopify.theme") || rootHtml.includes("shopify");
  const isWooCommerce = rootHtml.includes("woocommerce") || rootHtml.includes("wc-add-to-cart");

  console.log(`[crawler] Shopify=${isShopify} WooCommerce=${isWooCommerce} SPA=${isSPA}`);

  // ── SPA : Jina Reader en priorité absolue ─────────────────────────────────
  if (isSPA) {
    console.log(`[crawler] SPA → Jina Reader`);
    const strategy: string[] = ["Jina Reader (rendu JS complet)"];

    // Page principale via Jina
    const rootJina = await fetchViaJina(rootUrl);
    const rootTitle = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;

    if (rootJina.length > 100) {
      pages.push({ url: rootUrl, title: rootTitle, text: rootJina, status: "done" });
      console.log(`[crawler] Jina racine OK: ${rootJina.length} chars`);

      // Pages supplémentaires via Jina en parallèle
      const extraPaths = isShopify ? PRIORITY_PATHS_ECOMMERCE : PRIORITY_PATHS_GENERAL;
      strategy.push("Pages prioritaires via Jina");

      const jinaResults = await Promise.all(
        extraPaths.slice(0, 6).map(async (p) => {
          try {
            const pageUrl = new URL(p, rootUrl).toString();
            if (visited.has(pageUrl)) return null;
            visited.add(pageUrl);
            const text = await fetchViaJina(pageUrl);
            if (text.length > 100) {
              return { url: pageUrl, title: p.replace("/", "").replace(/-/g, " "), text, status: "done" as const };
            }
          } catch {}
          return null;
        })
      );

      for (const p of jinaResults) {
        if (p) pages.push(p);
      }
    } else {
      // Jina échoué → message clair
      console.warn(`[crawler] Jina échoué pour ${rootUrl} (${rootJina.length} chars)`);
      if (rootJina.length > 0) {
        pages.push({ url: rootUrl, title: rootTitle, text: rootJina, status: "done" });
      }
    }

    return { pages, strategy };
  }

  // ── Sites normaux : crawl HTML récursif ──────────────────────────────────
  const strategy = ["Crawl HTML récursif", "Sitemap", "JSON-LD", "Contenu visible"];

  // Page racine
  const rootContent = extractPageContent(rootHtml, rootUrl);
  const rootTitle = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
  if (rootContent.length > 30) {
    pages.push({ url: rootUrl, title: rootTitle, text: rootContent.slice(0, 12000), status: "done" });
    console.log(`[crawler] ✅ Racine: ${rootContent.length} chars`);
  }

  // Sitemap
  const sitemapLinks = await discoverViaSitemap(rootUrl);

  // Liens depuis la home
  const homeLinks = discoverAllLinks(rootHtml, rootUrl);

  // Pages prioritaires
  const priorityPaths = isShopify || isWooCommerce ? PRIORITY_PATHS_ECOMMERCE : PRIORITY_PATHS_GENERAL;
  const priorityLinks = priorityPaths.map((p) => {
    try { return new URL(p, rootUrl).toString(); } catch { return ""; }
  }).filter(Boolean);

  // Fusion et scoring
  const allCandidates = [...new Set([...priorityLinks, ...sitemapLinks, ...homeLinks])]
    .filter((l) => !visited.has(l));

  const scored = allCandidates.map((link) => {
    let score = 0;
    const path = new URL(link).pathname.toLowerCase();
    if (/contact|about|a-propos|faq|services?|tarif|prix|livraison|garantie|shipping|return|retour/.test(path)) score += 100;
    if (/collection|product|boutique|shop|catalogue|categorie/.test(path)) score += 80;
    if (/\/pages\//.test(path)) score += 60;
    if (/blog|article|actualite|news|portfolio/.test(path)) score += 30;
    score -= (path.split("/").filter(Boolean).length) * 5;
    if (sitemapLinks.includes(link)) score += 15;
    return { link, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const queue = scored.slice(0, MAX_PAGES - 1).map((s) => s.link);

  console.log(`[crawler] Queue: ${queue.length} pages`);

  // Crawl par batch de 5
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const batch = queue.splice(0, 5).filter((u) => !visited.has(u));
    if (!batch.length) continue;
    batch.forEach((u) => visited.add(u));

    const results = await Promise.all(batch.map(fetchPageFull));
    for (const page of results) {
      if (page.status === "done" && page.text.length > 30) {
        pages.push(page);
        console.log(`[crawler] ✅ ${page.url} (${page.text.length} chars)`);
      }
    }
  }

  return { pages, strategy };
}

// ---------------------------------------------------------------------------
// Synthèse Gemini
// ---------------------------------------------------------------------------

const ALLOWED_CATEGORIES = ["services", "tarifs", "livraison", "garanties", "contact", "faq", "general"];

async function synthesizeWithGemini(pages: Page[], siteUrl: string, apiKey: string, preferredModel?: string) {
  const usable = pages.filter(p => p.status === "done");

  const dossier = usable
    .sort((a, b) => {
      const score = (u: string) => /contact|about|faq|service|tarif|livraison|collection|product|pages/.test(u) ? 1 : 0;
      return score(b.url) - score(a.url);
    })
    .map(p => `\n=== ${p.title} ===\nURL: ${p.url}\n${p.text.slice(0, 3500)}`)
    .join("\n")
    .slice(0, 35000);

  const prompt = `Tu es un expert en extraction de données commerciales pour alimenter un chatbot.

Site : ${siteUrl}
Pages analysées : ${usable.length}

RETOURNE UNIQUEMENT un JSON valide sans markdown :
{
  "businessName": "nom de la marque/entreprise",
  "businessCategory": "secteur précis",
  "businessDescription": "description complète 3-5 phrases",
  "phone": "numéro principal",
  "email": "email principal",
  "whatsapp": "lien wa.me complet",
  "address": "adresse complète",
  "contactLinks": ["lien1", "lien2"],
  "deliveryInfo": "délais, zones, prix, conditions",
  "paymentMethods": "modes de paiement",
  "openingHours": "horaires",
  "socialMedia": "réseaux avec URLs",
  "siteType": "vitrine|ecommerce|service|restaurant|portfolio",
  "confidence": 75,
  "knowledgeNotes": [
    {"title": "...", "category": "services|tarifs|livraison|garanties|contact|faq|general", "content": "..."}
  ]
}

RÈGLES :
- Utilise UNIQUEMENT les infos présentes dans le contenu
- Ne jamais inventer — champ vide si absent
- knowledgeNotes : 6-12 fiches couvrant tous les aspects trouvés
- Pour e-commerce : produits, prix, variantes, livraison, retours
- Pour services : chaque service avec prix si mentionné
- contactLinks : TOUS les liens de contact trouvés
- confidence : 0-100 selon richesse des données

CONTENU (${usable.length} pages) :
${dossier}`;

  const models = Array.from(new Set([preferredModel, ...FALLBACK_MODELS].filter(Boolean))) as string[];

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
            generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 4096 },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (res.status === 429) { console.warn(`[crawler] ${model}: quota`); continue; }
      if (!res.ok) { console.warn(`[crawler] ${model}: HTTP ${res.status}`); continue; }

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { console.warn(`[crawler] ${model}: vide`); continue; }

      const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
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
  const good = pages.filter(p => p.status === "done");
  const corpus = good.map(p => p.text).join("\n");
  const phones = corpus.match(/Téléphone:\s*([^\n,|]+)/g)?.map(m => m.replace(/Téléphone:\s*/, "").trim()) || [];
  const emails = corpus.match(/Email:\s*([^\n,|]+)/g)?.map(m => m.replace(/Email:\s*/, "").trim()) || [];
  const wa = corpus.match(/WhatsApp:\s*(https:\/\/wa\.me\/[^\s,|]+)/)?.[1] || "";
  const socials = corpus.match(/Réseaux sociaux:\s*([^\n]+)/)?.[1] || "";
  return {
    siteType: /prix|produit|panier|boutique|shop|cart/i.test(corpus) ? "ecommerce" : "vitrine",
    confidence: 30,
    businessName: good[0]?.title || new URL(siteUrl).hostname,
    businessCategory: "",
    businessDescription: good[0]?.text?.slice(0, 400) || "",
    phone: phones[0] || "",
    email: emails[0] || "",
    whatsapp: wa,
    address: "",
    contactLinks: [wa, ...emails.map(e => `mailto:${e}`)].filter(Boolean),
    deliveryInfo: "",
    paymentMethods: "",
    openingHours: "",
    socialMedia: socials,
    knowledgeNotes: good.slice(0, 5).map(p => ({
      title: p.title,
      category: /contact/i.test(p.url) ? "contact" : /faq/i.test(p.url) ? "faq" : /livraison|shipping/i.test(p.url) ? "livraison" : /tarif|prix/i.test(p.url) ? "tarifs" : /service|produit|collection/i.test(p.url) ? "services" : "general",
      content: p.text.slice(0, 600),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fusion notes
// ---------------------------------------------------------------------------

function mergeKnowledgeNotes(existing: KnowledgeNote[], scanned: KnowledgeNote[]): KnowledgeNote[] {
  const manual = existing.filter(n => n?.source !== "scanned");
  const seen = new Set<string>();
  const newNotes: KnowledgeNote[] = [];
  for (const note of scanned) {
    const cat = ALLOWED_CATEGORIES.includes((note.category || "").toLowerCase()) ? note.category!.toLowerCase() : "general";
    if (seen.has(cat)) continue;
    seen.add(cat);
    newNotes.push({ id: `scanned_${cat}_${Date.now()}`, title: note.title || "Information", category: cat, content: (note.content || "").trim(), enabled: true, source: "scanned" });
  }
  return [...manual, ...newNotes];
}

function fillIfEmpty(existing: any, newVal: any): any {
  return (existing === undefined || existing === null || String(existing).trim() === "") ? (newVal ?? "") : existing;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function onRequestPost(context: { request: Request; env: any }) {
  try {
    const body = (await context.request.json().catch(() => ({}))) as { url?: string; assistantId?: string };
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
        if (parsed.userId && parsed.userId !== caller.uid) return json({ error: "Accès refusé." }, 403);
        existingFields = parsed;
      }
    }

    const url = new URL(rawUrl);
    url.hash = "";
    const rootUrl = url.toString();

    const rootRes = await fetch(rootUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!rootRes.ok) return json({ error: `Site inaccessible : HTTP ${rootRes.status}` }, 502);

    const rootHtml = await rootRes.text();
    const isSPA = looksLikeEmptySPA(rootHtml);

    console.log(`[crawler] ▶ ${rootUrl} | SPA=${isSPA}`);

    const { pages, strategy } = await crawlSite(rootUrl, rootHtml, isSPA);
    const usable = pages.filter(p => p.status === "done" && p.text.length > 30);

    console.log(`[crawler] ${pages.length} visitées, ${usable.length} exploitables`);

if (usable.length === 0) {
  const title = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
  const desc =
    rootHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    rootHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    "";

  console.warn(`[crawler] Aucun contenu exploitable — fallback métadonnées HTML`);

  return json({
    businessName: title,
    businessCategory: "",
    businessDescription: desc,
    phone: "",
    email: "",
    whatsapp: "",
    address: "",
    contactLinks: [],
    deliveryInfo: "",
    paymentMethods: "",
    openingHours: "",
    socialMedia: "",
    siteType: "vitrine",
    confidence: 5,
    knowledgeNotes: desc ? [{ title, category: "general", content: desc }] : [],
    saved: false,
    savedNoteCount: 0,
    isSPA,
    pagesVisited: pages.length,
    pagesUsable: 0,
    warning: "Ce site bloque les crawlers automatiques. Complétez vos informations manuellement via 'Ajouter une Note'.",
    scrapingStrategy: strategy,
    scannedPages: [],
  });
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
      const existing: KnowledgeNote[] = Array.isArray(existingFields?.knowledgeNotes) ? existingFields!.knowledgeNotes : [];
      const merged = mergeKnowledgeNotes(existing, result.knowledgeNotes || []);

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
      scrapingStrategy: strategy,
      scannedPages: pages.map(({ url: u, title, status }) => ({ url: u, title, status })),
    });

  } catch (err: any) {
    console.error("[crawler] Erreur:", err?.message);
    return json({ error: err?.message || "Erreur interne." }, 500);
  }
}

export function onRequestGet() {
  return json({ error: "POST uniquement." }, 405);
}
