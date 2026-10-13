// @vitest-environment jsdom
/**
 * MODULE RÉSEAUX SOCIAUX — LE CADENAS
 * ============================================================================
 * Le chatbot à intégrer dans le site web et les réseaux sociaux sont DEUX
 * produits : le second s'ouvre client par client. Ces tests tiennent les trois
 * promesses faites au marchand :
 *
 *   1. il VOIT que le module existe et ce qu'il apporte (jamais une page
 *      blanche, jamais un message technique) ;
 *   2. il peut DEMANDER l'activation en un clic, et sa demande est tracée ;
 *   3. le verrou tient côté serveur : appeler l'API directement ne l'ouvre pas.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

const USER = '11111111-1111-4111-8111-111111111111';

const hoisted = vi.hoisted(() => ({
  profile: {
    uid: '11111111-1111-4111-8111-111111111111',
    email: 'nour@test.dz',
    displayName: 'Nour',
    companyName: 'Boutique Nour',
    role: 'user',
    plan: 'pro',
    socialEnabled: false as boolean | undefined,
  },
  assistants: [] as any[],
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
  getUserAssistants: async () => hoisted.assistants,
  saveAssistantToDatabase: async () => 'asst1',
  isUserAdmin: (p: any) => p?.role === 'admin' || p?.role === 'superadmin',
  updateAssistantPlan: async () => undefined,
  getAssistantById: async () => hoisted.assistants[0],
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour' },
    profile: hoisted.profile,
    loading: false,
    logout: async () => undefined,
  }),
}));

import { DashboardPlatform } from '../src/components/DashboardPlatform';

let be: UiBackend;

beforeEach(() => {
  localStorage.clear();
  hoisted.profile.role = 'user';
  hoisted.profile.socialEnabled = false;
  hoisted.assistants.length = 0;
  hoisted.assistants.push({
    id: 'asst1', userId: USER, widgetId: 'w_nour', businessName: 'Boutique Nour',
    websiteUrl: 'https://nour.dz', siteType: 'ecommerce', businessCategory: 'Boutique',
    businessDescription: 'Vêtements femme', knowledgeNotes: [], plan: 'pro', languages: ['fr'],
  });
  be = installUiBackend();
  seedMerchant(be.supabase);
  for (const p of ['/api/chat', '/api/learning', '/api/leads', '/api/usage', '/api/ai-usage', '/api/plan', '/api/instagram/notify-setup']) {
    be.stub(p, () => new Response(JSON.stringify({ text: 'ok', prospects: [], questions: [], usage: {} }), { status: 200 }));
  }
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as any));
  (window as any).scrollTo = () => undefined;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
  be.restore();
  vi.restoreAllMocks();
});

describe('le cadenas du module Réseaux sociaux', () => {
  it('un client non ouvert VOIT le module et peut demander son activation', async () => {
    render(<DashboardPlatform initialSection="messenger" />);

    // Le cadenas s'affiche, avec les cinq réseaux annoncés.
    expect(await screen.findByTestId('social-locked')).toBeTruthy();
    for (const label of ['Instagram', 'Messenger', 'WhatsApp', 'Telegram', 'TikTok']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    // Le formulaire de branchement, lui, n'est pas proposé.
    expect(screen.queryByTestId('channels-integration')).toBeNull();

    // La demande part en un clic et le marchand est rassuré.
    fireEvent.click(screen.getByTestId('social-request-access'));
    expect(await screen.findByTestId('social-request-sent')).toBeTruthy();
    expect(be.api.some((a) => a.method === 'POST' && a.url === '/api/channels/request-access')).toBe(true);
  });

  it('le menu porte le cadenas, et le retirer suit l’état du compte', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await screen.findByTestId('social-locked').catch(() => undefined);
    expect(document.querySelector('[aria-label="Module à activer"]')).toBeTruthy();
    cleanup();

    hoisted.profile.socialEnabled = true;
    render(<DashboardPlatform initialSection="overview" />);
    await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector('[aria-label="Module à activer"]')).toBeNull();
  });

  it('la demande est TRACÉE en base (une demande perdue = un client perdu)', async () => {
    const res = await fetch('/api/channels/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer BEARER_U1' },
      body: JSON.stringify({ message: 'Messenger et WhatsApp surtout' }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const stored = be.supabase.rows('social_requests');
    expect(stored.length).toBe(1);
    expect(stored[0]).toMatchObject({
      user_id: USER,
      email: `${USER}@test.dz`,
      message: 'Messenger et WhatsApp surtout',
      status: 'pending',
    });
  });

  it('sans jeton, aucune demande n’est acceptée', async () => {
    const res = await fetch('/api/channels/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'bonjour' }),
    });
    expect(res.status).toBe(401);
    expect(be.supabase.rows('social_requests').length).toBe(0);
  });

  it('le verrou tient côté SERVEUR : appeler l’API directement ne l’ouvre pas', async () => {
    be.supabase.seed('users', [{ id: USER, email: 'nour@test.dz', role: 'user', social_enabled: false }]);

    const res = await fetch('/api/channels/integrations?assistantId=asst1', {
      headers: { Authorization: 'Bearer BEARER_U1' },
    });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.socialLocked).toBe(true);
    expect(String(data.error)).toContain('Réseaux sociaux');
  });

  it('module ouvert : les onglets reprennent leur place', async () => {
    hoisted.profile.socialEnabled = true;
    be.supabase.seed('users', [{ id: USER, email: 'nour@test.dz', role: 'user', social_enabled: true }]);

    render(<DashboardPlatform initialSection="messenger" />);
    expect(await screen.findByTestId('channels-integration')).toBeTruthy();
    expect(screen.queryByTestId('social-locked')).toBeNull();
  });

  it('le propriétaire (admin) n’est jamais bloqué par le module', async () => {
    hoisted.profile.role = 'superadmin';
    be.supabase.seed('users', [{ id: USER, email: 'nour@test.dz', role: 'superadmin', social_enabled: false }]);

    render(<DashboardPlatform initialSection="messenger" />);
    expect(await screen.findByTestId('channels-integration')).toBeTruthy();
  });
});
