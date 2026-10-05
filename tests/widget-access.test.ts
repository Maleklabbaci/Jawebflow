import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/chat.js';
import { evaluateWidgetAccess } from '../functions/_shared/widget-access';
import { rateLimited } from '../functions/_shared/rate-limit';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => fx.restore());

describe('evaluateWidgetAccess', () => {
  it('laisse passer si rien n’est configuré (rétrocompatibilité)', () => {
    expect(evaluateWidgetAccess({}, { key: undefined, origin: 'https://nimportequoi.com' }).allowed).toBe(true);
    expect(evaluateWidgetAccess(null, {}).allowed).toBe(true);
  });

  it('exige la bonne clé widget', () => {
    const config = { widgetKey: 'SECRET' };
    expect(evaluateWidgetAccess(config, { key: 'SECRET' }).allowed).toBe(true);
    expect(evaluateWidgetAccess(config, { key: 'autre' }).allowed).toBe(false);
    expect(evaluateWidgetAccess(config, {}).allowed).toBe(false);
  });

  it('restreint aux domaines autorisés, sous-domaines compris', () => {
    const config = { allowedDomains: ['https://client.dz'] };
    expect(evaluateWidgetAccess(config, { origin: 'https://client.dz' }).allowed).toBe(true);
    expect(evaluateWidgetAccess(config, { origin: 'https://boutique.client.dz' }).allowed).toBe(true);
    expect(evaluateWidgetAccess(config, { origin: 'https://client.dz.evil.com' }).allowed).toBe(false);
    expect(evaluateWidgetAccess(config, { origin: 'https://autre.com' }).allowed).toBe(false);
    expect(evaluateWidgetAccess(config, { origin: '' }).allowed).toBe(false);
  });
});

describe('rateLimited', () => {
  it('bloque au-delà du quota dans la fenêtre', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimited('k', { max: 3, windowMs: 60_000, now })).toBe(false);
    expect(rateLimited('k', { max: 3, windowMs: 60_000, now })).toBe(true);
    // Une autre clé n’est pas affectée.
    expect(rateLimited('autre', { max: 3, windowMs: 60_000, now })).toBe(false);
    // Après la fenêtre, ça repasse.
    expect(rateLimited('k', { max: 3, windowMs: 60_000, now: now + 61_000 })).toBe(false);
  });
});

describe('/api/chat — isolation des clients', () => {
  const call = (body: Record<string, unknown>) => onRequestPost({
    env: { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' },
    request: new Request('https://jawebflow.test/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as any);

  beforeEach(() => {
    fx.supabase.seed('assistants', [{
      id: 'asst2', user_id: 'u2', business_name: 'Client Protégé',
      config: { widgetKey: 'SECRET', allowedDomains: ['https://client.dz'] },
    }]);
  });

  it('refuse une mauvaise clé ou un domaine étranger (403)', async () => {
    const badKey = await call({ assistantId: 'asst2', sessionId: 's', messageId: 'm1', message: 'bonjour', key: 'mauvaise', origin: 'https://client.dz' });
    expect(badKey.status).toBe(403);

    const badOrigin = await call({ assistantId: 'asst2', sessionId: 's', messageId: 'm2', message: 'bonjour', key: 'SECRET', origin: 'https://evil.com' });
    expect(badOrigin.status).toBe(403);
  });

  it('accepte la bonne clé depuis un domaine autorisé', async () => {
    const ok = await call({ assistantId: 'asst2', sessionId: 's', messageId: 'm3', message: 'bonjour', key: 'SECRET', origin: 'https://client.dz' });
    expect(ok.status).toBe(200);
  });
});
