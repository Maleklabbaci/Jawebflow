/**
 * 🌐 /api/admin/sites — « quels sites mes clients ont connectés ? »
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. l'écran est réservé à l'admin (jeton + rôle vérifié en base) : un
 *      marchand ne peut pas lire les sites, les domaines et les réseaux des
 *      autres — il obtient 403, sans aucune donnée ;
 *   2. la réponse est complète et lisible : une ligne par assistant (site),
 *      avec l'adresse, les domaines autorisés pour la bulle, la voix, et les
 *      réseaux réellement branchés (y compris l'erreur du dernier échec) ;
 *   3. si une table n'existe pas encore (migration pas passée), on dégrade au
 *      lieu de casser la console.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as sites from '../functions/api/admin/sites';
import { ENV, installFakes } from './helpers/fakes';

const ADMIN = '22222222-2222-4222-8222-222222222222';
const CLIENT = '11111111-1111-4111-8111-111111111111';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  fx.supabase.addUser('BEARER_ADMIN', ADMIN, 'jimmy@jawebflow.dz');
  fx.supabase.addUser('BEARER_CLIENT', CLIENT, 'nour@test.dz');
  fx.supabase.seed('users', [
    { id: ADMIN, email: 'jimmy@jawebflow.dz', role: 'superadmin', plan: null, social_enabled: true },
    {
      id: CLIENT, email: 'nour@test.dz', role: 'user', display_name: 'Nour', company_name: 'Boutique Nour',
      phone_number: '0555 11 22 33', plan: 'pro', social_enabled: false, created_at: '2026-09-01T08:00:00Z',
    },
  ]);
  fx.supabase.seed('assistants', [
    {
      id: 'asst1', user_id: CLIENT, business_name: 'Boutique Nour', website_url: 'https://nour.dz',
      config: {
        websiteUrl: 'https://nour.dz',
        allowedDomains: ['nour.dz', 'www.nour.dz'],
        widgetKey: 'w_nour_key',
        widgetConfig: { voice: { enabled: true } },
      },
    },
    {
      id: 'asst2', user_id: CLIENT, business_name: 'Nour Cosmétiques', website_url: null,
      config: { allowedDomains: 'cosmetiques-nour.dz, boutique.nour.dz' },
    },
  ]);
  fx.supabase.seed('channel_integrations', [
    { id: 'ci1', user_id: CLIENT, assistant_id: 'asst1', channel: 'messenger', account_id: 'page_1', display_name: 'Nour DZ', connected: true, updated_at: '2026-10-10T10:00:00Z' },
    { id: 'ci2', user_id: CLIENT, assistant_id: 'asst1', channel: 'whatsapp', account_id: 'phone_1', display_name: 'Boutique Nour', phone_number: '+213555123456', connected: false, last_error: 'Jeton expiré', updated_at: '2026-10-11T10:00:00Z' },
  ]);
  fx.supabase.seed('instagram_integrations', [
    { id: 'ig1', user_id: CLIENT, assistant_id: 'asst1', instagram_username: 'nour.dz', page_name: 'Nour DZ', connected: true, last_connected_at: '2026-10-01T10:00:00Z' },
  ]);
  fx.supabase.seed('social_requests', [
    { id: 'r1', user_id: CLIENT, email: 'nour@test.dz', status: 'pending', created_at: '2026-10-12T09:00:00Z' },
  ]);
});

afterEach(() => fx.restore());

async function call(token?: string) {
  const res = await sites.onRequestGet({
    request: new Request('https://jawebflow.test/api/admin/sites', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    env: ENV,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

describe('l’écran « sites connectés » de la console admin', () => {
  it('sans jeton : refusé, aucune donnée', async () => {
    const { status, json } = await call();
    expect(status).toBe(401);
    expect(json.ok).toBe(false);
    expect(JSON.stringify(json)).not.toContain('nour.dz');
  });

  it('un marchand (même connecté) n’obtient RIEN : c’est la console du propriétaire', async () => {
    const { status, json } = await call('BEARER_CLIENT');
    expect(status).toBe(403);
    expect(json.ok).toBe(false);
    expect(JSON.stringify(json)).not.toContain('nour.dz');
    expect(JSON.stringify(json)).not.toContain('page_1');
  });

  it('l’admin voit quels sites sont branchés, avec domaines, voix et réseaux', async () => {
    const { status, json } = await call('BEARER_ADMIN');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);

    expect(json.counts).toMatchObject({
      clients: 2,
      sites: 2,
      channels: 3,
      locked: 1,
      requested: 1,
    });

    const nour = json.clients.find((c: any) => c.uid === CLIENT);
    expect(nour.company).toBe('Boutique Nour');
    expect(nour.phone).toBe('0555 11 22 33');
    expect(nour.plan).toBe('pro');
    expect(nour.socialEnabled).toBe(false);
    expect(nour.socialRequestedAt).toBe('2026-10-12T09:00:00Z');
    expect(nour.sitesCount).toBe(2);

    const boutique = nour.sites.find((s: any) => s.assistantId === 'asst1');
    expect(boutique.websiteUrl).toBe('https://nour.dz');
    expect(boutique.allowedDomains).toEqual(['nour.dz', 'www.nour.dz']);
    expect(boutique.widgetKeySet).toBe(true);
    expect(boutique.voiceEnabled).toBe(true);
    expect(boutique.channels.map((c: any) => c.channel).sort()).toEqual(['instagram', 'messenger', 'whatsapp']);
    expect(boutique.channels.find((c: any) => c.channel === 'whatsapp')).toMatchObject({
      label: 'WhatsApp',
      connected: false,
      lastError: 'Jeton expiré',
      phoneNumber: '+213555123456',
    });
    expect(boutique.channelsConnected).toBe(2);

    // Le site sans adresse déclarée reste visible, avec ses domaines en texte.
    const cosmetiques = nour.sites.find((s: any) => s.assistantId === 'asst2');
    expect(cosmetiques.websiteUrl).toBeNull();
    expect(cosmetiques.allowedDomains).toEqual(['cosmetiques-nour.dz', 'boutique.nour.dz']);
    expect(cosmetiques.channels).toEqual([]);
    expect(cosmetiques.voiceEnabled).toBe(false);
  });

  it('table des demandes absente : la console affiche quand même les sites', async () => {
    fx.supabase.missing.add('social_requests');
    const { status, json } = await call('BEARER_ADMIN');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const nour = json.clients.find((c: any) => c.uid === CLIENT);
    expect(nour.sitesCount).toBe(2);
    expect(nour.socialRequestedAt).toBeNull();
    expect(json.counts.requested).toBe(0);
  });
});
