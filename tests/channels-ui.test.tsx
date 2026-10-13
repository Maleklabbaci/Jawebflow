// @vitest-environment jsdom
/**
 * ÉCRAN « MESSAGERIES » — le marchand branche ses canaux depuis le tableau de bord
 * ============================================================================
 * Ces tests traversent TOUTE la pile : clic → fetch → /api/channels/integrations
 * → fonctions serveur → faux Supabase / faux Meta / faux Telegram.
 *
 * Ce qu'on vérifie surtout : le marchand n'a jamais à voir un jeton, et un
 * bouton qui ne peut pas marcher ne reste pas muet.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant, seedPlan } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

const ASSISTANT = {
  id: 'asst1', userId: '11111111-1111-4111-8111-111111111111', widgetId: 'w_nour', businessName: 'Boutique Nour',
  websiteUrl: 'https://nour.dz', siteType: 'ecommerce', businessCategory: 'Boutique', businessDescription: 'Vêtements femme',
  knowledgeNotes: [], plan: 'pro', languages: ['fr'],
};

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
  getUserAssistants: async () => [ASSISTANT],
  saveAssistantToDatabase: async () => 'asst1',
  isUserAdmin: () => false,
  updateAssistantPlan: async () => undefined,
  getAssistantById: async () => ASSISTANT,
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour' },
    profile: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour', companyName: 'Boutique Nour', role: 'user', plan: 'pro' },
    loading: false,
    logout: async () => undefined,
  }),
}));

import { DashboardPlatform } from '../src/components/DashboardPlatform';
import { goTo } from './helpers/nav';

let be: UiBackend;

beforeEach(() => {
  localStorage.clear();
  be = installUiBackend();
  seedMerchant(be.supabase);
  for (const p of ['/api/chat', '/api/learning', '/api/leads', '/api/usage', '/api/ai-usage', '/api/plan', '/api/instagram/notify-setup']) {
    be.stub(p, () => new Response(JSON.stringify({ text: 'ok', prospects: [], questions: [], usage: {} }), { status: 200 }));
  }
  (window as any).open = vi.fn().mockReturnValue({ closed: true });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as any));
  (window as any).scrollTo = () => undefined;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 60));
  be.restore();
  vi.restoreAllMocks();
});

/** Ouvre l'onglet d'UN canal de messagerie et attend qu'il soit chargé. */
async function openChannels(channel: 'messenger' | 'whatsapp' | 'telegram' | 'tiktok' = 'messenger') {
  render(<DashboardPlatform />);
  await waitFor(() => expect(document.getElementById('nav-integration')).toBeTruthy(), { timeout: 5000 });
  goTo(channel);
  await screen.findByTestId('channels-integration', {}, { timeout: 5000 });
}

describe('écran Messageries', () => {
  it('CHAQUE canal a son onglet dans le menu, et n’affiche que SA carte', async () => {
    for (const id of ['messenger', 'whatsapp', 'telegram', 'tiktok'] as const) {
      cleanup();
      await openChannels(id);
      expect(screen.getByTestId(`channel-card-${id}`), `carte ${id}`).toBeTruthy();
      // Un onglet = un canal : aucune autre carte ne s'invite à l'écran.
      for (const other of ['messenger', 'whatsapp', 'telegram', 'tiktok'] as const) {
        if (other !== id) expect(screen.queryByTestId(`channel-card-${other}`), `carte ${other} ne doit pas être là`).toBeNull();
      }
    }
  });

  it('WhatsApp est annoncé comme le seul payant, les trois autres comme gratuits', async () => {
    await openChannels('whatsapp');
    expect(screen.getByText('Payant chez Meta')).toBeTruthy();
    expect(screen.queryByText('Gratuit')).toBeNull();
    cleanup();
    await openChannels('messenger');
    expect(screen.getByText('Gratuit')).toBeTruthy();
    expect(screen.queryByText('Payant chez Meta')).toBeNull();
  });

  it('un canal non connecté montre le formulaire, pas d’adresse de webhook', async () => {
    await openChannels('messenger');
    expect(screen.getByTestId('connect-messenger')).toBeTruthy();
    expect(screen.queryByTestId('webhook-url-messenger')).toBeNull();
  });

  it('le bouton « Tester et connecter » reste inactif tant que tout n’est pas rempli', async () => {
    await openChannels('telegram');
    const button = screen.getByTestId('connect-telegram') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Clé de liaison (inventez-la : elle va dans l’adresse du webhook)'), { target: { value: 'ma-cle-secrete-2026' } });
    expect((screen.getByTestId('connect-telegram') as HTMLButtonElement).disabled).toBe(true); // jeton encore vide

    fireEvent.change(screen.getByLabelText('Jeton du bot (donné par @BotFather)'), { target: { value: 'TG_TOKEN_TEST' } });
    await waitFor(() => expect((screen.getByTestId('connect-telegram') as HTMLButtonElement).disabled).toBe(false));
  });

  it('TELEGRAM : brancher un bot pour de vrai → « Connecté », l’adresse du webhook apparaît, le jeton reste invisible', async () => {
    await openChannels('telegram');
    fireEvent.change(screen.getByLabelText('Clé de liaison (inventez-la : elle va dans l’adresse du webhook)'), { target: { value: 'ma-cle-secrete-2026' } });
    fireEvent.change(screen.getByLabelText('Jeton du bot (donné par @BotFather)'), { target: { value: 'TG_TOKEN_TEST' } });
    fireEvent.click(screen.getByTestId('connect-telegram'));

    await waitFor(() => expect(screen.getByTestId('webhook-url-telegram')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('channel-status-telegram').textContent).toContain('Connecté');
    expect(screen.getByTestId('webhook-url-telegram').textContent).toContain('key=ma-cle-secrete-2026');
    // Le jeton n'est ni affiché, ni conservé dans le formulaire.
    expect(document.body.textContent).not.toContain('TG_TOKEN_TEST');
    // Il est bien rangé côté serveur.
    expect(be.supabase.rows('channel_integrations')[0]).toMatchObject({ channel: 'telegram', account_id: 'ma-cle-secrete-2026', access_token: 'TG_TOKEN_TEST' });
  });

  it('un mauvais jeton est refusé AVEC la raison, et rien n’est enregistré', async () => {
    await openChannels('telegram');
    fireEvent.change(screen.getByLabelText('Clé de liaison (inventez-la : elle va dans l’adresse du webhook)'), { target: { value: 'ma-cle-secrete-2026' } });
    fireEvent.change(screen.getByLabelText('Jeton du bot (donné par @BotFather)'), { target: { value: 'JETON_POURRI' } });
    fireEvent.click(screen.getByTestId('connect-telegram'));

    const notice = await screen.findByTestId('channels-notice');
    await waitFor(() => expect(notice.textContent).toContain('Telegram a refusé'));
    expect(be.supabase.rows('channel_integrations')).toHaveLength(0);
    expect(screen.getByTestId('channel-status-telegram').textContent).toContain('Non connecté');
  });

  it('WHATSAPP : la jauge du forfait s’affiche, avec le reste à consommer', async () => {
    be.supabase.seed('channel_integrations', [{
      id: 'int_wa', user_id: ASSISTANT.userId, assistant_id: 'asst1', channel: 'whatsapp',
      account_id: 'PHONE_112233', access_token: 'WA_TOKEN_1', connected: true,
    }]);
    seedPlan(be.supabase, 'pro'); // Pro = 1 000 réponses WhatsApp incluses
    be.supabase.seed('channel_messages', Array.from({ length: 743 }, (_, i) => ({
      id: `cm_${i}`, assistant_id: 'asst1', channel: 'whatsapp', direction: 'out', billable: true, created_at: new Date().toISOString(),
    })));

    await openChannels('whatsapp');
    const gauge = await screen.findByTestId('whatsapp-gauge');
    expect(gauge.textContent).toContain('743 / 1000');
    expect(gauge.textContent).toContain('257 réponses');
  });

  it('un canal connecté peut être déconnecté, et l’écran repasse au formulaire', async () => {
    be.supabase.seed('channel_integrations', [{
      id: 'int_tg', user_id: ASSISTANT.userId, assistant_id: 'asst1', channel: 'telegram',
      account_id: 'ma-cle-secrete-2026', access_token: 'TG_TOKEN_TEST', connected: true,
    }]);
    await openChannels('telegram');
    expect(screen.getByTestId('channel-status-telegram').textContent).toContain('Connecté');

    fireEvent.click(screen.getByTestId('disconnect-telegram'));
    await waitFor(() => expect(screen.getByTestId('connect-telegram')).toBeTruthy(), { timeout: 5000 });
    expect(be.supabase.rows('channel_integrations')[0].connected).toBe(false);
    expect(be.supabase.rows('channel_integrations')[0].access_token).toBeNull();
  });

  it('migration SQL pas faite : l’écran le dit en clair au lieu de rester vide', async () => {
    be.supabase.missing.add('channel_integrations');
    await openChannels('messenger');
    expect(screen.getByTestId('channels-setup-required').textContent).toContain('migration_channels.sql');
  });

  it('« Vérifier à nouveau » teste le jeton rangé sans redemander quoi que ce soit', async () => {
    be.supabase.seed('channel_integrations', [{
      id: 'int_ms', user_id: ASSISTANT.userId, assistant_id: 'asst1', channel: 'messenger',
      account_id: 'PAGE_778899', access_token: 'PAGE_TOKEN_1', connected: true,
    }]);
    await openChannels('messenger');
    fireEvent.click(screen.getByTestId('reconnect-messenger'));

    const notice = await screen.findByTestId('channels-notice');
    await waitFor(() => expect(notice.textContent).toContain('Page vérifiée'));
    expect(be.supabase.rows('channel_integrations')[0].access_token).toBe('PAGE_TOKEN_1');
  });
});
