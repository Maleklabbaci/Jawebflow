/**
 * JAWEBFLOW — Crawler multi-pages universel.
 * Stratégies : HTML direct → Bundle JS → Jina Reader (fallback SPA)
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

function cleanExtractedText(text: string): string {
  return text
    .replace(/\[TITRE\]/g, "Titre:")
    .replace(/\[CONTENU VISIBLE\]/g, "")
    .replace(/\[CONTENU JS\]/g, "")
    .replace(/\[DESCRIPTION\]/g, "Description:")
    .replace(/\[OG DESC\]/g, "Description:")
    .replace(/\[NOM\]/g, "Nom:")
    .replace(/\[DESC\]/g, "Description:")
    .replace(/\[TEL\]/g, "Téléphone:")
    .replace(/\[EMAIL\]/g, "Email:")
    .replace(/\[WHATSAPP\]/g, "WhatsApp:")
    .replace(/\[RESEAUX\]/g, "Réseaux sociaux:")
    .replace(/\[PRIX\]/g, "Prix:")
    .replace(/\[PRIX RANGE\]/g, "Gamme de prix:")
    .replace(/\[ADRESSE\]/g, "Adresse:")
    .replace(/\[HORAIRES\]/g, "Horaires:")
    .replace(/\[PAIEMENT\]/g, "Paiement accepté:")
    .replace(/\[DEVISE\]/g, "Devise:")
    .replace(/\[SKU\]/g, "Référence:")
    .replace(/\[MARQUE\]/g, "Marque:")
    .replace(/\[NOTE\]/g, "Note clients:")
    .replace(/\[FAQ\]/g, "FAQ:")
    .replace(/\[LIENS IMPORTANTS\]/g, "Liens de contact:")
    // Supprime les classes CSS Tailwind/Bootstrap/utility
    .replace(/\b(?:flex|grid|block|inline|hidden|relative|absolute|fixed|sticky)(?:-[\w-]+)?\b/g, " ")
    .replace(/\b(?:p|m|px|py|mx|my|pt|pb|pl|pr|mt|mb|ml|mr)-\d+\b/g, " ")
    .replace(/\b(?:text|bg|border|rounded|shadow|gap|space|w|h|min|max|z)-[\w/-]+/g, " ")
    .replace(/\b(?:col|row|span|items|justify|content|self|order|place)-[\w-]+/g, " ")
    .replace(/\b(?:font|leading|tracking|decoration|transform|transition|duration|ease|cursor)-[\w-]+/g, " ")
    .replace(/\b(?:hover|focus|active|disabled|first|last|odd|even|group):[\w-]+/g, " ")
    .replace(/\b(?:sm|md|lg|xl|2xl):[\w-]+/g, " ")
    .replace(/\b(?:overflow|pointer|select|resize|appearance|outline|ring|divide|opacity)-[\w-]+/g, " ")
    // Supprime valeurs CSS pures
    .replace(/\b\d+(?:px|rem|em|vh|vw|%|ms|s)\b/g, " ")
    .replace(/rgba?\([^)]+\)/g, " ")
    .replace(/#[0-9a-fA-F]{3,8}\b/g, " ")
    // Supprime les longues séquences de classes sans espaces (ex: "flex-1d-flex")
    .replace(/\b[\w-]{30,}\b/g, " ")
    // Nettoie les espaces multiples
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
// Jina Reader — rendu SPA complet
// ---------------------------------------------------------------------------

async function fetchViaJina(url: string): Promise<string> {
  try {
    console.log(`[jina] Fetch: ${url}`);
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "text",
        "X-No-Cache": "true",
        "X-Remove-Selector": "header,footer,nav,.cookie,.popup,.modal,.banner",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[jina] HTTP ${res.status} pour ${url}`);
      return "";
    }
    const text = await res.text();
    const cleaned = text
      .replace(/^Title:.*\n/im, "")
      .replace(/^URL Source:.*\n/im, "")
      .replace(/^Markdown Content:\n/im, "")
      .replace(/!\[.*?\]\(.*?\)/g, "") // images markdown
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // liens markdown → texte
      .trim();
    console.log(`[jina] ✅ ${url} — ${cleaned.length} chars`);
    return cleaned.slice(0, 15000);
  } catch (e: any) {
    console.warn(`[jina] Erreur ${url}:`, e?.message);
    return "";
  }
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

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogTitle && ogTitle !== title) parts.push(`Titre: ${ogTitle.trim()}`);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogDesc && ogDesc !== desc) parts.push(`[DESCRIPTION] ${ogDesc.trim()}`);

  const keywords = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (keywords) parts.push(`Mots-clés: ${keywords.trim()}`);

  // JSON-LD — source la plus riche
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];

      for (const item of items) {
        const type = String(item["@type"] || "");

        if (item.name) parts.push(`[NOM] ${item.name}`);
        if (item.description) parts.push(`[DESC] ${item.description.slice(0, 500)}`);
        if (item.telephone) parts.push(`[TEL] ${item.telephone}`);
        if (item.email) parts.push(`[EMAIL] ${item.email}`);
        if (item.url) parts.push(`URL officielle: ${item.url}`);
        if (item.priceRange) parts.push(`[PRIX RANGE] ${item.priceRange}`);
        if (item.currenciesAccepted) parts.push(`[DEVISE] ${item.currenciesAccepted}`);
        if (item.paymentAccepted) parts.push(`[PAIEMENT] ${item.paymentAccepted}`);
        if (item.areaServed) parts.push(`Zone desservie: ${typeof item.areaServed === "string" ? item.areaServed : JSON.stringify(item.areaServed)}`);

        if (item.address) {
          const a = item.address;
          const addr = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, a.addressCountry]
            .filter(Boolean).join(", ");
          if (addr) parts.push(`[ADRESSE] ${addr}`);
        }

        if (item.openingHours) {
          const h = Array.isArray(item.openingHours)
            ? item.openingHours.join(", ")
            : item.openingHours;
          parts.push(`[HORAIRES] ${h}`);
        }

        if (Array.isArray(item.sameAs) && item.sameAs.length) {
          parts.push(`[RESEAUX] ${item.sameAs.join(", ")}`);
        }

        if (item.hasMap) parts.push(`Google Maps: ${item.hasMap}`);
        if (item.servesCuisine) parts.push(`Cuisine: ${item.servesCuisine}`);
        if (item.menu) parts.push(`Menu: ${item.menu}`);

        // Produit
        if (/product/i.test(type)) {
          if (item.sku) parts.push(`[SKU] ${item.sku}`);
          if (item.brand?.name) parts.push(`[MARQUE] ${item.brand.name}`);
          if (item.category) parts.push(`Catégorie: ${item.category}`);
          if (item.color) parts.push(`Couleur: ${item.color}`);
          if (item.size) parts.push(`Taille: ${item.size}`);

          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const o of offers.slice(0, 20)) {
              const price = o.price ?? o.lowPrice;
              const currency = o.priceCurrency || "";
              const avail = o.availability?.split("/").pop() || "";
              const condition = o.itemCondition?.split("/").pop() || "";
              if (price !== undefined) {
                parts.push(`[PRIX] ${price} ${currency}${avail ? ` — ${avail}` : ""}${condition ? ` (${condition})` : ""}`);
              }
            }
          }

          if (item.aggregateRating) {
            parts.push(`[NOTE] ${item.aggregateRating.ratingValue}/5 (${item.aggregateRating.reviewCount || 0} avis)`);
          }
        }

        // ItemList (liste de produits/services)
        if (/itemlist/i.test(type) && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement.slice(0, 30)) {
            const elName = el.name || el.item?.name;
            const elUrl = el.url || el.item?.url;
            if (elName) parts.push(`Élément: ${elName}${elUrl ? ` — ${elUrl}` : ""}`);
          }
        }

        // FAQ
        if (/faqpage/i.test(type) && Array.isArray(item.mainEntity)) {
          for (const faq of item.mainEntity.slice(0, 20)) {
            if (faq.name && faq.acceptedAnswer?.text) {
              parts.push(`[FAQ] Q: ${faq.name}\nR: ${faq.acceptedAnswer.text.slice(0, 500)}`);
            }
          }
        }

        // BreadcrumbList
        if (/breadcrumb/i.test(type) && Array.isArray(item.itemListElement)) {
          const crumbs = item.itemListElement
            .map((c: any) => c.name || c.item?.name)
            .filter(Boolean);
          if (crumbs.length > 1) parts.push(`Navigation: ${crumbs.join(" > ")}`);
        }

        // Article/BlogPosting
        if (/article|blogposting|newsarticle/i.test(type)) {
          if (item.headline) parts.push(`Article: ${item.headline}`);
          if (item.articleBody) parts.push(item.articleBody.slice(0, 800));
          if (item.datePublished) parts.push(`Publié le: ${item.datePublished}`);
        }

        // Review
        if (/review/i.test(type) && item.reviewBody) {
          parts.push(`Avis client: ${item.reviewBody.slice(0, 300)}`);
        }

        // HowTo
        if (/howto/i.test(type)) {
          if (item.name) parts.push(`Guide: ${item.name}`);
          if (Array.isArray(item.step)) {
            item.step.slice(0, 10).forEach((s: any) => {
              if (s.text) parts.push(`Étape: ${s.text.slice(0, 200)}`);
            });
          }
        }
      }
    } catch {}
  }

  // Shopify spécifique
  const shopifyCurrency = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([^"]+)"/i)?.[1];
  if (shopifyCurrency) parts.push(`Devise Shopify: ${shopifyCurrency}`);

  const shopifyShop = html.match(/Shopify\.shop\s*=\s*["']([^"']+)["']/i)?.[1];
  if (shopifyShop) parts.push(`Boutique Shopify: ${shopifyShop}`);

  // Produit Shopify JSON
  const shopifyProductJson = html.match(
    /<script[^>]+type=["']application\/json["'][^>]+data-product-json[^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (shopifyProductJson) {
    try {
      const prod = JSON.parse(shopifyProductJson);
      if (prod.title) parts.push(`Produit: ${prod.title}`);
      if (prod.description) parts.push(`Description: ${cleanHtml(prod.description).slice(0, 500)}`);
      if (prod.vendor) parts.push(`Vendeur: ${prod.vendor}`);
      if (prod.type) parts.push(`Type: ${prod.type}`);
      if (prod.tags?.length) parts.push(`Tags: ${prod.tags.join(", ")}`);
      if (prod.variants?.length) {
        for (const v of prod.variants.slice(0, 20)) {
          const details = [v.title, v.price ? `${v.price / 100} ${shopifyCurrency || ""}` : "", v.available ? "Disponible" : "Épuisé"]
            .filter(Boolean).join(" — ");
          if (details) parts.push(`Variante: ${details}`);
        }
      }
    } catch {}
  }

  // WooCommerce prix
  const wooPrices = [...html.matchAll(/<span[^>]+class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  if (wooPrices.length) {
    const prices = wooPrices.map(m => cleanHtml(m[0])).filter(p => p.length < 30).slice(0, 10);
    if (prices.length) parts.push(`Prix WooCommerce: ${prices.join(", ")}`);
  }

  // __NEXT_DATA__ (Next.js)
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try {
      const nd = JSON.parse(nextData);
      const props = nd?.props?.pageProps;
      if (props) {
        const extractStrings = (obj: any, depth = 0): void => {
          if (depth > 4 || !obj || typeof obj !== "object") return;
          for (const [key, val] of Object.entries(obj)) {
            if (["__typename", "id", "slug", "cursor", "className", "style"].includes(key)) continue;
            if (typeof val === "string" && val.length > 15 && val.length < 600) {
              if (!val.match(/^[a-z\-_]+:|rgba?\(|^https?:\/\/|[<>{}[\]]/)) {
                parts.push(`${key}: ${val}`);
              }
            } else if (typeof val === "number" && key.toLowerCase().includes("price")) {
              parts.push(`Prix: ${val}`);
            } else if (typeof val === "object") {
              extractStrings(val, depth + 1);
            }
          }
        };
        extractStrings(props);
      }
    } catch {}
  }

  // Contenu HTML visible complet
  const visible = cleanHtml(html);
  if (visible.length > 50) {
    parts.push(`[CONTENU VISIBLE]\n${visible.slice(0, 8000)}`);
  }

  // Liens importants (contact, social, formulaires)
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
      href.includes("docs.google.com/forms") ||
      href.includes("hubspot") ||
      href.includes("t.me") ||
      href.includes("telegram.me")
    ) {
      importantLinks.push(href);
    }
  }
  if (importantLinks.length) {
    parts.push(`[LIENS IMPORTANTS] ${[...new Set(importantLinks)].join(" | ")}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Extraction bundle JS (SPA Vite/React/Vue)
// ---------------------------------------------------------------------------

function extractBundleUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const base = new URL(baseUrl);

  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.hostname === base.hostname && !m[1].includes("cdn.")) {
        urls.push(u.toString());
      }
    } catch {}
  }

  return urls.slice(0, 3);
}

function extractStringsFromBundle(js: string): string {
  const results: string[] = [];

  // Téléphones
  const phones = [
    ...js.matchAll(/["'`](\+?(?:213|0)[5-7]\d{8})["'`]/g),
    ...js.matchAll(/tel:([\+\d\s.\-()]{7,20})/g),
    ...js.matchAll(/["'`](\+\d{1,3}[\s.\-]?\d{2,4}[\s.\-]?\d{2,4}[\s.\-]?\d{2,4})["'`]/g),
  ];
  const uniquePhones = [...new Set(phones.map(m => m[1].trim()))].slice(0, 5);
  if (uniquePhones.length) results.push(`[TEL] ${uniquePhones.join(", ")}`);

  // Emails
  const emails = [...js.matchAll(/["'`]([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})["'`]/g)];
  const uniqueEmails = [...new Set(emails.map(m => m[1]))].filter(e => !e.includes("example") && !e.includes("test")).slice(0, 5);
  if (uniqueEmails.length) results.push(`[EMAIL] ${uniqueEmails.join(", ")}`);

  // WhatsApp
  const whatsapp = [
    ...js.matchAll(/wa\.me\/([\d]+)/g),
    ...js.matchAll(/whatsapp\.com\/send[^"'`]*phone=([\d]+)/g),
  ];
  if (whatsapp.length) {
    results.push(`[WHATSAPP] ${[...new Set(whatsapp.map(m => `https://wa.me/${m[1]}`))].join(", ")}`);
  }

  // Réseaux sociaux
  const socialPatterns = [
    "instagram.com", "facebook.com", "tiktok.com", "youtube.com",
    "linkedin.com", "twitter.com", "x.com", "snapchat.com",
    "pinterest.com", "telegram.me", "t.me",
  ];
  const socials: string[] = [];
  for (const pattern of socialPatterns) {
    const matches = [...js.matchAll(new RegExp(`https?://(?:www\\.)?${pattern.replace(".", "\\.")}/[\\w./@-]+`, "gi"))];
    for (const m of matches) {
      const clean = m[0].replace(/["'`\\]/g, "").split(/[\s"'`?#]/)[0];
      if (clean.length > pattern.length + 8) socials.push(clean);
    }
  }
  if (socials.length) results.push(`[RESEAUX] ${[...new Set(socials)].join(", ")}`);

  // Liens formulaires
  const formLinks = [...js.matchAll(
    /["'`](https?:\/\/[^"'`\s]*(?:typeform|tally|calendly|jotform|hubspot|forms\.gle|docs\.google\.com\/forms)[^"'`\s]*)["'`]/gi
  )];
  if (formLinks.length) {
    results.push(`Formulaires: ${[...new Set(formLinks.map(m => m[1]))].join(", ")}`);
  }

  // Adresses
  const addresses = [...js.matchAll(
    /["'`]([^"'`]*(?:rue|avenue|boulevard|allée|cité|quartier|wilaya|alger|oran|constantine|annaba|blida|sétif|tlemcen|batna|béjaïa)[^"'`]{0,150})["'`]/gi
  )];
  if (addresses.length) {
    const uniqueAddr = [...new Set(addresses.map(m => m[1].trim()))].slice(0, 3);
    results.push(`[ADRESSE] ${uniqueAddr.join(" | ")}`);
  }

  // Prix
  const prices = [...js.matchAll(
    /["'`]([^"'`]*\d+[\s,.]?\d*[\s]?(?:DA|DZD|MAD|TND|€|\$|USD|EUR)[^"'`]{0,100})["'`]/gi
  )];
  if (prices.length) {
    const uniquePrices = [...new Set(prices.map(m => m[1].trim()))].slice(0, 15);
    results.push(`[PRIX] ${uniquePrices.join(" | ")}`);
  }

  // Strings de contenu réel (40-600 chars)
  const seen = new Set<string>();
  const contentStrings: string[] = [];

  for (const m of js.matchAll(/["'`]([A-ZÀ-Öa-zà-ö][^"'`\n\r\\]{39,599})["'`]/g)) {
    const s = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\r/g, "")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim();

    if (
      seen.has(s) ||
      /^[a-z\-_]+:/.test(s) ||
      /rgba?\(/.test(s) ||
      /[<>{}[\]|\\]/.test(s) ||
      /^https?:\/\//.test(s) ||
      /^\s*\d+\s*$/.test(s) ||
      // Filtre CSS
      /\b(?:flex|grid|padding|margin|border|background|transition|animation|transform|overflow|display|position|width|height|color|font)\b.*:/.test(s) ||
      s.split(" ").length < 5 ||
      // Trop de chiffres/symboles (code)
      (s.replace(/[^a-zA-ZÀ-ÿ\s]/g, "").length / s.length) < 0.5
    ) continue;

    seen.add(s);
    contentStrings.push(s);
    if (contentStrings.length >= 100) break;
  }

  if (contentStrings.length) {
    results.push(`\n--- Contenu du site ---\n${contentStrings.join("\n")}`);
  }

  return results.join("\n");
}

async function extractFromJsBundle(html: string, baseUrl: string): Promise<{ content: string; isCssOnly: boolean }> {
  const bundleUrls = extractBundleUrls(html, baseUrl);
  if (bundleUrls.length === 0) return { content: "", isCssOnly: true };

  const results: string[] = [];
  let totalContentChars = 0;
  let totalCssChars = 0;

  for (const bundleUrl of bundleUrls) {
    try {
      console.log(`[crawler] Bundle: ${bundleUrl}`);
      const res = await fetch(bundleUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const js = await res.text();
      console.log(`[crawler] Bundle size: ${js.length} chars`);

      // Détecte si c'est principalement du CSS (Tailwind purged CSS, etc.)
      const cssIndicators = (js.match(/\b(?:flex|grid|padding|margin|border-radius|font-size|background-color)\b/g) || []).length;
      const contentIndicators = (js.match(/[A-ZÀ-Ö][a-zà-ö]{3,}\s+[a-zà-ö]/g) || []).length;
      totalCssChars += cssIndicators;
      totalContentChars += contentIndicators;

      const extracted = extractStringsFromBundle(js);
      if (extracted.length > 50) results.push(extracted);
    } catch (e: any) {
      console.warn(`[crawler] Bundle erreur:`, e?.message);
    }
  }

  const content = results.join("\n\n").slice(0, 25000);
  const isCssOnly = totalCssChars > totalContentChars * 3 || content.length < 300;

  return { content, isCssOnly };
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
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.php", "/sitemap", "/sitemap/sitemap.xml"];
  for (const path of candidates) {
    try {
      const res = await fetch(new URL(path, baseUrl).toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const xml = await res.text();

      // Sitemap index → fetch le premier sitemap
      if (xml.includes("<sitemapindex")) {
        const childUrl = xml.match(/<loc>([^<]+sitemap[^<]*)<\/loc>/i)?.[1];
        if (childUrl) {
          const childRes = await fetch(childUrl, { signal: AbortSignal.timeout(5000) });
          if (childRes.ok) {
            const childXml = await childRes.text();
            const urls = [...childXml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
              .map(m => m[1].trim()).filter(u => u.startsWith("http"));
            if (urls.length) {
              console.log(`[crawler] Sitemap index: ${urls.length} URLs`);
              return urls.slice(0, 50);
            }
          }
        }
      }

      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
        .map(m => m[1].trim()).filter(u => u.startsWith("http"));
      if (urls.length > 0) {
        console.log(`[crawler] Sitemap: ${urls.length} URLs`);
        return urls.slice(0, 50);
      }
    } catch { continue; }
  }
  return [];
}

// Pages prioritaires
const PRIORITY_PATHS_ECOMMERCE = [
  "/collections/all", "/collections", "/products", "/catalogue",
  "/boutique", "/shop", "/pages/contact", "/contact",
  "/pages/about", "/about", "/a-propos",
  "/pages/faq", "/faq",
  "/pages/livraison", "/livraison", "/pages/shipping",
  "/pages/retours", "/retours", "/pages/garanties",
  "/pages/paiement", "/pages/conditions-generales",
  "/blogs/news", "/blogs/actualites",
];

const PRIORITY_PATHS_GENERAL = [
  "/services", "/tarifs", "/prix", "/pricing",
  "/contact", "/a-propos", "/about",
  "/equipe", "/team", "/portfolio",
  "/faq", "/livraison", "/garanties",
  "/produits", "/blog", "/actualites",
  "/nos-services", "/nos-produits",
];

// ---------------------------------------------------------------------------
// Fetch d'une page
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
    const title =
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
      new URL(url).pathname;

    const raw = extractPageContent(html, url);
    const content = cleanExtractedText(raw);

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
// Crawl complet multi-pages
// ---------------------------------------------------------------------------

async function crawlSite(rootUrl: string, rootHtml: string, isSPA: boolean): Promise<Page[]> {
  const pages: Page[] = [];
  const visited = new Set<string>([rootUrl]);

  const isShopify = rootHtml.includes("cdn.shopify.com") || rootHtml.includes("Shopify.theme") || rootHtml.includes("shopify");
  const isWooCommerce = rootHtml.includes("woocommerce") || rootHtml.includes("wc-add-to-cart");
  const isWordPress = rootHtml.includes("wp-content") || rootHtml.includes("wp-json");

  console.log(`[crawler] Détection: Shopify=${isShopify} WooCommerce=${isWooCommerce} WordPress=${isWordPress} SPA=${isSPA}`);

  // ── SPA (React/Vue/Vite sans SSR) ─────────────────────────────────────────
  if (isSPA) {
    console.log(`[crawler] Stratégie SPA → Bundle JS`);

    const { content: bundleContent, isCssOnly } = await extractFromJsBundle(rootHtml, rootUrl);
    const htmlMeta = cleanExtractedText(extractPageContent(rootHtml, rootUrl));

    if (!isCssOnly && bundleContent.length > 300) {
      // Bundle utile
      const combined = [htmlMeta, cleanExtractedText(bundleContent)].join("\n\n");
      const title = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
      pages.push({ url: rootUrl, title, text: combined.slice(0, 25000), status: "done" });
      console.log(`[crawler] Bundle OK: ${combined.length} chars`);
    } else {
      // Bundle vide/CSS → Jina Reader
      console.log(`[crawler] Bundle inutile (CSS only=${isCssOnly}) → Jina Reader`);
      const jinaText = await fetchViaJina(rootUrl);

      if (jinaText.length > 100) {
        const title = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
        pages.push({ url: rootUrl, title, text: jinaText, status: "done" });

        // Pages supplémentaires via Jina (en parallèle)
        const extraPaths = isShopify ? PRIORITY_PATHS_ECOMMERCE : PRIORITY_PATHS_GENERAL;
        const jinaExtraPages = await Promise.all(
          extraPaths.slice(0, 6).map(async (p) => {
            try {
              const pageUrl = new URL(p, rootUrl).toString();
              if (visited.has(pageUrl)) return null;
              visited.add(pageUrl);
              const text = await fetchViaJina(pageUrl);
              if (text.length > 100) {
                return { url: pageUrl, title: p, text, status: "done" as const };
              }
            } catch {}
            return null;
          })
        );
        for (const p of jinaExtraPages) {
          if (p) pages.push(p);
        }
      } else if (htmlMeta.length > 30) {
        // Dernier recours : métadonnées HTML
        const title = rootHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(rootUrl).hostname;
        pages.push({ url: rootUrl, title, text: htmlMeta, status: "done" });
      }
    }

    return pages;
  }

  // ── Sites normaux : crawl récursif ────────────────────────────────────────

  // Page racine
  const rootPage = await fetchPageFull(rootUrl);
  if (rootPage.status === "done") {
    pages.push(rootPage);
    console.log(`[crawler] ✅ Racine: ${rootUrl} (${rootPage.text.length} chars)`);
  }

  // Sitemap complet
  const sitemapLinks = await discoverViaSitemap(rootUrl);

  // Liens depuis la home
  const homeLinks = discoverAllLinks(rootHtml, rootUrl);

  // Pages prioritaires selon le type
  const priorityPaths = isShopify || isWooCommerce
    ? PRIORITY_PATHS_ECOMMERCE
    : PRIORITY_PATHS_GENERAL;

  const priorityLinks = priorityPaths.map((p) => {
    try { return new URL(p, rootUrl).toString(); } catch { return ""; }
  }).filter(Boolean);

  // Score de priorité
  const allCandidates = [...new Set([...priorityLinks, ...sitemapLinks, ...homeLinks])]
    .filter((l) => !visited.has(l));

  const scoredLinks = allCandidates.map((link) => {
    let score = 0;
    const path = new URL(link).pathname.toLowerCase();

    // Pages très importantes
    if (/contact|about|a-propos|faq|services|tarif|prix|livraison|garantie|shipping|return/.test(path)) score += 100;
    // E-commerce
    if (/collection|product|boutique|shop|catalogue|categorie/.test(path)) score += 80;
    // Shopify pages
    if (/\/pages\//.test(path)) score += 60;
    // Blog/contenu
    if (/blog|article|actualite|news|portfolio/.test(path)) score += 30;
    // Profondeur (moins = mieux)
    score -= (path.split("/").filter(Boolean).length) * 5;
    // Sitemap bonus
    if (sitemapLinks.includes(link)) score += 15;

    return { link, score };
  });

  scoredLinks.sort((a, b) => b.score - a.score);
  const queue = scoredLinks.slice(0, MAX_PAGES - 1).map((s) => s.link);

  console.log(`[crawler] Queue: ${queue.length} pages à visiter`);

  // Crawl par batch de 5 en parallèle
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const batch = queue.splice(0, 5).filter((u) => !visited.has(u));
    if (batch.length === 0) continue;
    batch.forEach((u) => visited.add(u));

    const results = await Promise.all(batch.map(fetchPageFull));

    for (const page of results) {
      if (page.status === "done" && page.text.length > 30) {
        pages.push(page);
        console.log(`[crawler] ✅ ${page.url} (${page.text.length} chars)`);
      } else {
        console.log(`[crawler] ⏭ ${page.url} (vide)`);
      }
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Synthèse IA Gemini
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
  const usablePages = pages.filter((p) => p.status === "done");

  // Résumé intelligent : priorise les pages importantes
  const dossier = usablePages
    .sort((a, b) => {
      const importantA = /contact|about|faq|service|tarif|livraison|collection|product/i.test(a.url) ? 1 : 0;
      const importantB = /contact|about|faq|service|tarif|livraison|collection|product/i.test(b.url) ? 1 : 0;
      return importantB - importantA;
    })
    .map((p) => `\n=== PAGE: ${p.title} ===\nURL: ${p.url}\n${p.text.slice(0, 3500)}`)
    .join("\n")
    .slice(0, 35000);

  const prompt = `Tu es un assistant expert en extraction de données commerciales pour alimenter un chatbot d'entreprise.

Site analysé : ${siteUrl}
Pages analysées : ${usablePages.length}

MISSION : Extrais TOUTES les informations utiles pour un chatbot qui répondra aux clients.

RETOURNE UNIQUEMENT un JSON valide (sans markdown, sans commentaires) :
{
  "businessName": "nom exact de l'entreprise/marque",
  "businessCategory": "secteur d'activité précis",
  "businessDescription": "description complète de l'activité (3-5 phrases)",
  "phone": "numéro de téléphone principal",
  "email": "email principal",
  "whatsapp": "lien wa.me complet si trouvé",
  "address": "adresse complète",
  "contactLinks": ["tous les liens de contact : formulaires, WhatsApp, email, réseaux"],
  "deliveryInfo": "informations complètes sur la livraison : délais, zones, prix, gratuit à partir de...",
  "paymentMethods": "modes de paiement acceptés",
  "openingHours": "horaires d'ouverture",
  "socialMedia": "tous les réseaux sociaux avec URLs complètes",
  "siteType": "vitrine" ou "ecommerce" ou "service" ou "restaurant" ou "portfolio",
  "confidence": nombre entre 0 et 100,
  "knowledgeNotes": [
    {
      "title": "titre de la fiche",
      "category": "services" ou "tarifs" ou "livraison" ou "garanties" ou "contact" ou "faq" ou "general",
      "content": "contenu détaillé de 3-6 phrases avec toutes les infos trouvées"
    }
  ]
}

RÈGLES STRICTES :
1. N'invente AUCUNE information — utilise uniquement ce qui est dans le contenu
2. Si une info est absente, mets "" (string vide) ou [] (tableau vide)
3. knowledgeNotes : crée 6 à 12 fiches couvrant :
   - Présentation de l'entreprise/marque
   - Tous les services/produits avec prix si disponibles
   - Processus de commande ou de contact
   - Livraison et délais
   - Retours et garanties
   - FAQ et questions courantes
   - Coordonnées et réseaux sociaux
   - Promotions ou offres spéciales si mentionnées
4. Pour les e-commerces : liste les catégories de produits, gammes de prix, marques
5. Pour les services : liste chaque service avec son prix/tarif si mentionné
6. contactLinks doit contenir TOUS les moyens de contact trouvés

CONTENU EXTRAIT (${usablePages.length} pages) :
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
        console.warn(`[crawler] ${model}: quota`);
        continue;
      }
      if (!res.ok) {
        console.warn(`[crawler] ${model}: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { console.warn(`[crawler] ${model}: réponse vide`); continue; }

      const parsed = JSON.parse(
        text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()
      );
      console.log(`[crawler] ✅ Gemini OK: ${model}`);
      return parsed;
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name !== "AbortError") console.warn(`[crawler] ${model}:`, e?.message);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

function fallbackFromPages(pages: Page[], siteUrl: string) {
  const good = pages.filter((p) => p.status === "done");
  const corpus = good.map((p) => p.text).join("\n");

  const phones = corpus.match(/Téléphone:\s*([^\n,]+)/g)?.map(m => m.replace("Téléphone:", "").trim()) || [];
  const emails = corpus.match(/Email:\s*([^\n,]+)/g)?.map(m => m.replace("Email:", "").trim()) || [];
  const wa = corpus.match(/WhatsApp:\s*(https:\/\/wa\.me\/[^\s,]+)/)?.[1] || "";
  const socials = corpus.match(/Réseaux sociaux:\s*([^\n]+)/)?.[1] || "";

  return {
    siteType: /prix|produit|panier|boutique|shop|cart|ecommerce/i.test(corpus) ? "ecommerce" : "vitrine",
    confidence: 35,
    businessName: good[0]?.title || new URL(siteUrl).hostname,
    businessCategory: "",
    businessDescription: good[0]?.text?.replace(/\n/g, " ").slice(0, 500) || "",
    phone: phones[0] || "",
    email: emails[0] || "",
    whatsapp: wa,
    address: "",
    contactLinks: [wa, ...emails.map(e => `mailto:${e}`)].filter(Boolean),
    deliveryInfo: "",
    paymentMethods: "",
    openingHours: "",
    socialMedia: socials,
    knowledgeNotes: good.slice(0, 6).map((p) => ({
      title: p.title,
      category: /contact/i.test(p.url) ? "contact"
        : /faq/i.test(p.url) ? "faq"
        : /livraison|shipping/i.test(p.url) ? "livraison"
        : /tarif|prix|pricing/i.test(p.url) ? "tarifs"
        : /service|produit|collection/i.test(p.url) ? "services"
        : "general",
      content: p.text.replace(/\n+/g, " ").slice(0, 800),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fusion notes existantes + nouvelles
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
  return empty ? (newVal ?? "") : existing;
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

    // Auth
    const authHeader = context.request.headers.get("Authorization");
    const caller = await verifyFirebaseIdToken(context.env, authHeader);
    if (!caller) return json({ error: "Authentification requise." }, 401);

    // Vérification assistant
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
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!rootRes.ok) return json({ error: `Site inaccessible : HTTP ${rootRes.status}` }, 502);

    const rootHtml = await rootRes.text();
    const isSPA = looksLikeEmptySPA(rootHtml);

    console.log(`[crawler] ▶ Démarrage: ${rootUrl} | SPA=${isSPA}`);

    // Crawl complet
    const pages = await crawlSite(rootUrl, rootHtml, isSPA);
    const usable = pages.filter((p) => p.status === "done" && p.text.length > 30);

    console.log(`[crawler] Résultat crawl: ${pages.length} visitées, ${usable.length} exploitables`);

    if (usable.length === 0) {
      return json({
        error: "Aucun contenu accessible sur ce site. Ajoutez vos informations manuellement via 'Ajouter une Note'.",
      }, 502);
    }

    // Synthèse IA
    let result: any;
    try {
      result = context.env.GEMINI_API_KEY
        ? await synthesizeWithGemini(usable, rootUrl, context.env.GEMINI_API_KEY, context.env.GEMINI_MODEL)
        : fallbackFromPages(usable, rootUrl);
    } catch (e: any) {
      console.error("[crawler] Gemini échoué, fallback:", e?.message);
      result = fallbackFromPages(usable, rootUrl);
    }

    // Sauvegarde Firestore
    let saved = false;
    let savedNoteCount = 0;

    if (body.assistantId) {
      const existing: KnowledgeNote[] = Array.isArray(existingFields?.knowledgeNotes)
        ? existingFields!.knowledgeNotes
        : [];
      const merged = mergeKnowledgeNotes(existing, result.knowledgeNotes || []);

      const update = {
        businessName: fillIfEmpty(existingFields?.businessName, result.businessName),
        businessCategory: fillIfEmpty(existingFields?.businessCategory, result.businessCategory),
        businessDescription: fillIfEmpty(existingFields?.businessDescription, result.businessDescription),
        phone: fillIfEmpty(existingFields?.phone, result.phone),
        email: fillIfEmpty(existingFields?.email, result.email),
        whatsapp: fillIfEmpty(existingFields?.whatsapp, result.whatsapp),
        address: fillIfEmpty(existingFields?.address, result.address),
        contactLinks: (result.contactLinks?.length ? result.contactLinks : null)
          ?? existingFields?.contactLinks
          ?? [],
        deliveryInfo: fillIfEmpty(existingFields?.deliveryInfo, result.deliveryInfo),
        paymentMethods: fillIfEmpty(existingFields?.paymentMethods, result.paymentMethods),
        openingHours: fillIfEmpty(existingFields?.openingHours, result.openingHours),
        socialMedia: fillIfEmpty(existingFields?.socialMedia, result.socialMedia),
        websiteUrl: fillIfEmpty(existingFields?.websiteUrl, rootUrl),
        knowledgeNotes: merged,
        lastScanAt: new Date().toISOString(),
      };

      const write = await adminPatchDocument(
        context.env,
        `assistants/${body.assistantId}`,
        update
      );

      if (write.ok) {
        saved = true;
        savedNoteCount = merged.length;
        console.log(`[crawler] ✅ ${merged.length} notes sauvegardées pour assistantId=${body.assistantId}`);
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
        ? ["Détection SPA", "Bundle JS", "Jina Reader (fallback)", "Pages prioritaires"]
        : ["Crawl récursif", "Sitemap complet", "JSON-LD", "Contenu HTML visible"],
      scannedPages: pages.map(({ url: u, title, status }) => ({ url: u, title, status })),
    });

  } catch (err: any) {
    console.error("[crawler] Erreur générale:", err?.message);
    return json({ error: err?.message || "Erreur interne." }, 500);
  }
}

export function onRequestGet() {
  return json({ error: "POST uniquement." }, 405);
}
