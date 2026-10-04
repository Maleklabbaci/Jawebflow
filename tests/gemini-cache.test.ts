import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGeminiContextCache, resetGeminiContextCacheForTests } from '../functions/_shared/gemini-cache';

const stableInstruction = 'Consigne permanente du conseiller commercial. '.repeat(90);
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
    expect(body.ttl).toBe('3600s');
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
