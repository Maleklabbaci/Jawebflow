/**
 * JAWEBFLOW — Catch-all Pages Function.
 *
 * Rôle 1 : injecter la config Supabase dans le HTML servi
 * (window.__JAWEBFLOW_ENV__) avant le bundle JS. Les variables VITE_*
 * sont normalement figées au BUILD par Vite ; les secrets "runtime" de
 * Cloudflare (wrangler pages secret put) n'atteignent jamais le build.
 * Ce pont rend ces secrets disponibles côté navigateur SANS rebuild.
 *
 * Rôle 2 : fallback SPA — les routes sans extension (/admin, /login...)
 * renvoient index.html au lieu d'un 404.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Ne jamais intercepter les routes d'API (fonctions déjà plus spécifiques
  // sont matchées avant le catch-all, ceci est une sécurité).
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  let res = await env.ASSETS.fetch(request);

  // Fallback SPA : requête "navigation" (accepte du HTML, pas d'extension
  // de fichier) qui ne matche aucun asset -> servir index.html.
  const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');
  const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
  if (res.status === 404 && acceptsHtml && !hasFileExtension) {
    res = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    if (res.status !== 200) return res;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return res;

  const cfg = {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
  };

  // Rien à injecter -> servir tel quel (le build a peut-être déjà les VITE_*).
  if (!cfg.VITE_SUPABASE_URL && !cfg.VITE_SUPABASE_ANON_KEY) return res;

  let html = await res.text();
  const inject = `<script>window.__JAWEBFLOW_ENV__=${JSON.stringify(cfg)};</script>`;
  if (!html.includes('__JAWEBFLOW_ENV__')) {
    html = html.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>${inject}`);
  }

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}
