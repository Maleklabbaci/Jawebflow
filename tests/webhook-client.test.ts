import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPublicHttpUrl } from '../functions/_shared/safe-url';
import { forwardLead, postJson } from '../functions/_shared/lead-webhook';
import * as testPing from '../functions/api/webhook/test-ping';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => { fx = installFakes(); seedMerchant(fx.supabase); });
afterEach(() => { expect(fx.other).toEqual([]); fx.restore(); });

describe('checkPublicHttpUrl', () => {
  it.each([
    'https://hooks.zapier.com/hooks/catch/123/abc/',
    'https://hook.eu1.make.com/xyz',
    'https://n8n.maboutique.dz/webhook/leads',
    'http://crm.exemple.com/api',
  ])('accepte %s', (u) => expect(checkPublicHttpUrl(u).ok).toBe(true));

  it.each([
    ['', /Colle l’adresse/],
    ['pas une adresse', /pas valide/],
    ['ftp://exemple.com/x', /https:\/\//],
    ['https://localhost/hook', /vraie adresse/],
    ['https://127.0.0.1/hook', /vraie adresse/],
    ['https://169.254.169.254/latest/meta-data', /vraie adresse/],
    ['https://10.0.0.5/x', /vraie adresse/],
    ['https://[::1]/x', /vraie adresse/],
    ['https://intranet/x', /vraie adresse/],
    ['https://serveur.local/x', /vraie adresse/],
    ['https://machine.internal/x', /vraie adresse/],
    ['https://user:pass@exemple.com/x', /identifiant/],
    ['https://exemple.com:8443/x', /ports/],
  ])('refuse %s', (u, why) => {
    const r = checkPublicHttpUrl(u);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(why);
  });
});

describe('postJson', () => {
  it('succès : message clair, durée, corps de réponse', async () => {
    fx.external.handler = () => new Response('{"ok":true}', { status: 200 });
    const r = await postJson('https://hooks.zapier.com/x', { hello: 1 }, 'webhook.ping');
    expect(r).toMatchObject({ success: true, status: 200 });
    expect(r.message).toMatch(/a bien reçu/);
    expect(r.responseBody).toBe('{"ok":true}');
    const call = fx.external.calls[0];
    expect(call.init.method).toBe('POST');
    expect(call.init.redirect).toBe('manual'); // jamais de redirection suivie (sécurité)
    expect(call.init.headers['X-JawebFlow-Event']).toBe('webhook.ping');
    expect(JSON.parse(call.init.body)).toEqual({ hello: 1 });
  });

  it.each([
    [404, /introuvable/],
    [401, /refuse l’accès/],
    [500, /erreur \(code 500\)/],
    [302, /redirige ailleurs/],
  ])('code %i expliqué en français', async (status, msg) => {
    fx.external.handler = () => new Response('x', { status });
    const r = await postJson('https://exemple.com/hook', {}, 'e');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(msg);
  });

  it('adresse interdite : aucun appel réseau', async () => {
    fx.external.handler = () => new Response('x');
    const r = await postJson('https://127.0.0.1/hook', {}, 'e');
    expect(r.success).toBe(false);
    expect(fx.external.calls).toHaveLength(0);
  });

  it('réseau en panne et délai dépassé expliqués', async () => {
    fx.external.handler = () => { throw new TypeError('fetch failed'); };
    expect((await postJson('https://exemple.com/hook', {}, 'e')).message).toMatch(/Impossible de joindre/);
    fx.external.handler = () => { const e: any = new Error('timeout'); e.name = 'TimeoutError'; throw e; };
    expect((await postJson('https://exemple.com/hook', {}, 'e')).message).toMatch(/n’a pas répondu en 8 secondes/);
  });
});

describe('POST /api/webhook/test-ping (bouton « Tester la connexion »)', () => {
  const call = async (body: any, token: string | null = 'BEARER_U1') => {
    const res = await testPing.onRequestPost({
      request: new Request('https://jawebflow.test/api/webhook/test-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      }),
      env: ENV,
    });
    return { status: res.status, json: (await res.json()) as any };
  };

  it('exige d’être connecté (pas de relais anonyme)', async () => {
    fx.external.handler = () => new Response('ok');
    expect((await call({ webhookUrl: 'https://exemple.com/x' }, null)).status).toBe(401);
    expect(fx.external.calls).toHaveLength(0);
  });

  it('envoie le message d’essai et renvoie le bilan attendu par l’écran', async () => {
    fx.external.handler = () => new Response('reçu', { status: 200 });
    const payload = { event: 'webhook.ping', deliveryId: 'p1', data: { message: 'ping' } };
    const r = await call({ webhookUrl: 'https://hooks.zapier.com/x', testType: 'ping', payload });
    expect(r.json).toMatchObject({ success: true, status: 200, statusText: 'OK', sentPayload: payload });
    expect(typeof r.json.responseTimeMs).toBe('number');
    expect(JSON.parse(fx.external.calls[0].init.body)).toEqual(payload);
  });

  it('test « nouveau client » : l’événement est annoncé dans l’en-tête', async () => {
    fx.external.handler = () => new Response('ok');
    await call({ webhookUrl: 'https://exemple.com/x', testType: 'lead_test', payload: { event: 'lead.captured.test' } });
    expect(fx.external.calls[0].init.headers['X-JawebFlow-Event']).toBe('lead.captured.test');
  });

  it('adresse locale refusée avec une explication ; message d’essai absurde remplacé', async () => {
    fx.external.handler = () => new Response('ok');
    const bad = await call({ webhookUrl: 'http://localhost:3000/x' });
    expect(bad.json).toMatchObject({ success: false });
    expect(bad.json.message).toMatch(/vraie adresse/);
    await call({ webhookUrl: 'https://exemple.com/x', payload: 'n’importe quoi' });
    const sent = JSON.parse(fx.external.calls[0].init.body);
    expect(sent.source).toBe('JawebFlow Platform Webhook Verifier');
  });
});

describe('forwardLead : les nouveaux clients partent vers l’outil du marchand', () => {
  const setUrl = (url: string) => { fx.supabase.tables.assistants[0].config = { webhookUrl: url }; };

  it('transmet le client (nom, téléphone, besoin, canal) à l’adresse enregistrée', async () => {
    setUrl('https://hooks.zapier.com/lead');
    fx.external.handler = () => new Response('ok');
    await forwardLead(ENV, 'asst1', { name: 'Sara', phone: '0555123456', city: 'Blida', need: 'Je veux une robe', source: 'Instagram', contactKey: 'C1' });
    expect(fx.external.calls).toHaveLength(1);
    const body = JSON.parse(fx.external.calls[0].init.body);
    expect(body).toMatchObject({
      event: 'lead.captured',
      source: 'JawebFlow',
      assistant: { id: 'asst1', businessName: 'Boutique Nour' },
      data: { fullName: 'Sara', phone: '0555123456', city: 'Blida', need: 'Je veux une robe', channel: 'Instagram' },
    });
    expect(fx.external.calls[0].init.headers['X-JawebFlow-Event']).toBe('lead.captured');
  });

  it('rien n’est envoyé si le marchand n’a pas enregistré d’adresse', async () => {
    fx.external.handler = () => new Response('ok');
    await forwardLead(ENV, 'asst1', { phone: '0555000000', source: 'site web', contactKey: 'C2' });
    expect(fx.external.calls).toHaveLength(0);
  });

  it('le même client n’est pas renvoyé en boucle', async () => {
    setUrl('https://hooks.zapier.com/lead');
    fx.external.handler = () => new Response('ok');
    await forwardLead(ENV, 'asst1', { phone: '0555999999', source: 'site web' });
    await forwardLead(ENV, 'asst1', { phone: '0555999999', source: 'site web' });
    expect(fx.external.calls).toHaveLength(1);
  });

  it('une adresse en panne ne casse jamais la conversation', async () => {
    setUrl('https://hooks.zapier.com/lead');
    fx.external.handler = () => { throw new TypeError('fetch failed'); };
    await expect(forwardLead(ENV, 'asst1', { phone: '0555888888', source: 'site web' })).resolves.toBeUndefined();
  });
});
