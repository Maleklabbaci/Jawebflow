/**
 * 🎯 L'AGENT A NOTÉ UNE DEMANDE — /api/voice/lead
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. une demande SANS moyen de rappeler le client n'est pas enregistrée : on
 *      répond à l'agent ce qui manque, pour qu'il pose la question ;
 *   2. chez un client, la fiche atterrit dans SES leads (`prospects`), marquée
 *      « appel vocal » + « qualifié » — elle se mélange à ses autres leads ;
 *   3. sur le site vitrine (pas de marchand), la demande va dans
 *      `platform_settings` (`site_leads`) et s'affiche dans la console ;
 *   4. le même numéro ne crée pas deux fiches (le client qui rappelle complète).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as leadApi from '../functions/api/voice/lead';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => fx.restore());

const post = (body: unknown, env: any = ENV) =>
  leadApi.onRequestPost({
    request: new Request('https://jawebflow.test/api/voice/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '41.100.0.7' },
      body: JSON.stringify(body),
    }),
    env,
  });

describe('/api/voice/lead — la demande du client', () => {
  it('sans téléphone ni e-mail : rien n’est écrit, et l’agent sait quoi demander', async () => {
    const res = await post({ assistantId: 'asst1', origin: 'https://boutique.dz', sessionId: 's1', args: { nom: 'Sara' } });
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.manquant).toContain('telephone');
    expect(data.message).toMatch(/demande-le/i);
    expect(fx.supabase.rows('prospects')).toHaveLength(0);
  });

  it('chez un client : la fiche va dans SES leads, marquée « appel vocal » et qualifiée', async () => {
    const res = await post({
      assistantId: 'asst1',
      origin: 'https://boutique.dz',
      sessionId: 's1',
      args: { nom: 'Sara B', telephone: '0697 66 09 69', besoin: 'un site vitrine', ville: 'Blida', type_demande: 'rendez-vous', date: 'samedi 10h' },
    });
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.enregistre).toBe(true);

    const rows = fx.supabase.rows('prospects');
    expect(rows).toHaveLength(1);
    expect(rows[0].assistant_id).toBe('asst1');
    expect(rows[0].data).toMatchObject({
      name: 'Sara B',
      phone: '0697 66 09 69',
      city: 'Blida',
      need: 'un site vitrine',
      source: 'Appel vocal',
      channel: 'voice',
      status: 'qualifie',
      voiceKind: 'rendez-vous',
      appointmentAt: 'samedi 10h',
      leadSource: 'appel vocal',
    });
    expect(rows[0].data.leadMarkedAt).toBeTruthy();
    expect(rows[0].data.messages[0].text).toMatch(/Appel vocal/);
  });

  it('le même numéro qui rappelle COMPLÈTE sa fiche au lieu d’en créer une deuxième', async () => {
    await post({ assistantId: 'asst1', origin: 'https://boutique.dz', sessionId: 's1', args: { telephone: '0697660969', nom: 'Sara' } });
    await post({ assistantId: 'asst1', origin: 'https://boutique.dz', sessionId: 's2', args: { telephone: '0697660969', besoin: 'finalement un magasin' } });
    const rows = fx.supabase.rows('prospects');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ name: 'Sara', need: 'finalement un magasin' });
  });

  it('sur le site vitrine : la demande va dans site_leads (console admin)', async () => {
    const res = await post({ site: true, sessionId: 'site_1', args: { telephone: '0555112233', nom: 'Karim', besoin: 'je veux un agent' } });
    expect(((await res.json()) as any).ok).toBe(true);
    const rows = fx.supabase.rows('platform_settings').filter((r) => r.id === 'site_leads');
    expect(rows).toHaveLength(1);
    expect(rows[0].data.leads[0]).toMatchObject({
      name: 'Karim',
      phone: '0555112233',
      need: 'je veux un agent',
      status: 'nouveau',
      sessionId: 'site_1',
    });
  });

  it('un assistant inconnu ne fait pas planter l’appel : l’agent reçoit un message clair', async () => {
    const res = await post({ assistantId: 'asst_inconnu', origin: 'https://x.dz', sessionId: 's1', args: { telephone: '0697660969' } });
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.message).toMatch(/rappelle/i);
  });
});
