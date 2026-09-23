/**
 * JAWEBFLOW — Adaptateurs UNIVERSELS de boutiques e-commerce.
 *
 * Objectif : sur les plateformes structurées, ne pas "lire du HTML" comme un
 * robot aveugle mais interroger la source officielle et extraire LE PACK DE
 * VENTE — les informations dont un commercial a besoin pour CLORE une vente :
 *   1. CATALOGUE : produits + prix + prix barrés (promos) + variantes + liens
 *   2. LIVRAISON : zones/wilayas, coûts, domicile vs point relais, délais
 *   3. PAIEMENT : à la livraison (COD) ? carte ? — décisif en Algérie
 *   4. RETOURS/ÉCHANGES/GARANTIE : l'objection n°1 des clients
 *   5. CONTACT : téléphone, e-mail, réseaux sociaux
 *
 * Plateformes gérées : Hanotify (DZ), Shopify, WooCommerce, YouCan (DZ/MA).
 * Tout est public, sans clé API : coût = 0 DA (juste des fetchs).
 */

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept": "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7",
};

async function get(url: string, ms = 8000, asJson = false): Promise<{ ok: boolean; body: any }> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!res.ok) return { ok: false, body: null };
    const body = asJson ? await res.json().catch(() => null) : (await res.text()).slice(0, 400_000);
    return { ok: body != null, body };
  } catch {
    return { ok: false, body: null };
  }
}

/** Texte visible depuis du HTML (sans dépendance externe). */
export function htmlToText(html: string, max = 2500): string {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

/** Texte du CONTENU PRINCIPAL d'une page (évite menus/footers qui noient l'info). */
function mainText(html: string, max = 2500): string {
  const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<div[^>]+class=["'][^"']*(entry-content|post-content|policy|page-content|prose)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  return htmlToText(m ? m[1] || m[2] || "" : html, max);
}

// ─── Détection (cache 1 h par site) ──────────────────────────────────────────
export type Platform = "hanotify" | "shopify" | "woocommerce" | "youcan";
const detectCache = new Map<string, { at: number; platform: Platform | null; extra?: any }>();
const DETECT_TTL = 60 * 60 * 1000;

export async function detectPlatform(base: string): Promise<Platform | null> {
  const hit = detectCache.get(base);
  if (hit && Date.now() - hit.at < DETECT_TTL) return hit.platform;
  let platform: Platform | null = null;
  // 1) YouCan : /api/products public
  const yc = await get(`${base}/api/products?page=1`, 7000, true);
  if (yc.ok && Array.isArray(yc.body?.data) && yc.body.data.length > 0 && yc.body.data[0]?.public_url) platform = "youcan";
  // 2) Shopify : /products.json public
  if (!platform) {
    const sh = await get(`${base}/products.json?limit=1`, 7000, true);
    if (sh.ok && Array.isArray(sh.body?.products)) platform = "shopify";
  }
  // 3) WooCommerce : Store API officielle
  if (!platform) {
    const woo = await get(`${base}/wp-json/wc/store/v1/products?per_page=1`, 7000, true);
    if (woo.ok && Array.isArray(woo.body) && woo.body.length > 0 && woo.body[0]?.name != null) platform = "woocommerce";
  }
  // 4) Hanotify : window.storeData dans le HTML
  if (!platform) {
    const home = await get(`${base}/`, 7000);
    const m = home.ok ? String(home.body).match(/window\.storeData=JSON\.parse\("((?:[^"\\]|\\.)*)"\)/) : null;
    if (m) {
      try {
        const store = JSON.parse(JSON.parse(`"${m[1]}"`));
        if (store?.id) platform = "hanotify";
      } catch { /* illisible */ }
    }
  }
  detectCache.set(base, { at: Date.now(), platform });
  return platform;
}

// ─── Types internes ──────────────────────────────────────────────────────────
export type StoreProduct = { title: string; price?: string; link?: string };
export type StoreLink = { kind: "produit" | "collection" | "reseau" | "formulaire" | "page"; title: string; url: string };
export type StoreScan = {
  platform: Platform;
  title: string;
  description: string;
  phones: string[];
  emails: string[];
  lines: string[];      // pack de vente (livraison, paiement, retours…)
  products: StoreProduct[];
  links: StoreLink[];   // ANNUAIRE : tous les liens classés (produits, collections, réseaux, formulaires, pages)
};

/** Détecte les liens de FORMULAIRES (devis, commande, contact) dans du HTML. */
function formLinks(html: string, base: string): StoreLink[] {
  const out: StoreLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!/(forms\.gle|docs\.google\.com\/forms|typeform\.com|tally\.so|jotform|hubspot\.com|airtable\.com|\/form|\/formulaire|\/devis)/i.test(u)) continue;
    try { u = new URL(u, base).href; } catch { continue; }
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ kind: "formulaire", title: text || "Formulaire", url: u });
    if (out.length >= 5) break;
  }
  return out;
}

/** Annuaire final : produits + extra, dédoublonné par URL, ordre logique. */
function buildLinkDirectory(products: StoreProduct[], extra: StoreLink[]): StoreLink[] {
  const seen = new Set<string>();
  const dir: StoreLink[] = [];
  for (const l of [
    ...extra.filter((l) => l.kind === "reseau"),
    ...extra.filter((l) => l.kind === "formulaire"),
    ...extra.filter((l) => l.kind === "collection"),
    ...extra.filter((l) => l.kind === "page"),
    ...products.filter((p) => p.link).map((p) => ({ kind: "produit" as const, title: p.title, url: p.link! })),
  ]) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    dir.push(l);
  }
  return dir;
}

// ─── Pages « pack de vente » communes (livraison, retours, contact…) ─────────
const SELL_PAGE_RE = /(livraison|shipping|retour|refund|echange|échange|garantie|faq|contact|a-propos|about|terms|cgv|politique|policy)/i;
const COD_RE = /(paiement à la livraison|paiement a la livraison|payer à la livraison|cash on delivery|\bcod\b|الدفع عند الاستلام|الدفع عند التسليم)/i;

function extractContacts(text: string): { phones: string[]; emails: string[] } {
  const phones = Array.from(new Set((text.match(/(?:\+213|0)[\s-]?[5-7][\d\s.-]{7,11}/g) || []).map((p) => p.trim()))).slice(0, 3);
  const emails = Array.from(new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 3)));
  return { phones, emails };
}

/**
 * Lit 2-3 pages clés du site (livraison/retours/contact) et en tire le pack de
 * vente : mode de livraison, COD, retours, contacts. Marche pour TOUTES les
 * plateformes (les liens viennent de la nav lue dans le HTML de la home).
 */
async function readSellPackPages(base: string, html: string, seen: Set<string>): Promise<string[]> {
  const lines: string[] = [];
  const links: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base).href.split("#")[0];
      if (!u.startsWith(base)) continue;
      if (u.replace(/\/$/, "") === base.replace(/\/$/, "")) continue;
      if (SELL_PAGE_RE.test(u) && !seen.has(u)) links.push(u);
    } catch { /* lien cassé */ }
  }
  const unique = Array.from(new Set(links)).slice(0, 3);
  const allText: string[] = [];
  for (const u of unique) {
    seen.add(u);
    const page = await get(u, 7000);
    if (!page.ok) continue;
    const t = mainText(String(page.body), 2200);
    if (t.length < 60) continue;
    allText.push(t);
    const label = /livraison|shipping/i.test(u) ? "LIVRAISON" : /retour|refund|échange|echange/i.test(u) ? "RETOURS/ÉCHANGES" : /contact/i.test(u) ? "CONTACT" : "INFOS";
    lines.push(`${label} (source : ${u.replace(base, "")}) : ${t.slice(0, 900)}`);
  }
  return lines;
}

/** Mentionne le paiement à la livraison si détecté dans un texte. */
function codLine(...texts: string[]): string | undefined {
  const hay = texts.join(" ").toLowerCase();
  if (COD_RE.test(hay)) return "PAIEMENT : à la livraison (COD) accepté — précisé par la boutique.";
  return undefined;
}

// ─── SHOPIFY ─────────────────────────────────────────────────────────────────
async function scanShopify(base: string): Promise<StoreScan | null> {
  const [cur, prods] = await Promise.all([
    get(`${base}/cart.js`, 6000, true),
    get(`${base}/products.json?limit=24`, 9000, true),
  ]);
  if (!prods.ok || !Array.isArray(prods.body?.products) || prods.body.products.length === 0) return null;
  const currency = cur.ok ? (cur.body?.currency || "") : "";
  const products: StoreProduct[] = [];
  for (const p of prods.body.products.slice(0, 24)) {
    const v = p.variants?.[0];
    if (!p.title || !v) continue;
    const promo = v.compare_at_price && Number(v.compare_at_price) > Number(v.price) ? ` (au lieu de ${v.compare_at_price})` : "";
    const dispo = v.available === false ? " — RUPTURE" : "";
    products.push({
      title: `${p.title}${dispo}`,
      price: `${v.price}${currency ? " " + currency : ""}${promo}`,
      link: `${base}/products/${p.handle}`,
    });
  }
  // Polices standard Shopify (routes officielles) : livraison, remboursement, CGV
  const lines: string[] = [];
  for (const [label, path] of [["LIVRAISON", "/policies/shipping-policy"], ["RETOURS/REMBOURSEMENT", "/policies/refund-policy"], ["CGV", "/policies/terms-of-service"]] as const) {
    const page = await get(`${base}${path}`, 7000);
    if (!page.ok) continue;
    const t = mainText(String(page.body), 1600);
    if (t.length < 80) continue;
    lines.push(`${label} (page officielle) : ${t.slice(0, 800)}`);
  }
  const contact = await get(`${base}/pages/contact`, 6000);
  const contacts = contact.ok ? extractContacts(htmlToText(String(contact.body), 1200)) : { phones: [], emails: [] };
  // ANNUAIRE : collections officielles + pages + formulaires
  const links: StoreLink[] = [];
  const cols = await get(`${base}/collections.json?limit=15`, 8000, true);
  for (const c of Array.isArray(cols.body?.collections) ? cols.body.collections : []) {
    if (c?.handle) links.push({ kind: "collection", title: String(c.title || c.handle).slice(0, 80), url: `${base}/collections/${c.handle}` });
  }
  for (const [label, path] of [["Livraison", "/policies/shipping-policy"], ["Retours/Remboursement", "/policies/refund-policy"], ["CGV", "/policies/terms-of-service"], ["Contact", "/pages/contact"]] as const) {
    links.push({ kind: "page", title: label, url: `${base}${path}` });
  }
  const homeHtml = await get(`${base}/`, 6000);
  if (homeHtml.ok) links.push(...formLinks(String(homeHtml.body), base));
  return { platform: "shopify", title: base.replace(/^https?:\/\//, ""), description: "Boutique Shopify", phones: contacts.phones, emails: contacts.emails, lines, products, links };
}

// ─── WOOCOMMERCE ─────────────────────────────────────────────────────────────
async function scanWoo(base: string): Promise<StoreScan | null> {
  const products: StoreProduct[] = [];
  for (let page = 1; page <= 2 && products.length < 24; page++) {
    const res = await get(`${base}/wp-json/wc/store/v1/products?per_page=20&page=${page}`, 9000, true);
    if (!res.ok || !Array.isArray(res.body)) break;
    for (const p of res.body) {
      if (!p?.name || !p?.permalink) continue;
      const price = p.prices?.price != null ? Number(p.prices.price) / Math.pow(10, Number(p.prices.currency_minor_unit ?? 2)) : null;
      const regular = p.prices?.regular_price != null ? Number(p.prices.regular_price) / Math.pow(10, Number(p.prices.currency_minor_unit ?? 2)) : null;
      const promo = regular && price && regular > price ? ` (au lieu de ${regular})` : "";
      products.push({
        title: String(p.name) + (p.is_in_stock === false ? " — RUPTURE" : ""),
        price: price != null ? `${price}${p.prices?.currency_code ? " " + p.prices.currency_code : ""}${promo}` : undefined,
        link: String(p.permalink),
      });
    }
    if (!Array.isArray(res.body) || res.body.length < 20) break;
  }
  if (products.length === 0) return null;
  const home = await get(`${base}/`, 7000);
  const html = home.ok ? String(home.body) : "";
  const seen = new Set<string>();
  const sellLines = await readSellPackPages(base, html, seen);
  const contacts = extractContacts(htmlToText(html, 3000));
  // ANNUAIRE : catégories Woo dans la nav + pages + formulaires
  const links: StoreLink[] = [];
  const seenUrls = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u = m[1];
    const t = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    try { u = new URL(u, base).href; } catch { continue; }
    if (!u.startsWith(base) || seenUrls.has(u)) continue;
    const kind: StoreLink["kind"] | null = /product-category|\/categorie|\/category/i.test(u) ? "collection"
      : /livraison|shipping|retour|refund|garantie|contact|a-propos|about|cgv|policy/i.test(u) ? "page" : null;
    if (!kind || !t) continue;
    seenUrls.add(u);
    links.push({ kind, title: t, url: u });
    if (links.length >= 20) break;
  }
  links.push(...formLinks(html, base));
  return { platform: "woocommerce", title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || base.replace(/^https?:\/\//, ""), description: "Boutique WooCommerce", phones: contacts.phones, emails: contacts.emails, lines: sellLines, products, links };
}

// ─── YOUCAN ──────────────────────────────────────────────────────────────────
async function scanYouCan(base: string): Promise<StoreScan | null> {
  const products: StoreProduct[] = [];
  let total = 0;
  for (let page = 1; page <= 2 && products.length < 20; page++) {
    const res = await get(`${base}/api/products?page=${page}`, 8000, true);
    if (!res.ok || !Array.isArray(res.body?.data)) break;
    const meta = res.body?.meta?.pagination;
    if (meta?.total) total = Number(meta.total);
    for (const p of res.body.data) {
      if (!p?.name) continue;
      const promo = p.compare_at_price && Number(p.compare_at_price) > Number(p.price) ? ` (au lieu de ${p.compare_at_price})` : "";
      products.push({
        title: String(p.name) + (p.has_variants ? " (plusieurs variantes)" : ""),
        price: p.price != null ? `${p.price}${promo}` : undefined,
        link: p.public_url || `${base}/products/${p.slug}`,
      });
    }
    if (!meta || meta.count < 10) break;
  }
  if (products.length === 0) return null;
  // infos boutique + COD : dans le HTML (YouCan est server-rendered, texte réel)
  const home = await get(`${base}/`, 7000);
  const html = home.ok ? String(home.body) : "";
  const text = htmlToText(html, 3000);
  const ldJson = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1].trim()).join(" ").slice(0, 2000);
  const seen = new Set<string>();
  const sellLines = await readSellPackPages(base, html, seen);
  const contacts = extractContacts(`${text} ${ldJson}`);
  // ANNUAIRE : collections officielles + pages + formulaires
  const links: StoreLink[] = [];
  const cols = await get(`${base}/api/collections?page=1`, 8000, true);
  for (const c of Array.isArray(cols.body?.data) ? cols.body.data : []) {
    const slug = c?.slug || c?.id;
    if (!slug) continue;
    links.push({ kind: "collection", title: String(c.name || slug).slice(0, 80), url: `${base}/collections/${slug}` });
    if (links.length >= 15) break;
  }
  links.push(...formLinks(html, base));
  return { platform: "youcan", title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || base.replace(/^https?:\/\//, ""), description: `Boutique YouCan (${total || products.length} produits)`, phones: contacts.phones, emails: contacts.emails, lines: sellLines, products, links };
}

// ─── HANOTIFY ────────────────────────────────────────────────────────────────
async function scanHanotify(base: string): Promise<StoreScan | null> {
  const host = base.replace(/^https?:\/\//, "");
  const isHanotifyHost = /hanotify\.(store|online)|hanotify-store\.online$/i.test(host);
  const customSuffix = isHanotifyHost ? "" : "-custom";
  const home = await get(`${base}/`, 7000);
  const m = home.ok ? String(home.body).match(/window\.storeData=JSON\.parse\("((?:[^"\\]|\\.)*)"\)/) : null;
  if (!m) return null;
  let store: any;
  try { store = JSON.parse(JSON.parse(`"${m[1]}"`)); } catch { return null; }
  if (!store?.id) return null;

  const lines: string[] = [];
  const phones: string[] = [];
  if (Array.isArray(store.socials)) {
    for (const s of store.socials) {
      if (String(s.id).startsWith("phone")) { if (s.contact) phones.push(String(s.contact)); }
      else if (s.contact) lines.push(`${String(s.id).toUpperCase()} : ${s.contact}`);
    }
  }
  const navs = [...(store.navigation?.navigation || []), ...(store.footer?.navigation || [])];
  const cats = Array.from(new Set(navs.map((n: any) => String(n.title || "").trim()).filter(Boolean)));
  if (cats.length) lines.push(`CATÉGORIES : ${cats.join(", ")}`);
  // ANNUAIRE : réseaux sociaux + collections/catégories + pages (liens réels de la nav)
  const links: StoreLink[] = [];
  if (Array.isArray(store.socials)) {
    for (const s2 of store.socials) {
      if (!s2?.contact) continue;
      const kind: StoreLink["kind"] = String(s2.id).startsWith("phone") ? "page" : "reseau";
      if (kind === "reseau") links.push({ kind, title: String(s2.id).toUpperCase(), url: String(s2.contact) });
    }
  }
  for (const n of navs) {
    if (!n?.link || !n?.title) continue;
    let u = String(n.link);
    try { u = new URL(u, base).href; } catch { continue; }
    const kind: StoreLink["kind"] = /\/category\//i.test(u) ? "collection" : u.replace(/\/$/, "") === base.replace(/\/$/, "") ? "page" : "page";
    links.push({ kind, title: String(n.title).slice(0, 60), url: u });
  }
  const ships = Array.isArray(store.defaultShippigCosts) ? store.defaultShippigCosts.filter((s: any) => s?.cost != null) : [];
  if (ships.length) {
    const costs = ships.map((s: any) => Number(s.cost) || 0);
    lines.push(`LIVRAISON : ${ships.length} wilayas desservies, de ${Math.min(...costs)} à ${Math.max(...costs)} ${store.currency || "DA"} (domicile ; stopdesk souvent moins cher).`);
  }
  if (store.footer?.paragraph) lines.push(`MESSAGE DE LA BOUTIQUE : ${store.footer.paragraph}`);

  const products: StoreProduct[] = [];
  try {
    const listRes = await fetch(`https://api.hanotify.com/store/get-search-products?store_id=${encodeURIComponent(String(store.id))}&search=`, { signal: AbortSignal.timeout(10000) });
    const list = listRes.ok ? await listRes.json().catch(() => []) : [];
    const ids = (Array.isArray(list) ? list : []).slice(0, 12).map((p: any) => p?.id).filter(Boolean);
    const details = await Promise.all(ids.map(async (pid: any) => {
      try {
        const r = await fetch(`https://files.hanotify.store/get-product${customSuffix}?product_id=${encodeURIComponent(String(pid))}&domain=${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(8000) });
        return r.ok ? await r.json().catch(() => null) : null;
      } catch { return null; }
    }));
    for (const p of details) {
      if (!p?.title || !p?.productId) continue;
      const slug = p.slug ? encodeURIComponent(String(p.slug)) : String(p.productId);
      products.push({
        title: String(p.title).slice(0, 120),
        price: p.price != null ? `${p.price} ${store.currency || "DA"}${p.originalPrice ? ` (au lieu de ${p.originalPrice})` : ""}` : undefined,
        link: `${base}/products/${slug}/${p.productId}`,
      });
    }
  } catch { /* catalogue indisponible */ }
  return { platform: "hanotify", title: String(store.name || host), description: String(store.description || "Boutique en ligne Hanotify"), phones, emails: [], lines, products, links };
}

// ─── SCAN UNIVERSEL ──────────────────────────────────────────────────────────
/**
 * Scanne une boutique via sa plateforme. Renvoie null si ce n'est pas une
 * boutique gérée (le crawler HTML classique prend le relais).
 */
export async function scanStorePlatform(siteUrl: string): Promise<StoreScan | null> {
  const base = siteUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return null;
  const platform = await detectPlatform(base);
  if (!platform) return null;
  try {
    const scan = platform === "shopify" ? await scanShopify(base)
      : platform === "woocommerce" ? await scanWoo(base)
      : platform === "youcan" ? await scanYouCan(base)
      : await scanHanotify(base);
    if (!scan) return null;
    // Paiement à la livraison : recherché dans tous les textes du pack de vente
    const cod = codLine(scan.lines.join(" "), scan.products.map((p) => p.title).join(" "));
    if (cod) scan.lines.unshift(cod);
    // ANNUAIRE final : produits + extras, dédoublonnés (nav header ET footer !)
    scan.links = buildLinkDirectory(scan.products, scan.links || []);
    return scan;
  } catch {
    return null;
  }
}

/** Rendu texte du scan pour le crawler (sections claires pour Gemini). */
export function storeScanToText(scan: StoreScan): string {
  const lines: string[] = [];
  lines.push(`BOUTIQUE (${scan.platform.toUpperCase()}) : ${scan.title}`);
  if (scan.description) lines.push(`DESCRIPTION : ${scan.description}`);
  if (scan.phones.length) lines.push(`TÉLÉPHONE : ${scan.phones.join(" · ")}`);
  if (scan.emails.length) lines.push(`E-MAIL : ${scan.emails.join(" · ")}`);
  lines.push(...scan.lines);
  if (scan.products.length) {
    lines.push(`\nCATALOGUE (${scan.products.length} produits, prix et promos réels) :`);
    for (const p of scan.products) lines.push(`- ${p.title}${p.price ? ` — ${p.price}` : ""}${p.link ? ` — ${p.link}` : ""}`);
  }
  if (scan.links.length) {
    const kindLabel: Record<string, string> = { produit: "PRODUIT", collection: "COLLECTION", reseau: "RÉSEAU SOCIAL", formulaire: "FORMULAIRE", page: "PAGE" };
    lines.push(`\nANNUAIRE DES LIENS (${scan.links.length}, à recopier tels quels dans les fiches) :`);
    for (const l of scan.links) lines.push(`- [${kindLabel[l.kind] || l.kind}] ${l.title} — ${l.url}`);
  }
  lines.push(`\nINSTRUCTION COMMERCIALE : utilise ces informations RÉELLES (prix, promos, livraison, paiement à la livraison, retours) pour rassurer le client et clore la vente. Envoie le LIEN adapté depuis l'ANNUAIRE (produit exact, collection, formulaire, réseau) — les URLs doivent rester EXACTES. N'invente jamais un prix ou une promo absente de cette liste.`);
  return lines.join("\n");
}

// ─── RECHERCHE PRODUITS UNIVERSELLE ──────────────────────────────────────────
/**
 * Recherche produit via l'API native de la plateforme.
 * Renvoie null = pas une plateforme gérée (le site-search générique prend le
 * relais). Renvoie [] = plateforme gérée mais aucun résultat.
 */
export async function searchStorePlatform(config: any, query: string): Promise<import("./site-search").SiteSearchResult[] | null> {
  const base = String(config?.websiteUrl || "").trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(base)) return null;
  const platform = await detectPlatform(base);
  if (!platform) return null;
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const tokens = Array.from(new Set([q, ...q.split(/\s+/).filter((t) => t.length >= 3).slice(0, 3)]));
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  const titlesSeen = new Set<string>();
  const push = (title: string, url: string) => {
    if (!url || seen.has(url)) return;
    const t = String(title).toLowerCase().trim();
    if (t && titlesSeen.has(t)) return;
    seen.add(url);
    if (t) titlesSeen.add(t);
    out.push({ title: String(title).slice(0, 90), url });
  };

  if (platform === "hanotify") {
    const home = await get(`${base}/`, 6000);
    const m = home.ok ? String(home.body).match(/window\.storeData=JSON\.parse\("((?:[^"\\]|\\.)*)"\)/) : null;
    if (m) {
      try {
        const store = JSON.parse(JSON.parse(`"${m[1]}"`));
        for (const api of ["https://api.hanotify.com", "https://api.hanotify.online"]) {
          for (const t of tokens) {
            const res = await get(`${api}/store/get-search-products?store_id=${encodeURIComponent(String(store.id))}&search=${encodeURIComponent(t)}`, 6000, true);
            for (const it of Array.isArray(res.body) ? res.body : []) {
              const slug = it.slug ? encodeURIComponent(String(it.slug)) : String(it.id);
              push(it.title, `${base}/products/${slug}/${it.id}`);
              if (out.length >= 5) return out;
            }
          }
          if (out.length) return out;
        }
      } catch { /* repli générique */ }
    }
    return [];
  }

  if (platform === "shopify") {
    for (const t of tokens) {
      const res = await get(`${base}/search/suggest.json?q=${encodeURIComponent(t)}&resources[type]=product&resources[limit]=5`, 7000, true);
      const items = res.body?.resources?.results?.products || [];
      for (const p of items) { push(p.title, p.url ? new URL(p.url, base).href : `${base}/products/${p.handle}`); if (out.length >= 5) return out; }
    }
    if (out.length) return out;
    // repli : filtrer le catalogue (les boutiques avec search désactivée)
    const all = await get(`${base}/products.json?limit=150`, 9000, true);
    for (const p of Array.isArray(all.body?.products) ? all.body.products : []) {
      const hay = `${p.title} ${p.product_type || ""} ${p.vendor || ""}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t.toLowerCase()))) { push(p.title, `${base}/products/${p.handle}`); if (out.length >= 5) return out; }
    }
    return out;
  }

  if (platform === "woocommerce") {
    for (const t of tokens) {
      const res = await get(`${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(t)}&per_page=5`, 8000, true);
      for (const p of Array.isArray(res.body) ? res.body : []) { push(p.name, p.permalink); if (out.length >= 5) return out; }
    }
    return out;
  }

  // youcan : ?q= (le paramètre search est ignoré par leur API)
  for (const t of tokens) {
    const res = await get(`${base}/api/products?q=${encodeURIComponent(t)}&page=1`, 8000, true);
    for (const p of Array.isArray(res.body?.data) ? res.body.data : []) {
      push(p.name, p.public_url || `${base}/products/${p.slug}`);
      if (out.length >= 5) return out;
    }
  }
  return out;
}
