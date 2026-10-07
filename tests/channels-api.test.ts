/**
 * /api/channels/integrations — brancher une messagerie depuis le tableau de bord
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. la connexion est réservée au propriétaire (jeton Supabase exigé) ;
 *   2. LE JETON NE SORT JAMAIS vers le navigateur ;
 *   3. on ne peut pas brancher le canal d'un AUTRE marchand ;
 *   4. un mauvais jeton est refusé AVANT d'être enregistré (test réel) ;
 *   5. la déconnexion efface vraiment le jeton.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as api from '../functions/api/channels/integrations';
import {
  ENV_CHANNELS, PAGE_ID, TG_TOKEN, USER_ID, WA_PHONE_ID,
  installFakes, seedChannel, seedMerchant, seedPlan,
} from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => {
  expect(fx.other).toEqual([]);
  fx.restore();
});

function call(
  handler: (c: any) => Promise<Response>,
  method: string,
  path: string,
  opts: { token?: string | null; body?: any; env?: any } = {},
) {
  const token = opts.token === undefined ? 'BEARER_U1' : opts.token;
  const request = new Request(`https://jawebflow.test${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return handler({ request, env: opts.env || ENV_CHANNELS }).then(async (res) => ({
    status: res.status,
    json: (await res.json().catch(() => null)) as any,
  }));
}

const connect = (body: Record<string, any>) => call(api.onRequestPost, 'POST', '/api/channels/integrations', { body });

describe('GET — état des connexions', () => {
  it('exige d’être connecté (401 sans jeton valide)', async () => {
    expect((await call(api.onRequestGet, 'GET', '/api/channels/integrations', { token: null })).status).toBe(401);
    expect((await call(api.onRequestGet, 'GET', '/api/channels/integrations', { token: 'FAUX' })).status).toBe(401);
  });

  it('annonce les 4 canaux avec leur mode d’emploi et l’adresse du webhook', async () => {
    const { status, json } = await call(api.onRequestGet, 'GET', '/api/channels/integrations?assistantId=asst1');
    expect(status).toBe(200);
    expect(json.channels.map((c: any) => c.id)).toEqual(['messenger', 'whatsapp', 'telegram', 'tiktok']);
    const wa = json.channels.find((c: any) => c.id === 'whatsapp');
    expect(wa.paid).toBe(true);                       // seul canal payant
    expect(wa.webhookUrl).toContain('/api/webhook/whatsapp');
    const tg = json.channels.find((c: any) => c.id === 'telegram');
    expect(tg.keyedWebhook).toBe(true);               // routage par clé d'URL
  });

  it('NE RENVOIE JAMAIS LE JETON, même à son propriétaire', async () => {
    seedChannel(fx.supabase, 'messenger', { access_token: 'JETON_SECRET_123' });
    seedChannel(fx.supabase, 'messenger', { account_id: 'AUTRE_PAGE', access_token: 'JETON_2' });
    const { json } = await call(api.onRequestGet, 'GET', '/api/channels/integrations?assistantId=asst1');
    const raw = JSON.stringify(json);
    expect(raw).not.toContain('JETON_SECRET_123');
    expect(raw).not.toContain('JETON_2');
    const messenger = json.integrations.find((i: any) => i.channel === 'messenger');
    expect(messenger).toMatchObject({ hasToken: true });
    expect(messenger).not.toHaveProperty('access_token');
    expect(messenger).not.toHaveProperty('accessToken');
  });

  it('migration SQL pas faite : le dit clairement au lieu de planter', async () => {
    fx.supabase.missing.add('channel_integrations');
    const { status, json } = await call(api.onRequestGet, 'GET', '/api/channels/integrations?assistantId=asst1');
    expect(status).toBe(200);
    expect(json).toMatchObject({ setupRequired: true, integrations: [] });
  });

  it('donne la jauge WhatsApp du mois (messages facturés / forfait du plan)', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro'); // le plan vit dans config.plan
    fx.supabase.seed('channel_messages', [
      { id: 'm1', assistant_id: 'asst1', channel: 'whatsapp', direction: 'out', billable: true, created_at: new Date().toISOString() },
      { id: 'm2', assistant_id: 'asst1', channel: 'whatsapp', direction: 'out', billable: false, created_at: new Date().toISOString() },
    ]);
    const { json } = await call(api.onRequestGet, 'GET', '/api/channels/integrations?assistantId=asst1');
    expect(json.whatsapp).toMatchObject({ billable: 1, free: 1, quota: 1000, remaining: 999 });
  });
});

describe('POST — connecter un canal', () => {
  it('exige d’être connecté et un canal connu', async () => {
    expect((await call(api.onRequestPost, 'POST', '/api/channels/integrations', { token: null, body: {} })).status).toBe(401);
    expect((await connect({ channel: 'carrier-pigeon', accountId: 'x'.repeat(14), token: 'T', assistantId: 'asst1' })).status).toBe(400);
  });

  it('refuse une clé de liaison trop courte (Telegram/TikTok : elle protège les messages)', async () => {
    const short = await connect({ channel: 'telegram', accountId: 'court', token: TG_TOKEN, assistantId: 'asst1' });
    expect(short.status).toBe(400);
    expect(short.json.error).toContain('12 caractères');
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('MESSENGER : teste le jeton, vérifie que c’est la BONNE page, puis enregistre', async () => {
    const ok = await connect({ channel: 'messenger', accountId: PAGE_ID, token: 'PAGE_TOKEN_1', assistantId: 'asst1' });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true, verified: true });
    const row = fx.supabase.rows('channel_integrations')[0];
    expect(row).toMatchObject({ channel: 'messenger', account_id: PAGE_ID, assistant_id: 'asst1', user_id: USER_ID, connected: true });
    expect(row.access_token).toBe('PAGE_TOKEN_1');
    // Aucun jeton dans la réponse.
    expect(JSON.stringify(ok.json)).not.toContain('PAGE_TOKEN_1');
  });

  it('MESSENGER : un jeton qui appartient à une AUTRE page est refusé', async () => {
    const res = await connect({ channel: 'messenger', accountId: 'MAUVAISE_PAGE', token: 'PAGE_TOKEN_1', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('autre page');
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('un jeton invalide (Meta refuse) n’est JAMAIS enregistré', async () => {
    fx.graph.failWhen((c) => c.method === 'GET' && c.path === '/me', 400, { message: 'Invalid OAuth access token', code: 190 });
    const res = await connect({ channel: 'messenger', accountId: PAGE_ID, token: 'JETON_POURRI', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('expiré');
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('WHATSAPP : vérifie le numéro annoncé', async () => {
    const ok = await connect({ channel: 'whatsapp', accountId: WA_PHONE_ID, token: 'WA_TOKEN_1', assistantId: 'asst1', phoneNumber: '+213 555 00 01 11' });
    expect(ok.status).toBe(200);
    expect(ok.json.message).toContain('Numéro vérifié');
    expect(fx.supabase.rows('channel_integrations')[0]).toMatchObject({ channel: 'whatsapp', account_id: WA_PHONE_ID, phone_number: '+213 555 00 01 11' });
  });

  it('WHATSAPP : sans identifiant de numéro, refus immédiat', async () => {
    const res = await connect({ channel: 'whatsapp', accountId: '', token: 'WA_TOKEN_1', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('Identifiant');
  });

  it('TELEGRAM : le jeton est validé par getMe et le nom du bot est retenu', async () => {
    const ok = await connect({ channel: 'telegram', accountId: 'cle-secrete-longue-1', token: TG_TOKEN, assistantId: 'asst1' });
    expect(ok.status).toBe(200);
    expect(ok.json.message).toContain('@jawebflow_test_bot');
    expect(ok.json.webhookUrl).toContain('key=cle-secrete-longue-1');
  });

  it('TELEGRAM : un jeton refusé par Telegram remonte la raison exacte', async () => {
    const res = await connect({ channel: 'telegram', accountId: 'cle-secrete-longue-2', token: 'FAUX_JETON', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('Telegram a refusé');
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('TIKTOK : enregistré sans test, et on le DIT (l’API de vérification n’existe pas encore)', async () => {
    const ok = await connect({ channel: 'tiktok', accountId: 'tt-cle-secrete-1', token: 'TT_TOKEN_1', assistantId: 'asst1' });
    expect(ok.status).toBe(200);
    expect(ok.json.verified).toBe(false);
    expect(ok.json.message).toContain("sans test");
  });

  it('ON NE PREND PAS LE CANAL D’UN AUTRE : un compte déjà relié à un autre marchand est refusé', async () => {
    seedChannel(fx.supabase, 'messenger', {
      id: 'int_autre',
      user_id: '22222222-2222-4222-8222-222222222222',
      account_id: PAGE_ID,
      access_token: 'TOKEN_AUTRE',
    });
    const res = await connect({ channel: 'messenger', accountId: PAGE_ID, token: 'PAGE_TOKEN_1', assistantId: 'asst1' });
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('déjà relié');
    // Le jeton de la victime n'a pas bougé.
    expect(fx.supabase.rows('channel_integrations')[0].access_token).toBe('TOKEN_AUTRE');
  });

  it('on ne branche pas un canal sur l’assistant de quelqu’un d’autre', async () => {
    fx.supabase.seed('assistants', [{ id: 'asst_victime', user_id: '22222222-2222-4222-8222-222222222222', business_name: 'Victime', config: {} }]);
    const res = await connect({ channel: 'telegram', accountId: 'cle-secrete-longue-3', token: TG_TOKEN, assistantId: 'asst_victime' });
    expect(res.status).toBe(403);
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('`dryRun` teste le jeton SANS rien enregistrer (bouton « Tester »)', async () => {
    const res = await connect({ channel: 'messenger', accountId: PAGE_ID, token: 'PAGE_TOKEN_1', assistantId: 'asst1', dryRun: true });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true });
    expect(fx.supabase.rows('channel_integrations')).toHaveLength(0);
  });

  it('« Vérifier à nouveau » : sans identifiants, le serveur teste le jeton RANGÉ (que le navigateur ne connaît pas)', async () => {
    seedChannel(fx.supabase, 'messenger', { access_token: 'JETON_EXISTANT' });
    // Le navigateur n'envoie ni identifiant ni jeton : c'est le cas réel, le
    // jeton ne s'affiche jamais à l'écran.
    const res = await connect({ channel: 'messenger', accountId: '', token: '', assistantId: 'asst1' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, reused: true, verified: true });
    // Et rien n'a été écrasé.
    expect(fx.supabase.rows('channel_integrations')[0].access_token).toBe('JETON_EXISTANT');
  });

  it('« Vérifier à nouveau » sur un canal non connecté : message clair, pas d’erreur technique', async () => {
    const res = await connect({ channel: 'whatsapp', accountId: '', token: '', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('Aucune connexion enregistrée');
  });

  it('un jeton rangé devenu invalide est signalé (jeton expiré → on le dit)', async () => {
    seedChannel(fx.supabase, 'messenger', { access_token: 'JETON_EXPIRE' });
    fx.graph.failWhen((c) => c.method === 'GET' && c.path === '/me', 400, { message: 'Session has expired', code: 190 });
    const res = await connect({ channel: 'messenger', accountId: '', token: '', assistantId: 'asst1' });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('expiré');
  });
});

describe('DELETE — déconnecter', () => {
  it('exige d’être connecté et coupe la connexion', async () => {
    seedChannel(fx.supabase, 'messenger', { access_token: 'JETON_A_EFFACER' });
    expect((await call(api.onRequestDelete, 'DELETE', '/api/channels/integrations?channel=messenger', { token: null })).status).toBe(401);

    const res = await call(api.onRequestDelete, 'DELETE', '/api/channels/integrations?channel=messenger');
    expect(res.status).toBe(200);
    const row = fx.supabase.rows('channel_integrations')[0];
    expect(row.connected).toBe(false);
    expect(row.access_token).toBeNull(); // déconnecter = vraiment déconnecter
  });

  it('refuse un canal inconnu', async () => {
    expect((await call(api.onRequestDelete, 'DELETE', '/api/channels/integrations?channel=nimporte')).status).toBe(400);
  });

  it('déconnecté, le webhook ne répond PLUS (le canal est bien coupé)', async () => {
    seedChannel(fx.supabase, 'messenger', { access_token: 'X' });
    await call(api.onRequestDelete, 'DELETE', '/api/channels/integrations?channel=messenger');
    // `findIntegration` ignore les connexions coupées : rien à router.
    const { findIntegration } = await import('../functions/_shared/channels/pipeline');
    expect(await findIntegration(fx.supabase as any, 'messenger', PAGE_ID)).toBeNull();
  });
});
