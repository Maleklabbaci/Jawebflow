#!/usr/bin/env node
/**
 * Test live du scanner Hanotify (même logique que functions/api/crawler/analyze.ts).
 * Usage : node scripts/test-hanotify.mjs https://yourcnm.store [requête-recherche]
 * Marche sur TOUTE boutique Hanotify (domaine hanotify.store ou domaine custom).
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const siteUrl = (process.argv[2] || "https://yourcnm.store").replace(/\/+$/, "");
const testQuery = process.argv[3] || "coque";

let host = new URL(siteUrl).host;
const isHanotifyHost = /hanotify\.(store|online)|hanotify-store\.online$/i.test(host);
const customSuffix = isHanotifyHost ? "" : "-custom";

// 1) storeData dans le HTML de la home
const home = await fetch(siteUrl + "/", { headers: { "User-Agent": UA } }).then(r => r.text());
const m = home.match(/window\.storeData=JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
if (!m) { console.error("❌ Pas une boutique Hanotify (storeData absent)"); process.exit(1); }
const store = JSON.parse(JSON.parse(`"${m[1]}"`));

console.log("═══ CE QUE LE SCAN VA EXTRAIRE ═══");
const lines = [];
lines.push(`BOUTIQUE : ${store.name || host}`);
if (store.description) lines.push(`DESCRIPTION : ${store.description}`);
lines.push(`DEVISE : ${store.currency || "DZD"} · PAYS : ${store.country?.name || "Algérie"}`);
for (const s of store.socials || []) {
  if (String(s.id).startsWith("phone")) lines.push(`TÉLÉPHONE : ${s.contact}`);
  else lines.push(`${String(s.id).toUpperCase()} : ${s.contact}`);
}
const navs = [...(store.navigation?.navigation || []), ...(store.footer?.navigation || [])];
const cats = [...new Set(navs.map(n => String(n.title || "").trim()).filter(Boolean))];
lines.push(`CATÉGORIES : ${cats.join(", ")}`);
const ships = (store.defaultShippigCosts || []).filter(s => s.cost != null);
if (ships.length) {
  const c = ships.map(s => Number(s.cost));
  lines.push(`LIVRAISON : ${ships.length} wilayas, de ${Math.min(...c)} à ${Math.max(...c)} ${store.currency || "DA"}`);
}
if (store.footer?.paragraph) lines.push(`MESSAGE DE LA BOUTIQUE : ${store.footer.paragraph}`);
console.log(lines.join("\n"));

// 2) catalogue : recherche à vide + détails (prix réels)
console.log("\n═══ CATALOGUE (via API Hanotify) ═══");
const list = await fetch(`https://api.hanotify.com/store/get-search-products?store_id=${encodeURIComponent(String(store.id))}&search=`)
  .then(r => r.json()).catch(() => []);
const ids = (Array.isArray(list) ? list : []).slice(0, 12).map(p => p?.id).filter(Boolean);
const details = await Promise.all(ids.map(pid =>
  fetch(`https://files.hanotify.store/get-product${customSuffix}?product_id=${encodeURIComponent(String(pid))}&domain=${encodeURIComponent(host)}`)
    .then(r => r.json()).catch(() => null)
));
for (const p of details.filter(Boolean)) {
  if (!p?.title) continue;
  const price = p.price != null ? `${p.price}${p.originalPrice ? ` ${store.currency || "DA"} (au lieu de ${p.originalPrice})` : ` ${store.currency || "DA"}`}` : "—";
  const slug = p.slug ? encodeURIComponent(String(p.slug)) : String(p.productId);
  console.log(` • ${p.title} — ${price}\n   ${siteUrl}/products/${slug}/${p.productId}`);
}

// 3) simulation : le client cherche un produit, que renvoie le bot ?
console.log(`\n═══ RECHERCHE BOT « ${testQuery} » (mode shopping) ═══`);
const tries = [testQuery, ...testQuery.split(/\s+/).filter(t => t.length >= 3)];
const seen = new Set(); let shown = 0;
for (const api of ["https://api.hanotify.com", "https://api.hanotify.online"]) {
  for (const q of tries) {
    const items = await fetch(`${api}/store/get-search-products?store_id=${encodeURIComponent(String(store.id))}&search=${encodeURIComponent(q)}`)
      .then(r => r.json()).catch(() => []);
    for (const it of Array.isArray(items) ? items : []) {
      if (!it?.id || seen.has(it.id)) continue;
      seen.add(it.id);
      const slug = it.slug ? encodeURIComponent(String(it.slug)) : String(it.id);
      console.log(` 🔗 ${it.title} → ${siteUrl}/products/${slug}/${it.id}`);
      if (++shown >= 5) process.exit(0);
    }
  }
  if (shown) break;
}
if (!shown) console.log(" (aucun résultat — l'IA retombera sur la base de connaissance du scan)");
