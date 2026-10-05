import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/cron/relances.js';
import { buildRelances, dueRelances, relanceText } from '../functions/_shared/relances';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => {
  expect(fx.other).toEqual([]);
  fx.restore();
});

const HOUR = 60 * 60 * 1000;

describe('relances automatiques (1 h / 24 h)', () => {
  it('planifie deux relances et ne renvoie que celles arrivées à échéance', () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const relances = buildRelances(now, 'visit');
    expect(relances.map((r) => r.id)).toEqual(['1h', '24h']);
    expect(relances[0].kind).toBe('visit');

    const at13h = new Date(now.getTime() + HOUR);
    expect(dueRelances(relances, at13h).map((r) => r.id)).toEqual(['1h']);
    expect(dueRelances(relances, new Date(now.getTime() + 25 * HOUR)).map((r) => r.id)).toEqual(['1h', '24h']);
    expect(dueRelances(relances, now)).toEqual([]);
  });

  it('le texte de relance reprend la nature de la demande, pas « commande »', () => {
    expect(relanceText({ id: '1h', kind: 'visit', at: '', sent: false })).toContain('votre visite');
    expect(relanceText({ id: '24h', kind: 'appointment', at: '', sent: false })).toContain('votre rendez-vous');
    expect(relanceText({ id: '1h', kind: 'order', at: '', sent: false })).toContain('votre commande');
  });

  it('le cron envoie la relance due en DM Instagram puis la marque envoyée', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 23 * HOUR).toISOString();
    fx.supabase.seed('prospects', [{
      id: 'p1',
      assistant_id: 'asst1',
      updated_at: new Date().toISOString(),
      data: {
        channel: 'instagram', igUserId: 'PSID1', name: 'Sara',
        relances: [
          { id: '1h', kind: 'visit', at: past, sent: false },
          { id: '24h', kind: 'visit', at: future, sent: false },
        ],
      },
    }]);

    const res = await onRequestGet({
      env: { ...ENV, CRON_SECRET: 'top-secret' },
      request: new Request('https://jawebflow.test/api/cron/relances?token=top-secret'),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(1);

    // Une seule relance envoyée (la « 1 h »), en DM au bon client.
    const messages = fx.meta.sent('messages');
    expect(messages).toHaveLength(1);
    expect(messages[0].body.recipient).toEqual({ id: 'PSID1' });
    expect(JSON.stringify(messages[0].body.message)).toContain('votre visite');

    // La fiche est mise à jour : « 1 h » envoyée, « 24 h » encore en attente.
    const prospect = fx.supabase.rows('prospects').find((r) => r.id === 'p1');
    expect(prospect?.data.relances.find((r: any) => r.id === '1h').sent).toBe(true);
    expect(prospect?.data.relances.find((r: any) => r.id === '24h').sent).toBe(false);
  });

  it('refuse un mauvais jeton', async () => {
    const res = await onRequestGet({
      env: { ...ENV, CRON_SECRET: 'top-secret' },
      request: new Request('https://jawebflow.test/api/cron/relances?token=mauvais'),
    } as any);
    expect(res.status).toBe(401);
  });
});
