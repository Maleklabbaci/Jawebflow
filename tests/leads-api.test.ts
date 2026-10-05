import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from '../functions/api/leads';
import { ENV, USER_ID, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => fx.restore());

function context(method: 'GET' | 'POST', body?: unknown, token = 'BEARER_U1') {
  return {
    env: ENV,
    request: new Request(`https://jawebflow.test/api/leads${method === 'GET' ? '?assistantId=asst1' : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
  } as any;
}

describe('/api/leads — suivi sécurisé', () => {
  it('exige une authentification et vérifie que l’assistant appartient au marchand', async () => {
    const noToken = await onRequestGet(context('GET', undefined, 'invalid'));
    expect(noToken.status).toBe(401);

    fx.supabase.seed('assistants', [{ id: 'other', user_id: 'another-user', business_name: 'Autre' }]);
    const denied = await onRequestPost({
      ...context('POST', { assistantId: 'other', prospectId: 'p1', followUpStatus: 'done' }),
      request: new Request('https://jawebflow.test/api/leads', {
        method: 'POST', headers: { Authorization: 'Bearer BEARER_U1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: 'other', prospectId: 'p1', followUpStatus: 'done' }),
      }),
    });
    expect(denied.status).toBe(403);
  });

  it('retourne les prospects du marchand et marque seulement son suivi comme terminé', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p1', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'Sara', channel: 'instagram', followUpStatus: 'pending', nextAction: 'Rappeler' },
    }]);

    const get = await onRequestGet(context('GET'));
    expect(get.status).toBe(200);
    expect((await get.json() as any).prospects[0]).toMatchObject({ id: 'p1', name: 'Sara', followUpStatus: 'pending' });

    const post = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p1', followUpStatus: 'done' }));
    expect(post.status).toBe(200);
    expect(await post.json()).toMatchObject({ ok: true, prospectId: 'p1', followUpStatus: 'done' });
    expect(fx.supabase.rows('prospects')[0].data).toMatchObject({
      followUpStatus: 'done',
      followUpCompletedAt: expect.any(String),
      nextAction: 'Suivi terminé',
    });
  });

  it('refuse un prospect qui n’appartient pas à cet assistant et les statuts inconnus', async () => {
    fx.supabase.seed('prospects', [{ id: 'p-other', assistant_id: 'other-assistant', data: {} }]);
    const missing = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-other', followUpStatus: 'done' }));
    expect(missing.status).toBe(404);
    const invalid = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-other', followUpStatus: 'pending' }));
    expect(invalid.status).toBe(400);
  });

  it('fait avancer les commandes avec transitions contrôlées et laisse le commerçant reprendre la main', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p-order', assistant_id: 'asst1', data: {
        channel: 'instagram', igUserId: 'ig-sara', sessionId: 'ig_ig-sara',
        orders: [{ id: 'order-1', reference: 'JF-ORDER1', status: 'pending_merchant_confirmation' }],
      },
    }]);

    const confirmed = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-order', orderId: 'order-1', orderStatus: 'confirmed' }));
    expect(confirmed.status).toBe(200);
    expect(fx.supabase.rows('prospects')[0].data.orders[0]).toMatchObject({ status: 'confirmed', updatedAt: expect.any(String) });

    const impossible = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-order', orderId: 'order-1', orderStatus: 'delivered' }));
    expect(impossible.status).toBe(409);

    const takeover = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-order', action: 'takeover' }));
    expect(takeover.status).toBe(200);
    expect(await takeover.json()).toMatchObject({ handoffStatus: 'human', sessionId: 'ig_ig-sara' });
    expect(fx.supabase.rows('bot_mutes')).toHaveLength(1);
    expect(fx.supabase.rows('prospects')[0].data.handoffStatus).toBe('human');

    const resume = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-order', action: 'resume' }));
    expect(resume.status).toBe(200);
    expect(fx.supabase.rows('bot_mutes')).toHaveLength(0);
    expect(fx.supabase.rows('prospects')[0].data.handoffStatus).toBe('bot');
  });

  it('une VISITE confirmée passe à « réalisée » sans étape d’expédition, une commande non', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p-visit', assistant_id: 'asst1', data: {
        channel: 'instagram', igUserId: 'ig-karim', sessionId: 'ig_ig-karim',
        orders: [{ id: 'visit-1', reference: 'JF-VISIT01', status: 'pending_merchant_confirmation', kind: 'visit', kindLabel: 'Visite' }],
      },
    }]);

    const confirmed = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-visit', orderId: 'visit-1', orderStatus: 'confirmed' }));
    expect(confirmed.status).toBe(200);

    // Pas de colis à expédier pour une visite : « confirmed → delivered » est accepté.
    const done = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-visit', orderId: 'visit-1', orderStatus: 'delivered' }));
    expect(done.status).toBe(200);
    expect(fx.supabase.rows('prospects')[0].data.orders[0]).toMatchObject({ status: 'delivered', kind: 'visit' });

    // … alors qu'une commande doit suivre préparation → expédition → livraison.
    const shipping = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p-visit', orderId: 'visit-1', orderStatus: 'shipped' }));
    expect(shipping.status).toBe(409);
  });
});

describe('/api/leads — pagination (échelle grande société)', () => {
  const get = (query: string) => onRequestGet({
    env: ENV,
    request: new Request(`https://jawebflow.test/api/leads?assistantId=asst1&${query}`, {
      method: 'GET', headers: { Authorization: 'Bearer BEARER_U1' },
    }),
  } as any);

  it('page par page avec total et hasMore, sans tronquer à 200', async () => {
    fx.supabase.seed('prospects', [1, 2, 3].map((i) => ({
      id: `pg${i}`, assistant_id: 'asst1', updated_at: `2026-10-0${i}T10:00:00.000Z`,
      data: { name: `Client ${i}`, phone: `055000000${i}` },
    })));

    const first = await get('limit=2&offset=0');
    const b1 = await first.json() as any;
    expect(b1.total).toBe(3);
    expect(b1.prospects).toHaveLength(2);
    expect(b1.hasMore).toBe(true);

    const second = await get('limit=2&offset=2');
    const b2 = await second.json() as any;
    expect(b2.prospects).toHaveLength(1);
    expect(b2.hasMore).toBe(false);
  });
});

describe('/api/leads — confirmation côté client', () => {
  it('confirmer une demande Instagram envoie le message au client', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p1', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'Yacine', channel: 'instagram', igUserId: 'ig_123',
        orders: [{ id: 'o1', kind: 'order', status: 'pending_merchant_confirmation', summary: 'un article' }] },
    }]);
    const post = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p1', orderId: 'o1', orderStatus: 'confirmed' }));
    expect(post.status).toBe(200);
    expect(await post.json()).toMatchObject({ ok: true, clientNotified: true });
    const sent = fx.meta.sent('messages');
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).toContain('commande est confirmée');
  });

  it('un client du site (sans Instagram) est confirmé sans envoi', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p2', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'Web', channel: 'site web',
        orders: [{ id: 'o2', kind: 'visit', status: 'pending_merchant_confirmation', summary: 'visite' }] },
    }]);
    const post = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p2', orderId: 'o2', orderStatus: 'confirmed' }));
    expect(post.status).toBe(200);
    expect(await post.json()).toMatchObject({ ok: true, clientNotified: false });
  });
});

describe('/api/leads — suppression avec confirmation', () => {
  it('supprime définitivement un client et son historique', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p1', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'X', orders: [{ id: 'o1', status: 'confirmed' }] },
    }]);
    const del = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p1', action: 'delete_prospect' }));
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ ok: true, deleted: 'prospect' });
    expect(fx.supabase.rows('prospects').find((r) => r.id === 'p1')).toBeUndefined();
  });

  it('supprime une seule demande sans toucher au client ni aux autres demandes', async () => {
    fx.supabase.seed('prospects', [{
      id: 'p2', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'Y', orders: [{ id: 'o1', status: 'confirmed' }, { id: 'o2', status: 'pending_merchant_confirmation' }] },
    }]);
    const del = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p2', action: 'delete_order', orderId: 'o1' }));
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ ok: true, deleted: 'order' });
    const lead = fx.supabase.rows('prospects').find((r) => r.id === 'p2');
    expect(lead).toBeTruthy();
    expect(lead!.data.orders.map((o: any) => o.id)).toEqual(['o2']);
  });

  it('valide les paramètres de suppression', async () => {
    const noOrderId = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p1', action: 'delete_order' }));
    expect(noOrderId.status).toBe(400);
    const badAction = await onRequestPost(context('POST', { assistantId: 'asst1', prospectId: 'p1', action: 'hack' }));
    expect(badAction.status).toBe(400);
  });
});
