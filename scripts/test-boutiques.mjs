#!/usr/bin/env node
/**
 * Démo/validation : scan + recherche produit sur N'IMPORTE QUELLE boutique
 * gérée (Hanotify, Shopify, WooCommerce, YouCan) — utilise le VRAI module
 * (compilé à la volée depuis functions/_shared/store-adapters.ts).
 *
 * Usage : node scripts/test-boutiques.mjs <url-boutique> [recherche]
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const url = process.argv[2];
if (!url) { console.error("Usage : node scripts/test-boutiques.mjs <url> [recherche]"); process.exit(1); }
const query = process.argv[3] || "";

const out = "/tmp/adapters-demo.mjs";
execSync(`npx esbuild functions/_shared/store-adapters.ts --bundle --format=esm --platform=node --outfile=${out}`, { stdio: "pipe" });
const { scanStorePlatform, storeScanToText, searchStorePlatform } = await import(out);

console.log(`════ SCAN ${url} ════`);
const t0 = Date.now();
const scan = await scanStorePlatform(url).catch((e) => { console.error("Erreur :", e.message); return null; });
if (!scan) {
  console.log("❌ Plateforme non gérée (le crawler HTML classique prend le relais côté app).");
  process.exit(0);
}
console.log(storeScanToText(scan));
console.log(`\n⏱️  ${(scan.products.length)} produits · ${((Date.now() - t0) / 1000).toFixed(1)}s · coût API IA : 0 DA`);

if (query) {
  console.log(`\n════ RECHERCHE PRODUIT « ${query} » (ce que le bot enverra au client) ════`);
  const res = await searchStorePlatform({ websiteUrl: url }, query).catch(() => null);
  if (res === null) console.log("(non géré → recherche générique)");
  else if (res.length === 0) console.log("(aucun résultat → l'IA utilisera le catalogue appris au scan)");
  else for (const r of res) console.log(` 🔗 ${r.title} → ${r.url}`);
}
