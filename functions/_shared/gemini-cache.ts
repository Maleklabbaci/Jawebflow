/**
 * Gemini explicit context-cache helper.
 *
 * Only the stable system instruction is cached (seller playbook + assistant
 * profile/rules). Product fiches, FAQ excerpts, conversation memory and each
 * customer message stay outside the cache so RAG remains current and compact.
 * The first request is never delayed: it is sent normally while the cache is
 * warmed with waitUntil for later requests in the same Worker isolate.
 */

type CacheEntry = { name: string; expiresAt: number };

type CacheEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_CONTEXT_CACHE_ENABLED?: string;
  GEMINI_CONTEXT_CACHE_TTL_SECONDS?: string | number;
};

const MIN_STABLE_PROMPT_CHARS = 2800; // short prompts are cheaper to send than to cache
const DEFAULT_TTL_SECONDS = 3600;
const MAX_LOCAL_ENTRIES = 80;
const entries = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<void>>();
const blockedUntil = new Map<string, number>();

function isEnabled(env: CacheEnv): boolean {
  return !['0', 'false', 'off', 'no'].includes(String(env.GEMINI_CONTEXT_CACHE_ENABLED || 'true').trim().toLowerCase());
}

function ttlSeconds(env: CacheEnv): number {
  const parsed = Number(env.GEMINI_CONTEXT_CACHE_TTL_SECONDS);
  return Number.isFinite(parsed) ? Math.max(300, Math.min(86_400, Math.floor(parsed))) : DEFAULT_TTL_SECONDS;
}

function keyFor(model: string, instruction: string): string {
  // La consigne elle-même est la clé : aucune collision de hash ne peut
  // réutiliser le cache d'une autre entreprise ou d'un autre profil.
  return `${model}\u0000${instruction}`;
}

function remember(key: string, entry: CacheEntry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_LOCAL_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function blockCache(key: string, until: number) {
  blockedUntil.delete(key);
  blockedUntil.set(key, until);
  while (blockedUntil.size > MAX_LOCAL_ENTRIES) {
    const oldest = blockedUntil.keys().next().value;
    if (oldest === undefined) break;
    blockedUntil.delete(oldest);
  }
}

async function createCache(env: CacheEnv, model: string, instruction: string, key: string): Promise<void> {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return;
  const ttl = ttlSeconds(env);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.startsWith('models/') ? model : `models/${model}`,
        systemInstruction: { parts: [{ text: instruction }] },
        displayName: 'jawebflow-static-sales-prompt-v2',
        ttl: `${ttl}s`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({})) as any;
    const name = typeof payload?.name === 'string' ? payload.name : '';
    if (response.ok && name.startsWith('cachedContents/')) {
      const expiry = payload?.expireTime ? Date.parse(payload.expireTime) : Date.now() + ttl * 1000;
      remember(key, { name, expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + ttl * 1000 });
      console.info(`[gemini-cache] cache système prêt (${model}, ${Number(payload?.usageMetadata?.totalTokenCount || 0)} tokens)`);
      return;
    }

    const reason = String(payload?.error?.message || payload?.message || `HTTP ${response.status}`).slice(0, 180);
    // Les petites consignes ou modèles qui ne supportent pas le cache ne
    // doivent pas déclencher un appel de création à chaque message.
    const cooldown = /too small|minimum token|not supported|unsupported|invalid.argument/i.test(reason) ? 6 * 60 * 60_000 : 60_000;
    blockCache(key, Date.now() + cooldown);
    console.info(`[gemini-cache] cache ignoré (${model}): ${reason}`);
  } catch (error: any) {
    blockCache(key, Date.now() + 30_000);
    console.info(`[gemini-cache] indisponible, le bot continue sans cache (${error?.message || error})`);
  }
}

/** Renvoie immédiatement le cache local s'il est prêt, et sinon le préchauffe sans attendre. */
export function getGeminiContextCache(
  env: CacheEnv,
  model: string,
  systemInstruction: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): string | null {
  if (!isEnabled(env) || !env.GEMINI_API_KEY || systemInstruction.length < MIN_STABLE_PROMPT_CHARS) return null;
  const key = keyFor(model, systemInstruction);
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now() + 30_000) return existing.name;
  if (existing) entries.delete(key);
  const blocked = blockedUntil.get(key) || 0;
  if (blocked > Date.now() || pending.has(key)) return null;

  const work = createCache(env, model, systemInstruction, key).finally(() => pending.delete(key));
  pending.set(key, work);
  if (typeof waitUntil === 'function') {
    try { waitUntil(work); } catch { void work.catch(() => {}); }
  } else {
    // En développement Node, laisser la promesse se terminer sans créer de rejet non géré.
    void work.catch(() => {});
  }
  return null;
}

/** Réservé aux tests unitaires pour isoler les ressources de cache entre scénarios. */
export function resetGeminiContextCacheForTests(): void {
  entries.clear();
  pending.clear();
  blockedUntil.clear();
}
