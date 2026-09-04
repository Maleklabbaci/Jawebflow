interface Env { GEMINI_API_KEY?: string; }

type Page = { url: string; title: string; text: string; status: "done" | "failed" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

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

async function fetchPage(url: string): Promise<Page> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JawebFlowCrawler/1.0)", "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || new URL(url).pathname || "Page web";
    return { url, title, text: cleanHtml(html).slice(0, 9000), status: "done" };
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
    } catch (_) { /* lien invalide */ }
  }
  return [...links].filter(link => link !== baseUrl).slice(0, 8);
}

async function synthesizeWithGemini(pages: Page[], siteUrl: string, apiKey: string) {
  const dossier = pages.filter(p => p.status === "done").map(p => `PAGE: ${p.title}\nURL: ${p.url}\n${p.text}`).join("\n\n").slice(0, 28000);
  const prompt = `Analyse uniquement les informations réelles ci-dessous extraites du site ${siteUrl}. Ne complète jamais avec des informations inventées. Retourne uniquement un JSON valide avec businessName, businessCategory, businessDescription, phone, email, deliveryInfo, paymentMethods, siteType, confidence et knowledgeNotes. knowledgeNotes doit contenir 4 à 8 fiches utiles, avec title, category, content, enabled:true, source:"scanned".\n\n${dossier}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } })
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini n’a pas retourné de synthèse");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
}

function fallbackFromPages(pages: Page[], siteUrl: string) {
  const good = pages.filter(p => p.status === "done");
  const corpus = good.map(p => p.text).join("\n");
  const title = good[0]?.title || new URL(siteUrl).hostname;
  const phones = corpus.match(/(?:\+213|00213|0)[567]\d{8}/g) || [];
  const emails = corpus.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
  const excerpt = (text: string) => text.replace(/\s+/g, " ").slice(0, 1800);
  return {
    siteType: /prix|produit|panier|boutique|shop/i.test(corpus) ? "ecommerce" : "vitrine",
    confidence: 70, businessName: title, businessCategory: "Activité détectée sur le site",
    businessDescription: excerpt(good[0]?.text || `Contenu public récupéré depuis ${siteUrl}.`),
    phone: phones[0] || "", email: emails[0] || "", deliveryInfo: "", paymentMethods: "",
    knowledgeNotes: good.slice(0, 8).map((p, index) => ({ id: `scanned_${index + 1}`, title: p.title, category: /contact/i.test(p.url) ? "contact" : /prix|tarif/i.test(p.text) ? "tarifs" : "general", content: excerpt(p.text), enabled: true, source: "scanned" }))
  };
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({})) as { url?: string };
    if (!body.url) return json({ error: "URL is required" }, 400);
    const url = new URL(body.url.startsWith("http") ? body.url : `https://${body.url}`);
    url.hash = "";
    const rootUrl = url.toString();
    const rootResponse = await fetch(rootUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; JawebFlowCrawler/1.0)" }, signal: AbortSignal.timeout(10000) });
    if (!rootResponse.ok) return json({ error: `Le site a répondu HTTP ${rootResponse.status}.` }, 502);
    const rootHtml = await rootResponse.text();
    const links = discoverLinks(rootHtml, rootUrl);
    const pages = [await fetchPage(rootUrl), ...(await Promise.all(links.slice(0, 6).map(fetchPage)))];
    if (!pages.some(p => p.status === "done" && p.text.length > 40)) return json({ error: "Aucun contenu HTML exploitable n’a été trouvé." }, 502);

    let result: any;
    if (context.env.GEMINI_API_KEY) {
      try { result = await synthesizeWithGemini(pages, rootUrl, context.env.GEMINI_API_KEY); } catch (_) { result = fallbackFromPages(pages, rootUrl); }
    } else result = fallbackFromPages(pages, rootUrl);

    return json({ ...result, scrapingStrategy: ["Accueil", "Pages internes", "Services et offres", "Tarifs", "FAQ", "Contact"], scannedPages: pages.map(({ url: pageUrl, title, status }) => ({ url: pageUrl, title, status })) });
  } catch (error: any) {
    return json({ error: error?.message || "Impossible de scanner le site." }, 500);
  }
}

export function onRequestGet() { return json({ error: "Cette route accepte uniquement POST." }, 405); }
