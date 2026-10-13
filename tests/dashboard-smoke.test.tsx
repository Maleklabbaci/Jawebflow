// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

const ASSISTANT = {
  id: 'asst1', userId: '11111111-1111-4111-8111-111111111111', widgetId: 'w_nour', businessName: 'Boutique Nour',
  websiteUrl: 'https://nour.dz', siteType: 'ecommerce', businessCategory: 'Boutique', businessDescription: 'Vêtements femme',
  knowledgeNotes: [{ id: 'n1', title: 'Livraison', content: 'Livraison en 48h', category: 'Livraison', enabled: true }],
  plan: 'basic', languages: ['fr'],
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
    profile: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour', companyName: 'Boutique Nour', role: 'user', plan: 'basic' },
    loading: false,
    logout: async () => undefined,
  }),
}));

import { DashboardPlatform } from '../src/components/DashboardPlatform';
import { goTo, MENU_ENTRY } from './helpers/nav';

const SECTIONS: Array<{ id: string; nav: string }> = [
  { id: 'overview', nav: 'Accueil' },
  { id: 'summary', nav: 'Résumé' },
  { id: 'crawler', nav: 'Mon site web' },
  { id: 'knowledge', nav: 'Mes informations' },
  { id: 'behavior', nav: 'Comportement' },
  { id: 'widget', nav: 'Apparence' },
  { id: 'simulator', nav: 'Tester l\'assistant' },
  { id: 'learning', nav: 'Apprentissage IA' },
  { id: 'leads', nav: 'Clients & statistiques' },
  { id: 'orders', nav: 'Commandes & RDV' },
  { id: 'integration', nav: 'Mon site' },
  { id: 'instagram', nav: 'Instagram' },
  { id: 'messenger', nav: 'Messenger' },
  { id: 'whatsapp', nav: 'WhatsApp' },
  { id: 'telegram', nav: 'Telegram' },
  { id: 'tiktok', nav: 'TikTok' },
  { id: 'automations', nav: 'Automatisations' },
  { id: 'billing', nav: 'Abonnement & factures' },
  { id: 'settings', nav: 'Mon profil' },
];

let be: UiBackend;
let errors: string[];

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
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ').slice(0, 300)); });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 60)); be.restore(); vi.restoreAllMocks(); });

describe('tableau de bord — navigation', () => {
  it('chaque onglet du menu s’ouvre sans planter, y compris « Automatisations »', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    for (const s of SECTIONS) {
      // « Abonnement & factures » est un bouton en haut à droite ; « Mon profil » est dans le menu du profil (même endroit)
      if (s.id === 'settings') await act(async () => { fireEvent.click(document.getElementById('account-menu-button')!); });
      if (s.id === 'settings' || s.id === 'billing') {
        const btn = document.getElementById(`nav-${s.id}`);
        expect(btn, `bouton « ${s.nav} »`).toBeTruthy();
        await act(async () => { fireEvent.click(btn!); await new Promise((r) => setTimeout(r, 60)); });
      } else {
        // menu d'abord, puis petit onglet (deux rendus successifs)
        const entry = MENU_ENTRY[s.id];
        if (entry && entry !== s.id) {
          await act(async () => { fireEvent.click(document.getElementById(`nav-${entry}`)!); });
          await act(async () => { fireEvent.click(document.querySelector(`[data-tab="${s.id}"]`)!); await new Promise((r) => setTimeout(r, 60)); });
        } else {
          await act(async () => { goTo(s.id); await new Promise((r) => setTimeout(r, 60)); });
        }
      }
      expect(document.querySelector('main')!.innerHTML.length, `onglet « ${s.nav} » vide`).toBeGreaterThan(200);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('« Automatisations » ouvre bien l’écran des automatisations avec son titre', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    goTo('automations');
    expect(await screen.findByRole('heading', { level: 1, name: 'Automatisations' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Nouvelle automatisation/ })).toBeTruthy();
    expect(window.location.pathname).toBe('/dashboard/automations');
  });

  it('on peut ouvrir directement /dashboard/automations', async () => {
    render(<DashboardPlatform initialSection="automations" />);
    expect(await screen.findByRole('button', { name: /Nouvelle automatisation/ })).toBeTruthy();
  });

  it('depuis l’onglet Instagram, « Ouvrir les automatisations » mène à l’écran des automatisations', async () => {
    render(<DashboardPlatform initialSection="instagram" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir les automatisations' }));
    expect(await screen.findByText(/Réponds tout seul aux commentaires/)).toBeTruthy();
  });

  it('depuis les automatisations, « Reconnecter Instagram » ramène sur l’onglet Instagram, carte « commentaires » en avant', async () => {
    be.meta.commentsPermission = false;
    be.meta.media = [{ id: '111', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg' }];
    render(<DashboardPlatform initialSection="automations" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnecter Instagram' }));
    await waitFor(() => expect(document.getElementById('instagram-comments-card')).toBeTruthy());
    expect(document.getElementById('instagram-comments-card')!.className).toMatch(/ring-2/);
    expect(await screen.findByRole('button', { name: 'Autoriser les commentaires' })).toBeTruthy();
  });
});

describe('le coach du bot', () => {
  it('la carte « Développez votre robot » liste ce qui manque et ouvre le bon écran', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    const card = document.querySelector('[data-testid="bot-coach-card"]');
    expect(card, 'carte du coach absente').toBeTruthy();
    expect(card!.textContent || '').toContain('% prêt');
    const openBtn = Array.from(card!.querySelectorAll('button')).find((b) => b.textContent === 'Ouvrir');
    expect(openBtn, 'aucune étape actionnable').toBeTruthy();
    await act(async () => { fireEvent.click(openBtn!); await new Promise((r) => setTimeout(r, 80)); });
    // On a quitté « Résumé » : la carte n'est plus là, l'écran cible est affiché.
    expect(document.querySelector('[data-testid="bot-coach-card"]'), 'la carte est restée affichée').toBeFalsy();
    expect(document.querySelector('main')!.innerHTML.length).toBeGreaterThan(200);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
