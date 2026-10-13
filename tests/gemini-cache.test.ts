import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGeminiContextCache, geminiCacheDiagnostic, geminiContextCacheStats, resetGeminiContextCacheForTests } from '../functions/_shared/gemini-cache';

// ⚠️ Google n'accepte pas de cache sous 4 096 jetons (~16 400 caractères) :
// la fixture doit donc dépasser ce plancher pour tester la création.
const stableInstruction = 'Consigne permanente du conseiller commercial. '.repeat(400);
const env = { GEMINI_API_KEY: 'gemini-test-key' };

afterEach(() => {
  resetGeminiContextCacheForTests();
  vi.unstubAllGlobals();
});

describe('cache de contexte Gemini', () => {
  it('préchauffe en arrière-plan, ne met en cache que la consigne stable et réutilise la ressource', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      name: 'cachedContents/stable-prompt',
      expireTime: new Date(Date.now() + 3_600_000).toISOString(),
      usageMetadata: { totalTokenCount: 1_300 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const pending: Promise<unknown>[] = [];

    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction, (promise) => pending.push(promise))).toBeNull();
    expect(pending).toHaveLength(1);
    await Promise.all(pending);

    const [url, init] = fetch.mock.calls[0] as any;
    expect(String(url)).toContain('/v1beta/cachedContents?key=gemini-test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('models/gemini-3.1-flash-lite');
    expect(body.systemInstruction.parts[0].text).toBe(stableInstruction);
    expect(body.contents).toBeUndefined(); // RAG et conversation ne sont jamais mis en cache
    // TTL court (10 min) : le stockage coûte 1 $/M de jetons PAR HEURE, donc
    // garder un cache toute la journée coûterait plus qu'il ne rapporte.
    expect(body.ttl).toBe('600s');
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction)).toBe('cachedContents/stable-prompt');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ne crée rien si le cache est désactivé ou si la consigne est trop courte', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(getGeminiContextCache({ ...env, GEMINI_CONTEXT_CACHE_ENABLED: 'false' }, 'gemini-3.1-flash-lite', stableInstruction)).toBeNull();
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', 'consigne courte')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('respecte le TTL demandé par l’environnement', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      name: 'cachedContents/ttl-long',
      expireTime: new Date(Date.now() + 7_200_000).toISOString(),
      usageMetadata: { totalTokenCount: 5_100 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const pending: Promise<unknown>[] = [];
    getGeminiContextCache({ ...env, GEMINI_CONTEXT_CACHE_TTL_SECONDS: '7200' }, 'gemini-3.1-flash-lite', stableInstruction, (promise) => pending.push(promise));
    await Promise.all(pending);
    const [, init] = fetch.mock.calls[0] as any;
    expect(JSON.parse(init.body).ttl).toBe('7200s');
  });

  it('refuse le cache sous le plancher Google SANS dépenser d’appel réseau', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    // Une consigne réaliste (7 200 caractères ≈ 1 800 jetons) reste très en
    // dessous du plancher de 4 096 jetons : le RAG par tour est plus rentable.
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', 'x'.repeat(7_200))).toBeNull();
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', 'x'.repeat(16_000))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(geminiContextCacheStats().skippedSmall).toBeGreaterThanOrEqual(2);
    expect(geminiContextCacheStats().minTokens).toBe(4_096);
  });

  it('compte les créations et les relectures (et survit à une panne de cache)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      name: 'cachedContents/stable-prompt',
      expireTime: new Date(Date.now() + 900_000).toISOString(),
      usageMetadata: { totalTokenCount: 5_100 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const pending: Promise<unknown>[] = [];
    getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction, (promise) => pending.push(promise));
    await Promise.all(pending);
    getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction);
    const stats = geminiContextCacheStats();
    expect(stats.created).toBe(1);
    expect(stats.reused).toBeGreaterThanOrEqual(1);
    expect(geminiCacheDiagnostic(stableInstruction, 'cachedContents/stable-prompt')).toMatch(/cache Gemini réutilisé/i);
    expect(geminiCacheDiagnostic('prompt court', null)).toMatch(/envoyée en entier/i);
  });

  it('une erreur de cache reste transparente pour le chat et n’est pas répétée à chaque message', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'minimum token count not met' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetch);
    const pending: Promise<unknown>[] = [];
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction, (promise) => pending.push(promise))).toBeNull();
    await Promise.all(pending);
    expect(getGeminiContextCache(env, 'gemini-3.1-flash-lite', stableInstruction)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
