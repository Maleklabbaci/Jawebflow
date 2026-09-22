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

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
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
export async function searchClientSite(config: any, query: string): Promise<SiteSearchResult[]> {
  const base = String(config?.websiteUrl || '').trim().replace(/\/+$/, '');
  const q = encodeURIComponent(String(query || '').trim().slice(0, 80));
  if (!base || !q || !/^https?:\/\//i.test(base)) return [];

  const patterns = [
    `${base}/?s=${q}`,                        // WordPress / WooCommerce
    `${base}/search?q=${q}`,                  // Shopify
    `${base}/catalogsearch/result/?q=${q}`,   // Magento
    `${base}/search/${q}`,                    // boutiques diverses
    `${base}?s=${q}`,
  ];

  for (const url of patterns) {
    try {
      const res = await fetchWithTimeout(url, 5000, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JawebFlowBot/1.0)' },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) continue;
      const html = (await res.text()).slice(0, 800_000);
      const results = extractProductLinks(html, base);
      if (results.length > 0) return results.slice(0, 5);
    } catch {
      continue; // pattern suivant
    }
  }
  return [];
}

/** Bloc de prompt avec les produits trouvés en direct. */
export function siteShoppingPromptBlock(results: SiteSearchResult[], config: any): string {
  if (results.length === 0) return '';
  let block = `\n\n### 🛒 PRODUITS TROUVÉS EN DIRECT SUR LE SITE (le client commande via le site — envoie-lui ces liens 🔗) :\n`;
  for (const r of results) block += `- ${r.title} : ${r.url}\n`;
  if (config?.businessInfo?.phone) block += `- Contact commande : ${config.businessInfo.phone}\n`;
  return block;
}
