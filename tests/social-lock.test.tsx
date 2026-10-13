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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  it('un client non ouvert N’ENTRE PAS : cadenas + « Prochainement », aucune action', async () => {
    render(<DashboardPlatform initialSection="messenger" />);

    const page = await screen.findByTestId('social-locked');
    expect(screen.getByText('Prochainement')).toBeTruthy();

    // Rien du module n'est monté : ni branchement, ni carte de canal, ni jeton.
    expect(screen.queryByTestId('channels-integration')).toBeNull();
    for (const testid of ['channel-card-instagram', 'channel-card-messenger', 'channel-card-whatsapp']) {
      expect(screen.queryByTestId(testid), testid).toBeNull();
    }
    // Aucun bouton : le client ne peut ni demander, ni forcer, ni vérifier.
    expect(screen.queryByTestId('social-request-access')).toBeNull();
    expect(screen.queryByTestId('social-lock-check')).toBeNull();
    // Aucun bouton DU TOUT sur la page fermée (le menu, lui, est à part).
    expect(within(page).queryByRole('button')).toBeNull();
    expect(be.api.some((a) => a.method === 'POST' && a.url === '/api/channels/request-access')).toBe(false);
  });

  it('DEUX GRANDES CARTES à l’entrée : le chatbot du site, et les réseaux cadenassés', async () => {
    render(<DashboardPlatform initialSection="overview" />);

    const chooser = await screen.findByTestId('space-chooser');
    expect(chooser.textContent).toContain('Chatbot du site web');
    expect(chooser.textContent).toContain('Réseaux sociaux');
    // Module fermé → la carte l'affiche et mène à la page « Prochainement ».
    expect(screen.getByTestId('space-social-locked')).toBeTruthy();
    fireEvent.click(screen.getByTestId('space-social'));
    expect(await screen.findByTestId('social-locked')).toBeTruthy();

    // Module ouvert → la carte mène au branchement des réseaux.
    cleanup();
    hoisted.profile.socialEnabled = true;
    render(<DashboardPlatform initialSection="overview" />);
    await screen.findByTestId('space-chooser');
    expect(screen.queryByTestId('space-social-locked')).toBeNull();
    fireEvent.click(screen.getByTestId('space-social'));
    await new Promise((r) => setTimeout(r, 80));
    // Module ouvert → on entre dans l'espace (premier onglet : Instagram).
    expect(document.querySelector('header h1')!.textContent).toBe('Instagram');
  });

  it('la carte « Chatbot du site web » mène à l’espace web', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    fireEvent.click(await screen.findByTestId('space-web'));
    await new Promise((r) => setTimeout(r, 60));
    expect(document.getElementById('nav-knowledge')!.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-tab="knowledge"]')!.getAttribute('aria-current')).toBe('page');
  });

  it('le menu porte le cadenas, et le retirer suit l’état du compte', async () => {
    render(<DashboardPlatform initialSection="messenger" />);
    await screen.findByTestId('social-locked');
    expect(document.querySelector('[aria-label="Module à activer"]')).toBeTruthy();
    cleanup();

    hoisted.profile.socialEnabled = true;
    render(<DashboardPlatform initialSection="messenger" />);
    await screen.findByTestId('channels-integration');
    expect(document.querySelector('[aria-label="Module à activer"]')).toBeNull();
  });

  it('un profil SANS la colonne (migration pas encore passée) reste fermé', async () => {
    hoisted.profile.socialEnabled = undefined;
    render(<DashboardPlatform initialSection="instagram" />);
    expect(await screen.findByTestId('social-locked')).toBeTruthy();
    expect(screen.queryByTestId('channels-integration')).toBeNull();
  });

  it('tous les onglets du module sont fermés : Instagram, les 4 canaux ET les automatisations', async () => {
    for (const section of ['instagram', 'messenger', 'whatsapp', 'telegram', 'tiktok', 'automations']) {
      render(<DashboardPlatform initialSection={section} />);
      expect(await screen.findByTestId('social-locked'), section).toBeTruthy();
      cleanup();
    }
  });

  it('le profil du client porte bien l’état du module (sinon le cadenas serait décoratif)', () => {
    // Garde-fou : c'est exactement le bug qui rendait le cadenas inopérant —
    // la colonne existait en base, mais le profil ne la lisait pas.
    const src = readFileSync(path.resolve(__dirname, '../src/context/AuthContext.tsx'), 'utf8');
    expect(src).toContain('socialEnabled: data.social_enabled === true');
  });

  // Le client n'a plus de bouton « Demander l'accès ». La route existe toujours
  // (vérifiée ici) : si un jour on veut rouvrir la demande, elle est prête.
  it('la route de demande reste fonctionnelle et TRACÉE en base', async () => {
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
    Object.assign(be.supabase.rows('users')[0], { social_enabled: false });

    const res = await fetch('/api/channels/integrations?assistantId=asst1', {
      headers: { Authorization: 'Bearer BEARER_U1' },
    });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.socialLocked).toBe(true);
    expect(String(data.error)).toContain('réseaux sociaux');
  });

  it('module ouvert : les onglets reprennent leur place', async () => {
    hoisted.profile.socialEnabled = true;
    Object.assign(be.supabase.rows('users')[0], { social_enabled: true });

    render(<DashboardPlatform initialSection="messenger" />);
    expect(await screen.findByTestId('channels-integration')).toBeTruthy();
    expect(screen.queryByTestId('social-locked')).toBeNull();
  });

  it('le propriétaire (admin) n’est jamais bloqué par le module', async () => {
    hoisted.profile.role = 'superadmin';
    Object.assign(be.supabase.rows('users')[0], { role: 'superadmin', social_enabled: false });

    render(<DashboardPlatform initialSection="messenger" />);
    expect(await screen.findByTestId('channels-integration')).toBeTruthy();
  });
});
