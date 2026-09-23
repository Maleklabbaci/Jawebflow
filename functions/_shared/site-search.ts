/**
 * JAWEBFLOW — Recherche de produits EN DIRECT sur le site du client.
 *
 * Quand le commerçant active "Mes clients commandent sur mon site", l'IA ne
 * se contente pas de sa base de connaissance : elle interroge la page de
 * recherche du site (WooCommerce, Shopify, Magento, générique...) et renvoie
 * les liens produits trouvés pour que l'IA les envoie au client.
 */

export interface SiteSearchResult {
  title: string;
  url: string;
}

// 🎭 FIX « site protégé » : on s'annonce comme un vrai navigateur (les
// protections anti-robot bloquaient notre ancien UA JawebFlowBot).
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
};

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, headers: { ...BROWSER_HEADERS, ...((init.headers as Record<string, string>) || {}) }, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

// 🗺️ SITES EN JAVASCRIPT : leur page de recherche est vide (le HTML ne contient
// rien), mais leur sitemap.xml reste lisible. On le télécharge (cache 1 h par
// site) et on filtre les URLs produits qui correspondent aux mots de la
// requête — le bot trouve « coque spiderman rouge » même sur une boutique JS.
const SITEMAP_CACHE = new Map<string, { at: number; urls: string[] }>();
const SITEMAP_CACHE_TTL = 60 * 60 * 1000;

async function fetchSitemapUrls(base: string): Promise<string[]> {
  const hit = SITEMAP_CACHE.get(base);
  if (hit && Date.now() - hit.at < SITEMAP_CACHE_TTL) return hit.urls;
  let urls: string[] = [];
  try {
    const res = await fetchWithTimeout(`${base}/sitemap.xml`, 6000);
    if (res.ok) {
      const xml = (await res.text()).slice(0, 2_000_000);
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      urls = locs.filter((u) => !/\.xml$/i.test(u));
      // index de sitemaps (Shopify, WooCommerce SEO…) : 1 niveau de sous-sitemaps
      const subs = locs.filter((u) => /\.xml$/i.test(u)).slice(0, 3);
      for (const sub of subs) {
        try {
          const r2 = await fetchWithTimeout(sub, 6000);
          if (!r2.ok) continue;
          const x2 = (await r2.text()).slice(0, 2_000_000);
          urls.push(...[...x2.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((u) => !/\.xml$/i.test(u)));
        } catch { /* sous-sitemap ignoré */ }
        if (urls.length > 800) break;
      }
    }
  } catch { /* pas de sitemap */ }
  urls = urls.slice(0, 800);
  SITEMAP_CACHE.set(base, { at: Date.now(), urls });
  return urls;
}

function slugToTitle(url: string): string {
  try {
    const last = new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || '';
    return decodeURIComponent(last).replace(/[-_+]+/g, ' ').replace(/\.(html?|php)$/i, '').trim().slice(0, 90);
  } catch { return ''; }
}

const normTxt = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function searchSitemap(base: string, query: string): Promise<SiteSearchResult[]> {
  const urls = await fetchSitemapUrls(base);
  if (!urls.length) return [];
  const stop = new Set(['avec','pour','this','that','votre','vos','notre','nos','leur','leurs','vous','nous','mon','ma','mes','ton','ta','tes','son','sa','ses','une','des','les','aux','que','qui','quoi','est','sont','cette','ces','the','and']);
  const tokens = normTxt(query).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !stop.has(t));
  if (!tokens.length) return [];
  let host = '';
  try { host = new URL(base).host; } catch { return []; }
  const scored: { r: SiteSearchResult; score: number }[] = [];
  for (const u of urls) {
    try { if (new URL(u).host !== host) continue; } catch { continue; }
    if (!/(product|produit|item|\/p\/|\/p-|\.html$)/i.test(u)) continue;
    const title = slugToTitle(u);
    const hay = normTxt(`${title} ${u}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score++;
    if (score > 0) scored.push({ r: { title: title || u, url: u }, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.r);
}

/** Extrait les liens "produit" plausibles d'une page de résultats HTML. */
function extractProductLinks(html: string, base: string): SiteSearchResult[] {
  let host = '';
  try {
    host = new URL(base).host;
  } catch {
    return [];
  }
  const links: SiteSearchResult[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 40) {
    let href = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 4 || text.length > 90) continue;
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    try {
      href = new URL(href, base).href;
    } catch {
      continue;
    }
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.host !== host) continue;
    if (/(cart|panier|account|compte|login|connexion|checkout|commander$|wishlist|wp-admin|wp-login|cgi-bin|\/tag\/|\/category\/)/i.test(u.pathname + u.search)) continue;
    const key = u.pathname.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ title: text, url: href });
  }
  // Les URLs "produit" typiques passent devant.
  const productish = links.filter((l) =>
    /(product|produit|item|\/p\/|\/p-|ref=|ref-|\.html$)/i.test(l.url)
  );
  return productish.length >= 2 ? productish : links;
}

/**
 * Essaie les patterns de recherche e-commerce les plus courants et renvoie
 * jusqu'à 5 liens produits. Silencieux ([]) en cas d'échec : l'IA retombe
 * alors sur sa base de connaissance.
 */
// 🧮 CACHE 15 min : la même recherche produit (même site + même requête)
// ne re-télécharge PAS le site du client à chaque message (lenteur ÷3,
// moins de charge sur son hébergeur). Les résultats VIDES ne sont jamais
// mis en cache (un produit ajouté entre-temps reste trouvable).
import { searchStorePlatform } from './store-adapters';

const SEARCH_CACHE = new Map<string, { at: number; results: any[] }>();
const SEARCH_CACHE_TTL = 15 * 60 * 1000;

export async function searchClientSite(config: any, query: string): Promise<SiteSearchResult[]> {
  const __q = `${config?.websiteUrl || ''}|${String(query || '').toLowerCase().trim()}`;
  const __hit = SEARCH_CACHE.get(__q);
  if (__hit && Date.now() - __hit.at < SEARCH_CACHE_TTL) return __hit.results;

  const base = String(config?.websiteUrl || '').trim().replace(/\/+$/, '');
  const q = encodeURIComponent(String(query || '').trim().slice(0, 80));
  if (!base || !q || !/^https?:\/\//i.test(base)) return [];

  // 🏪 1) Boutique sur une plateforme connue (Hanotify, Shopify, WooCommerce,
  // YouCan) ? -> API native de recherche produit de la plateforme.
  const storeResults = await searchStorePlatform(config, decodeURIComponent(q));
  if (storeResults) {
    if (storeResults.length) {
      SEARCH_CACHE.set(__q, { at: Date.now(), results: storeResults });
      return storeResults;
    }
    return []; // l'API de la plateforme a déjà cherché (HTML vide ou sans plus)
  }

  const patterns = [
    `${base}/?s=${q}`,                        // WordPress / WooCommerce
    `${base}/search?q=${q}`,                  // Shopify
    `${base}/catalogsearch/result/?q=${q}`,   // Magento
    `${base}/search/${q}`,                    // boutiques diverses
    `${base}?s=${q}`,
  ];

  for (const url of patterns) {
    try {
      const res = await fetchWithTimeout(url, 5000);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) continue;
      const html = (await res.text()).slice(0, 800_000);
      const results = extractProductLinks(html, base);
      if (results.length > 0) { const top = results.slice(0, 5); SEARCH_CACHE.set(__q, { at: Date.now(), results: top }); return top; }
    } catch {
      continue; // pattern suivant
    }
  }
  // 🗺️ Repli : pages de recherche vides/404 (site en JavaScript) -> sitemap
  const fromSitemap = await searchSitemap(base, decodeURIComponent(q));
  if (fromSitemap.length) {
    SEARCH_CACHE.set(__q, { at: Date.now(), results: fromSitemap });
    return fromSitemap;
  }
  return [];
}

/** Bloc de prompt avec les produits trouvés en direct. */
export function siteShoppingPromptBlock(results: SiteSearchResult[], config: any): string {
  if (results.length === 0) return '';
  let block = `\n\n### 🛒 PRODUITS TROUVÉS EN DIRECT SUR LE SITE (le client commande via le site — envoie-lui ces liens 🔗) :\n`;
  for (const r of results) block += `- ${r.title} : ${r.url}\n`;
  if (config?.businessInfo?.phone) block += `- Contact commande : ${config.businessInfo.phone}\n`;
  block += `COMPARE la demande du client (et sa photo s'il en a envoyé une) avec ces produits ET avec ta base de connaissance : propose le produit le PLUS PROCHE (couleur, personnage, texte, catégorie). Si aucun ne correspond vraiment, dis-le honnêtement et propose l'article le plus similaire.`;
  return block;
}
