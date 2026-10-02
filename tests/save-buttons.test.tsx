// @vitest-environment jsdom
// Les boutons « Enregistrer » ne doivent JAMAIS écraser les fiches « Mes informations » (bug : l'événement du clic
// était enregistré à leur place quand un bouton appelait directement la fonction de sauvegarde).
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

const saveSpy = vi.fn(async (_a: any) => 'asst1');
const ASSISTANT = {
  id: 'asst1', userId: '11111111-1111-4111-8111-111111111111', widgetId: 'w_nour', businessName: 'Boutique Nour',
  websiteUrl: 'https://nour.dz', siteType: 'ecommerce', businessCategory: 'Boutique', businessDescription: 'Vêtements femme',
  knowledgeNotes: [{ id: 'n1', title: 'Livraison', content: 'Livraison en 48h', category: 'Livraison', enabled: true }],
  plan: 'basic', languages: ['fr'],
};
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
  getUserAssistants: async () => [ASSISTANT],
  saveAssistantToDatabase: (a: any) => saveSpy(a),
  isUserAdmin: () => false,
  updateAssistantPlan: async () => undefined,
  getAssistantById: async () => ASSISTANT,
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: '11111111-1111-4111-8111-111111111111', email: 'n@t.dz', displayName: 'Nour' },
    profile: { uid: 'x', role: 'user', plan: 'basic', companyName: 'Boutique Nour' },
    loading: false,
    logout: async () => undefined,
  }),
}));
import { DashboardPlatform } from '../src/components/DashboardPlatform';

let be: UiBackend;
beforeEach(() => {
  localStorage.clear();
  be = installUiBackend();
  seedMerchant(be.supabase);
  for (const p of ['/api/leads', '/api/usage', '/api/ai-usage', '/api/learning']) be.stub(p, () => new Response(JSON.stringify({ prospects: [], questions: [] })));
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as any));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 60)); be.restore(); vi.restoreAllMocks(); saveSpy.mockClear(); });

async function openAndClick(section: string, pick: (b: HTMLButtonElement) => boolean) {
  render(<DashboardPlatform initialSection={section} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  saveSpy.mockClear();
  const btn = (Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]).find(pick);
  expect(btn, 'bouton Enregistrer introuvable').toBeTruthy();
  await act(async () => { fireEvent.click(btn!); await new Promise((r) => setTimeout(r, 120)); });
  expect(saveSpy).toHaveBeenCalled();
  return saveSpy.mock.calls.at(-1)![0];
}

describe('boutons « Enregistrer »', () => {
  it.each([
    ['page Comportement', 'behavior', (b: HTMLButtonElement) => /Enregistrer/.test(b.textContent || '') && !b.closest('header')],
    ['page Apparence', 'widget', (b: HTMLButtonElement) => /Enregistrer/.test(b.textContent || '') && !b.closest('header')],
  ])('%s : enregistre les VRAIES fiches, pas l’événement du clic', async (_name, section, pick) => {
    const saved = await openAndClick(section, pick);
    expect(Array.isArray(saved.knowledgeNotes)).toBe(true);
    expect(saved.knowledgeNotes).toEqual(ASSISTANT.knowledgeNotes);
    expect(saved).toMatchObject({ businessName: 'Boutique Nour', websiteUrl: 'https://nour.dz' });
    expect(JSON.stringify(saved)).not.toMatch(/_reactName|nativeEvent/);
  });
});

describe('échec d’enregistrement', () => {
  it('le témoin en haut à droite le dit (plus d’échec silencieux), et « Échec — réessayer » enregistre pour de bon', async () => {
    saveSpy.mockImplementation(async () => { throw new Error('réseau coupé'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<DashboardPlatform initialSection="overview" />);
    // plus de bouton « Enregistrer » en haut : l'enregistrement est automatique (≈ 1 s après le chargement) et échoue ici
    expect(Array.from(document.querySelectorAll('header button')).some((b) => /^\s*Enregistrer\s*$/.test(b.textContent || ''))).toBe(false);
    const retry = await screen.findByRole('button', { name: /Échec — réessayer/ }, { timeout: 4000 });
    expect(retry.title).toMatch(/a échoué/);
    // on réessaie avec une connexion rétablie : « Enregistré »
    saveSpy.mockImplementation(async () => 'asst1');
    await act(async () => { fireEvent.click(retry); await new Promise((r) => setTimeout(r, 120)); });
    expect(screen.getByRole('status').textContent).toMatch(/Enregistré/);
    expect(screen.queryByRole('button', { name: /Échec/ })).toBeNull();
  });

  it('l’échec reste affiché : il ne disparaît pas tout seul (plus de bouton « Enregistrer » pour réessayer à tout moment)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      saveSpy.mockImplementation(async () => { throw new Error('réseau coupé'); });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(<DashboardPlatform initialSection="overview" />);
      await screen.findByRole('button', { name: /Échec — réessayer/ }, { timeout: 4000 });
      await act(async () => { vi.advanceTimersByTime(30_000); }); // bien plus que les 6 s d'avant
      expect(screen.getByRole('button', { name: /Échec — réessayer/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
