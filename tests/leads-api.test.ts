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
});
