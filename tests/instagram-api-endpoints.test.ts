import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as automations from '../functions/api/instagram/automations';
import * as diagnostics from '../functions/api/instagram/diagnostics';
import * as media from '../functions/api/instagram/media';
import * as subscribe from '../functions/api/instagram/subscribe';
import { ENV, IG_ID, USER_ID, installFakes, seedAutomation, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
  fx.supabase.addUser('BEARER_U2', '22222222-2222-4222-8222-222222222222');
});
afterEach(() => {
  expect(fx.other).toEqual([]);
  fx.restore();
});

function call(handler: (c: any) => Promise<Response>, method: string, path: string, opts: { token?: string | null; body?: any } = {}) {
  const token = opts.token === undefined ? 'BEARER_U1' : opts.token;
  const request = new Request(`https://jawebflow.test${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return handler({ request, env: ENV }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) as any }));
}

const validComment = () => ({
  name: 'Prix',
  triggerType: 'comment',
  config: {
    match: { mode: 'contains', keywords: ['prix'] },
    publicReply: { enabled: true, variations: ['Merci {@pseudo}'] },
    dm: { enabled: true, text: 'Voici', buttons: [] },
  },
});

describe('/api/instagram/automations', () => {
  it('exige d’être connecté', async () => {
    expect((await call(automations.onRequestGet, 'GET', '/api/instagram/automations', { token: null })).status).toBe(401);
    expect((await call(automations.onRequestGet, 'GET', '/api/instagram/automations', { token: 'FAUX' })).status).toBe(401);
    expect((await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { token: null, body: { automation: validComment() } })).status).toBe(401);
    expect((await call(automations.onRequestDelete, 'DELETE', '/api/instagram/automations?id=x', { token: null })).status).toBe(401);
  });

  it('migration SQL pas faite : le dit clairement au lieu de planter', async () => {
    fx.supabase.missing.add('ig_automations');
    fx.supabase.missing.add('ig_automation_events');
    const list = await call(automations.onRequestGet, 'GET', '/api/instagram/automations');
    expect(list.status).toBe(200);
    expect(list.json).toMatchObject({ setupRequired: true, automations: [] });
    const events = await call(automations.onRequestGet, 'GET', '/api/instagram/automations?view=events');
    expect(events.json).toMatchObject({ setupRequired: true });
    const create = await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { automation: validComment() } });
    expect(create.status).toBe(409);
    expect(create.json.setupRequired).toBe(true);
  });

  it('crée, liste, active, modifie, duplique et supprime', async () => {
    const created = await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { automation: validComment() } });
    expect(created.status).toBe(201);
    const a = created.json.automation;
    expect(a).toMatchObject({ name: 'Prix', triggerType: 'comment', enabled: false });
    expect(a.config.oncePerUser).toBe(true);
    expect(fx.supabase.rows('ig_automations')[0].user_id).toBe(USER_ID);

    const list = await call(automations.onRequestGet, 'GET', '/api/instagram/automations');
    expect(list.json.setupRequired).toBe(false);
    expect(list.json.automations).toHaveLength(1);

    const on = await call(automations.onRequestPatch, 'PATCH', '/api/instagram/automations', { body: { id: a.id, enabled: true } });
    expect(on.status).toBe(200);
    expect(on.json.automation.enabled).toBe(true);

    const edit = await call(automations.onRequestPatch, 'PATCH', '/api/instagram/automations', {
      body: { id: a.id, automation: { ...validComment(), name: 'Prix v2', triggerType: 'dm_keyword' } },
    });
    expect(edit.status).toBe(200);
    expect(edit.json.automation).toMatchObject({ name: 'Prix v2', triggerType: 'comment' }); // le type ne change jamais

    const copy = await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { duplicateOf: a.id } });
    expect(copy.status).toBe(201);
    expect(copy.json.automation).toMatchObject({ name: 'Prix v2 (copie)', enabled: false });
    expect(copy.json.automation.stats.triggered).toBe(0);
    expect(copy.json.automation.id).not.toBe(a.id);

    const del = await call(automations.onRequestDelete, 'DELETE', `/api/instagram/automations?id=${a.id}`);
    expect(del.status).toBe(200);
    expect(fx.supabase.rows('ig_automations')).toHaveLength(1);
  });

  it('refuse les données invalides avec un message lisible', async () => {
    const bad = validComment();
    bad.config.match.keywords = [];
    const res = await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { automation: bad } });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/mot-clé/);
    expect(fx.supabase.rows('ig_automations')).toHaveLength(0);
  });

  it('n’active pas une automatisation incomplète', async () => {
    const row = seedAutomation(fx.supabase, { enabled: false, config: { match: { mode: 'contains', keywords: [] }, dm: { enabled: true, text: '' }, publicReply: { enabled: false, variations: [] } } });
    const res = await call(automations.onRequestPatch, 'PATCH', '/api/instagram/automations', { body: { id: row.id, enabled: true } });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/Impossible d’activer/);
    expect(fx.supabase.rows('ig_automations')[0].enabled).toBe(false);
  });

  it('on peut ÉTEINDRE même une automatisation incomplète', async () => {
    const row = seedAutomation(fx.supabase, { enabled: true, config: { match: { mode: 'contains', keywords: [] }, dm: { enabled: true, text: '' }, publicReply: { enabled: false, variations: [] } } });
    const res = await call(automations.onRequestPatch, 'PATCH', '/api/instagram/automations', { body: { id: row.id, enabled: false } });
    expect(res.status).toBe(200);
  });

  it('un marchand ne voit, ne modifie et ne supprime QUE ses propres automatisations', async () => {
    const mine = seedAutomation(fx.supabase);
    const theirs = seedAutomation(fx.supabase, { id: 'dddddddd-0000-4000-8000-000000000009', user_id: '22222222-2222-4222-8222-222222222222', name: 'Secret' });
    const list = await call(automations.onRequestGet, 'GET', '/api/instagram/automations');
    expect(list.json.automations.map((x: any) => x.id)).toEqual([mine.id]);
    expect((await call(automations.onRequestPatch, 'PATCH', '/api/instagram/automations', { body: { id: theirs.id, enabled: false } })).status).toBe(404);
    expect((await call(automations.onRequestDelete, 'DELETE', `/api/instagram/automations?id=${theirs.id}`)).status).toBe(404);
    expect((await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { duplicateOf: theirs.id } })).status).toBe(404);
    expect(fx.supabase.rows('ig_automations')).toHaveLength(2);
  });

  it('refuse un identifiant fantaisiste (pas d’injection dans les filtres)', async () => {
    expect((await call(automations.onRequestDelete, 'DELETE', '/api/instagram/automations?id=1)&user_id=neq.x')).status).toBe(400);
    expect((await call(automations.onRequestGet, 'GET', '/api/instagram/automations?view=events&automationId=x,y')).status).toBe(400);
  });

  it('limite à 50 automatisations par marchand', async () => {
    for (let i = 0; i < 50; i++) seedAutomation(fx.supabase, { id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}` });
    const res = await call(automations.onRequestPost, 'POST', '/api/instagram/automations', { body: { automation: validComment() } });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/limite de 50/);
  });

  it('l’historique ne montre que les événements du marchand, du plus récent au plus ancien', async () => {
    const a = seedAutomation(fx.supabase);
    fx.supabase.seed('ig_automation_events', [
      { id: 'e1', user_id: USER_ID, automation_id: a.id, automation_name: 'Prix', trigger_type: 'comment', contact_id: 'SECRET_ID', contact_username: 'sara', input_text: 'prix', outcome: 'done', dm_status: 'sent', created_at: '2026-03-01T10:00:00Z' },
      { id: 'e2', user_id: USER_ID, automation_id: a.id, automation_name: 'Prix', trigger_type: 'comment', contact_id: 'SECRET_ID2', contact_username: 'yasmine', input_text: 'info', outcome: 'failed', error: 'Trop tard', created_at: '2026-03-02T10:00:00Z' },
      { id: 'e3', user_id: '22222222-2222-4222-8222-222222222222', trigger_type: 'comment', contact_id: 'x', contact_username: 'autre', outcome: 'done', created_at: '2026-03-03T10:00:00Z' },
    ]);
    const res = await call(automations.onRequestGet, 'GET', '/api/instagram/automations?view=events');
    expect(res.json.events.map((e: any) => e.id)).toEqual(['e2', 'e1']);
    expect(res.json.events[0]).toMatchObject({ username: 'yasmine', outcome: 'failed', error: 'Trop tard' });
    expect(JSON.stringify(res.json)).not.toContain('SECRET_ID'); // l'identifiant Instagram des personnes n'est pas exposé
    const filtered = await call(automations.onRequestGet, 'GET', `/api/instagram/automations?view=events&automationId=${a.id}&limit=1`);
    expect(filtered.json.events).toHaveLength(1);
  });
});

describe('/api/instagram/media', () => {
  it('liste les publications (miniature, légende, type) sans exposer le jeton', async () => {
    fx.meta.media = [
      { id: '111', caption: 'Nouvelle collection ✨', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg', permalink: 'https://instagram.com/p/a', timestamp: '2026-09-01T10:00:00+0000', comments_count: 4 },
      { id: '222', caption: '', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/b.jpg', media_url: 'https://cdn/b.mp4', permalink: 'https://instagram.com/reel/b', timestamp: '2026-08-01T10:00:00+0000', comments_count: 0 },
    ];
    const res = await call(media.onRequestGet, 'GET', '/api/instagram/media');
    expect(res.status).toBe(200);
    expect(res.json.media).toEqual([
      { id: '111', caption: 'Nouvelle collection ✨', type: 'IMAGE', thumbnail: 'https://cdn/a.jpg', permalink: 'https://instagram.com/p/a', timestamp: '2026-09-01T10:00:00+0000', comments: 4 },
      { id: '222', caption: '', type: 'REEL', thumbnail: 'https://cdn/b.jpg', permalink: 'https://instagram.com/reel/b', timestamp: '2026-08-01T10:00:00+0000', comments: 0 },
    ]);
    expect(JSON.stringify(res.json)).not.toContain('TOKEN1');
    const call0 = fx.meta.calls[0];
    expect(call0.path).toBe('/me/media');
    expect(call0.auth).toBe('Bearer TOKEN1');
  });

  it('compte non connecté → message clair', async () => {
    fx.supabase.tables.instagram_integrations = [];
    const res = await call(media.onRequestGet, 'GET', '/api/instagram/media');
    expect(res.status).toBe(409);
    expect(res.json.kind).toBe('not_connected');
  });

  it('jeton expiré → explication en français', async () => {
    fx.meta.failWhen((c) => c.path === '/me/media', 400, { message: 'Error validating access token', code: 190 });
    const res = await call(media.onRequestGet, 'GET', '/api/instagram/media');
    expect(res.status).toBe(502);
    expect(res.json).toMatchObject({ kind: 'token' });
    expect(res.json.error).toMatch(/reconnecte/);
  });

  it('exige d’être connecté', async () => {
    expect((await call(media.onRequestGet, 'GET', '/api/instagram/media', { token: null })).status).toBe(401);
  });
});

describe('/api/instagram/diagnostics', () => {
  const byId = (json: any, id: string) => json.checks.find((c: any) => c.id === id);

  it('tout va bien : commentaires, messages et boutons reçus', async () => {
    fx.meta.subscribedFields = ['messages', 'messaging_postbacks', 'comments'];
    fx.meta.media = [{ id: '111', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg' }];
    fx.supabase.seed('ig_automation_state', [{ user_id: USER_ID, last_comment_at: '2026-10-01T12:00:00Z' }]);
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ connected: true, username: 'boutique_nour', permission: 'ok', lastCommentAt: '2026-10-01T12:00:00Z' });
    expect(res.json.checks.map((c: any) => c.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('compte non connecté → renvoie vers l’onglet Instagram', async () => {
    fx.supabase.tables.instagram_integrations = [];
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(res.json.connected).toBe(false);
    expect(res.json.checks[0]).toMatchObject({ status: 'error', action: 'connect' });
  });

  it('autorisation « commentaires » manquante → demande de reconnecter', async () => {
    fx.meta.media = [{ id: '111', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg' }];
    fx.meta.commentsPermission = false;
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(res.json.permission).toBe('missing');
    expect(byId(res.json, 'permission')).toMatchObject({ status: 'error', action: 'reconnect' });
  });

  it('commentaires pas abonnés → propose de réparer', async () => {
    fx.meta.subscribedFields = ['messages'];
    fx.meta.media = [{ id: '111', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg' }];
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(byId(res.json, 'subscription')).toMatchObject({ status: 'warn', action: 'repair', title: expect.stringMatching(/commentaires/) });
  });

  it('jeton expiré → un seul message : reconnecter', async () => {
    fx.meta.failWhen(() => true, 400, { message: 'Session has expired', code: 190 }, 10);
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(byId(res.json, 'token')).toMatchObject({ status: 'error', action: 'reconnect' });
  });

  it('aucune publication : la permission ne peut pas encore être testée (et ce n’est pas une erreur)', async () => {
    fx.meta.media = [];
    fx.meta.subscribedFields = ['messages', 'messaging_postbacks', 'comments'];
    const res = await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics');
    expect(byId(res.json, 'permission')).toMatchObject({ status: 'unknown' });
    expect(byId(res.json, 'activity')).toMatchObject({ status: 'unknown' });
  });

  it('« Réparer » abonne le compte et met à jour l’état affiché', async () => {
    const res = await call(diagnostics.onRequestPost, 'POST', '/api/instagram/diagnostics', { body: { action: 'subscribe' } });
    expect(res.json).toMatchObject({ success: true, fields: ['messages', 'messaging_postbacks', 'comments'], missing: [] });
    expect(fx.supabase.rows('instagram_integrations')[0].webhook_status).toBe('active');
  });

  it('si l’application Meta refuse « commentaires », on garde les messages et on explique ce qui manque', async () => {
    fx.meta.rejectFields = ['comments'];
    const res = await call(diagnostics.onRequestPost, 'POST', '/api/instagram/diagnostics', { body: { action: 'subscribe' } });
    expect(res.json.success).toBe(true);
    expect(res.json.fields).toEqual(['messages', 'messaging_postbacks']);
    expect(res.json.missing).toEqual(['comments']);
    expect(res.json.message).toMatch(/comments/);
    expect(fx.meta.subscribedFields).toEqual(['messages', 'messaging_postbacks']);
  });

  it('si même « messages » est refusé (jeton mort) : erreur claire, état « erreur »', async () => {
    fx.meta.failWhen((c) => /\/subscribed_apps$/.test(c.path) && c.method === 'POST', 400, { message: 'Invalid OAuth access token', code: 190 }, 5);
    const res = await call(diagnostics.onRequestPost, 'POST', '/api/instagram/diagnostics', { body: { action: 'subscribe' } });
    expect(res.status).toBe(502);
    expect(res.json.error).toMatch(/reconnecte/i);
    expect(fx.supabase.rows('instagram_integrations')[0].webhook_status).toBe('error');
  });

  it('exige d’être connecté', async () => {
    expect((await call(diagnostics.onRequestGet, 'GET', '/api/instagram/diagnostics', { token: null })).status).toBe(401);
    expect((await call(diagnostics.onRequestPost, 'POST', '/api/instagram/diagnostics', { token: null, body: { action: 'subscribe' } })).status).toBe(401);
  });
});

describe('/api/instagram/subscribe (ancien point d’entrée)', () => {
  it('n’est plus un relais anonyme', async () => {
    const res = await call(subscribe.onRequestPost, 'POST', '/api/instagram/subscribe', { token: null, body: { accessToken: 'X' } });
    expect(res.status).toBe(401);
    expect(fx.meta.calls).toHaveLength(0);
  });
  it('abonne avec la liste complète pour un marchand connecté', async () => {
    const res = await call(subscribe.onRequestPost, 'POST', '/api/instagram/subscribe', { body: { accessToken: 'TOKEN1' } });
    expect(res.json).toMatchObject({ success: true, fields: ['messages', 'messaging_postbacks', 'comments'] });
  });
  it('subscribeToInstagramMessages reste compatible avec le flux de connexion', async () => {
    const r = await subscribe.subscribeToInstagramMessages('TOKEN1');
    expect(r).toMatchObject({ success: true, status: 200 });
    fx.meta.failWhen((c) => c.path === '/me/subscribed_apps', 400, { message: 'Invalid token', code: 190 }, 5);
    const bad = await subscribe.subscribeToInstagramMessages('TOKEN1');
    expect(bad.success).toBe(false);
    expect(bad.data.error.message).toBe('Invalid token');
  });
});
