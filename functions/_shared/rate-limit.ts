/**
 * JAWEBFLOW — LIMITATION DE DÉBIT (fenêtre glissante, en mémoire)
 * ------------------------------------------------------------
 * Garde-fou contre l'épuisement du quota Gemini par un tiers : chaque clé
 * (assistant + origine) n'a droit qu'à `max` appels par fenêtre. C'est en
 * mémoire par isolate Cloudflare (best-effort) ; en production, complétez avec
 * une règle de rate limiting Cloudflare (WAF) qui, elle, est globale.
 */

const buckets = new Map<string, number[]>();

export function rateLimited(
  key: string,
  opts: { max?: number; windowMs?: number; now?: number } = {},
): boolean {
  const max = opts.max ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}
