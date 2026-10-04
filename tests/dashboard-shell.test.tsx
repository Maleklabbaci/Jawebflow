// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';
import { FakeGemini, functionCall, modelReply, textPart } from './helpers/fake-gemini';

const hoisted = vi.hoisted(() => ({
  saves: [] as any[],
  order: [] as string[],
  assistants: [] as any[],
  saveGate: { wait: null as null | Promise<void> },
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
  getUserAssistants: async () => hoisted.assistants,
  saveAssistantToDatabase: async (a: any) => {
    hoisted.saves.push(JSON.parse(JSON.stringify(a)));
    hoisted.order.push('save');
    if (hoisted.saveGate.wait) await hoisted.saveGate.wait;
    return 'asst1';
  },
  isUserAdmin: () => false,
  updateAssistantPlan: async () => undefined,
  getAssistantById: async () => hoisted.assistants[0],
}));
// Objet STABLE (comme dans la vraie application) : un objet neuf à chaque rendu relancerait le chargement en boucle.
const AUTH = vi.hoisted(() => ({
  user: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour' },
  profile: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz', displayName: 'Nour', companyName: 'Boutique Nour', role: 'user', plan: 'basic' },
  loading: false,
  logout: vi.fn(async () => undefined),
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => AUTH }));

import { DashboardPlatform } from '../src/components/DashboardPlatform';
import { goTo, MENU_ENTRY } from './helpers/nav';
import { StatCard } from '../src/components/dashboard/StatCard';
import { Users } from 'lucide-react';
import { resetCopilotMemory } from '../functions/api/copilot';

const USER = '11111111-1111-4111-8111-111111111111';
// Aucun test ici ne touche à la facturation : seule la fenêtre d'alerte de l'Accueil est vérifiée.
const NOTE_1 = { id: 'n1', title: 'Livraison', content: 'Livraison en 48h', category: 'livraison', enabled: true };

let be: UiBackend;
let gemini: FakeGemini;
let errors: string[];

beforeEach(() => {
  localStorage.clear();
  AUTH.logout.mockClear();
  resetCopilotMemory();
  hoisted.saves.length = 0;
  hoisted.order.length = 0;
  hoisted.saveGate.wait = null;
  hoisted.assistants = [{
    id: 'asst1', userId: USER, widgetId: 'w_nour', businessName: 'Boutique Nour', websiteUrl: 'https://nour.dz',
    siteType: 'ecommerce', businessCategory: 'Boutique', businessDescription: 'Vêtements femme',
    knowledgeNotes: [NOTE_1], plan: 'basic', languages: ['fr'],
    behavior: { language: 'auto', length: 'normal', websiteMentions: 'auto', stopWhenConfused: true, stopCommand: true, customRules: '' },
  }];
  be = installUiBackend();
  gemini = new FakeGemini();
  be.external.handler = (url, init) => { hoisted.order.push('gemini'); return gemini.handler(url, init); };
  seedMerchant(be.supabase);
  // La base lue par le serveur est la même que celle que le tableau de bord vient de charger.
  Object.assign(be.supabase.rows('assistants')[0], { business_name: 'Boutique Nour', knowledge_notes: [NOTE_1], config: { behavior: hoisted.assistants[0].behavior } });
  for (const p of ['/api/chat', '/api/learning', '/api/leads', '/api/usage', '/api/ai-usage', '/api/plan', '/api/instagram/notify-setup']) {
    be.stub(p, () => new Response(JSON.stringify({ text: 'ok', prospects: [], questions: [], usage: {} }), { status: 200 }));
  }
  (window as any).open = vi.fn().mockReturnValue({ closed: true });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as any));
  (window as any).scrollTo = () => undefined;
  (window as any).innerWidth = 1280;
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ').slice(0, 300)); });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 60)); be.restore(); vi.restoreAllMocks(); });

const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const chatBox = () => screen.getByRole('textbox', { name: 'Ton message pour mon IA' }) as HTMLTextAreaElement;
const notesInDb = () => (be.supabase.rows('assistants')[0].knowledge_notes || []) as any[];
const lastSave = () => hoisted.saves.at(-1);

async function openChat() {
  // L'Accueil EST le chat (« Bonjour {prénom} » + grand champ de texte) : rien à ouvrir.
  render(<DashboardPlatform initialSection="overview" />);
  await settle();
  await screen.findByRole('textbox', { name: 'Ton message pour mon IA' });
}
async function say(text: string) {
  fireEvent.change(chatBox(), { target: { value: text } });
  fireEvent.keyDown(chatBox(), { key: 'Enter' });
}


const TITLES: Array<{ id: string; nav: string; title: string }> = [
  { id: 'overview', nav: 'Accueil', title: 'Accueil' },
  { id: 'summary', nav: 'Résumé', title: 'Résumé' },
  { id: 'knowledge', nav: 'Mon assistant', title: 'Mon assistant' },
  { id: 'crawler', nav: 'Mon assistant', title: 'Mon assistant' },
  { id: 'behavior', nav: 'Mon assistant', title: 'Mon assistant' },
  { id: 'widget', nav: 'Mon assistant', title: 'Mon assistant' },
  { id: 'learning', nav: 'Mon assistant', title: 'Mon assistant' },
  { id: 'simulator', nav: 'Tester', title: 'Tester mon assistant' },
  { id: 'integration', nav: 'Canaux', title: 'Canaux' },
  { id: 'instagram', nav: 'Canaux', title: 'Canaux' },
  { id: 'automations', nav: 'Canaux', title: 'Canaux' },
  { id: 'leads', nav: 'Clients', title: 'Mes clients' },
  { id: 'billing', nav: 'Abonnement & factures', title: 'Abonnement & factures' },
  { id: 'settings', nav: 'Mon profil', title: 'Mon profil' },
];

describe('barre latérale et en-tête (look « SaaS moderne »)', () => {
  it('la racine porte le thème ; la barre latérale, l’en-tête et la page sont dedans', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle();
    const root = document.querySelector('.dash-theme')!;
    expect(root).toBeTruthy();
    expect(root.querySelector('aside nav')).toBeTruthy();
    expect(root.querySelector('header h1')).toBeTruthy();
    expect(root.querySelector('main')).toBeTruthy();
  });

  it('une seule entrée est « active », elle suit la navigation, et chaque page a son titre (y compris Comportement)', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await settle();
    for (const s of TITLES) {
      // « Abonnement & factures » et « Mon profil » sont en haut à droite, plus dans la barre latérale
      if (s.id === 'settings') fireEvent.click(document.getElementById('account-menu-button')!);
      if (s.id === 'billing') fireEvent.click(document.getElementById('nav-billing')!);
      else if (s.id === 'settings') fireEvent.click(document.getElementById('nav-settings')!);
      else goTo(s.id);
      await settle(40);
      const inMenu = document.querySelectorAll('aside nav [aria-current="page"]');
      const inHeader = document.querySelectorAll('header [aria-current="page"]');
      if (s.id === 'billing' || s.id === 'settings') {
        expect(inMenu.length, `rien d'actif dans la barre latérale pour « ${s.nav} »`).toBe(0);
        expect(inHeader.length, `bouton actif en haut pour « ${s.nav} »`).toBe(1);
      } else {
        expect(inMenu.length, `entrée active pour « ${s.nav} »`).toBe(1);
        if (['integration', 'instagram', 'automations'].includes(s.id)) {
          expect(inMenu[0].getAttribute('data-tab')).toBe(s.id);
        } else {
          expect(inMenu[0].id).toBe(`nav-${MENU_ENTRY[s.id]}`);
        }
        expect(inHeader.length).toBe(0);
      }
      expect(document.querySelector('header h1')!.textContent, `titre de « ${s.nav} »`).toBe(s.title);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('Canaux ouvre un sous-menu animé et permet de changer de canal', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await settle();
    const channels = document.getElementById('nav-integration')!;
    fireEvent.click(channels);
    await settle(40);
    expect(channels.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('channels-submenu')!.className).toContain('grid-rows-[1fr]');
    expect(document.querySelector('header h1')!.textContent).toBe('Canaux');
    expect(screen.getByRole('button', { name: 'Instagram' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mon site' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Automatisations' })).toBeTruthy();

    fireEvent.click(document.querySelector('[data-tab="instagram"]')!);
    await settle(50);
    expect(document.querySelector('[data-tab="instagram"]')!.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('nav-integration')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('les chiffres du menu (fiches, clients) sont posés sur l’icône et disparaissent à zéro', async () => {
    be.stub('/api/leads', () => new Response(JSON.stringify({ prospects: [
      { id: 'p1', name: 'Karim', phone: '0550112233', status: 'qualifie', updatedAt: new Date().toISOString() },
      { id: 'p2', name: 'Sara', email: 'sara@mail.dz', status: 'qualifie', updatedAt: new Date().toISOString() },
    ] }), { status: 200 }));
    render(<DashboardPlatform initialSection="overview" />);
    await settle(300);
    expect(document.getElementById('nav-knowledge')!.textContent).toContain('1');
    expect(document.getElementById('nav-leads')!.textContent).toContain('2');
    expect(document.getElementById('nav-simulator')!.textContent).toBe('Tester'); // pas de chiffre
  });

  it('le CRM montre le rappel et permet de le marquer traité', async () => {
    const completedAt = '2026-10-03T12:00:00.000Z';
    be.stub('/api/leads', (init) => new Response(JSON.stringify((init.method || 'GET') === 'POST'
      ? { ok: true, prospectId: 'p1', followUpStatus: 'done', completedAt }
      : { prospects: [{
          id: 'p1', name: 'Sara', phone: '0550123456', email: 'Non fourni', need: 'Je veux acheter la veste',
          status: 'qualifie', channel: 'instagram', salesIntentType: 'purchase', followUpStatus: 'pending',
          followUpAt: '2026-10-03T13:00:00.000Z', followUpReason: 'Intention d’achat détectée',
          nextAction: 'Confirmer la commande et les détails de livraison', updatedAt: '2026-10-03T11:00:00.000Z',
          messages: [{ sender: 'user', text: 'Je veux acheter la veste', timestamp: '2026-10-03T11:00:00.000Z' }],
        }] }), { status: 200 }));
    render(<DashboardPlatform initialSection="leads" />);
    await settle(300);
    expect(be.api.filter((request) => request.url.includes('/api/leads')).length).toBeGreaterThan(0);
    expect(document.querySelector('header h1')?.textContent).toBe('Mes clients');
    fireEvent.click(screen.getByRole('button', { name: 'Mes clients' }));
    await settle(60);
    expect(document.querySelector('main')?.textContent).toContain('Mes clients intéressés');
    expect(document.querySelector('tbody')?.textContent).toContain('Sara');
    expect(screen.getByText('À suivre')).toBeTruthy();
    fireEvent.click(document.querySelector('tbody tr')!);
    await settle(40);
    expect(screen.getByText('Suivi commercial')).toBeTruthy();
    expect(screen.getByText('Confirmer la commande et les détails de livraison')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Marquer le suivi comme traité' }));
    await settle(80);
    expect(screen.getAllByText(/Suivi terminé/).length).toBeGreaterThan(0);
    expect(be.api.some((request) => request.method === 'POST' && request.url === '/api/leads')).toBe(true);
  });

  it('Résumé : trois cartes de chiffres (statut, clients, informations) avec les vrais nombres', async () => {
    be.stub('/api/leads', () => new Response(JSON.stringify({ prospects: [
      { id: 'p1', name: 'Karim', phone: '0550112233', status: 'qualifie', updatedAt: new Date().toISOString() },
      { id: 'p2', name: 'Sara', email: 'sara@mail.dz', status: 'qualifie', updatedAt: new Date().toISOString() },
    ] }), { status: 200 }));
    render(<DashboardPlatform initialSection="summary" />);
    await settle(300);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Statut de mon assistant')).toBeTruthy();
    expect(within(cards[0]).getByText('En ligne')).toBeTruthy();
    expect(within(cards[1]).getByText('Clients intéressés')).toBeTruthy();
    expect(within(cards[1]).getByText('2')).toBeTruthy();
    expect(within(cards[2]).getByText('Informations utilisées')).toBeTruthy();
    expect(within(cards[2]).getByText('1')).toBeTruthy();
  });
});

describe('barre latérale épurée, abonnement et profil en haut à droite', () => {
  it('la barre latérale ne montre ni le profil, ni le nom de l’entreprise, ni « Mon compte » (ni abonnement / profil)', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle(300);
    const side = document.querySelector('aside')!;
    for (const gone of ['nour@test.dz', 'Boutique Nour', 'Mon compte', 'Mon profil', 'Abonnement', 'Déconnexion', 'Espace client']) {
      if (gone === 'Espace client') continue; // la légende du logo reste
      expect(side.textContent, `« ${gone} » ne doit plus être dans la barre latérale`).not.toContain(gone);
    }
    expect(side.querySelector('img[alt="JawebFlow"]')).toBeTruthy();
    expect(side.querySelectorAll('nav button[id^="nav-"]').length).toBe(7); // 7 entrées principales ; Canaux révèle ses sous-sections
  });

  it('plus de bouton « Enregistrer » en haut : à la place, « Abonnement & factures » et le profil', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle(300);
    const header = document.querySelector('header')!;
    expect(Array.from(header.querySelectorAll('button')).some((b) => /^\s*Enregistrer\s*$/.test(b.textContent || ''))).toBe(false);
    expect(within(header as HTMLElement).getByRole('button', { name: 'Abonnement & factures' })).toBeTruthy();
    const profile = document.getElementById('account-menu-button')!;
    expect(header.contains(profile)).toBe(true);
    expect(profile.textContent).toContain('Nour');
  });

  it('le menu du profil : s’ouvre, « Mon profil » mène à l’écran, Échap et le clic ailleurs le ferment, « Se déconnecter » déconnecte', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle(300);
    const button = document.getElementById('account-menu-button')!;
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Mon compte' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu.textContent).toContain('nour@test.dz');
    expect(menu.textContent).toContain('Boutique Nour');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body); // un clic ailleurs
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Mon profil/ }));
    await settle(60);
    expect(document.querySelector('header h1')!.textContent).toBe('Mon profil');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(button);
    expect(AUTH.logout).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Se déconnecter/ }));
    expect(AUTH.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('« Abonnement & factures » ouvre l’écran de l’abonnement', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle(300);
    fireEvent.click(screen.getByRole('button', { name: 'Abonnement & factures' }));
    await settle(60);
    expect(document.querySelector('header h1')!.textContent).toBe('Abonnement & factures');
    expect(document.getElementById('nav-billing')!.getAttribute('aria-current')).toBe('page');
  });
});

describe('StatCard', () => {
  it('icône, libellé, gros nombre, ligne grise et pastille', () => {
    render(<StatCard icon={Users} label="Clients" value={12} hint="Ce mois-ci" badge={{ text: 'Actif', tone: 'good' }} />);
    expect(screen.getByText('Clients')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Ce mois-ci')).toBeTruthy();
    expect(screen.getByText('Actif').className).toContain('text-emerald-600');
  });
  it('sans ligne grise ni pastille : rien de vide', () => {
    const { container } = render(<StatCard icon={Users} label="Seul" value="7" />);
    expect(container.querySelectorAll('span').length).toBe(0);
  });
});

describe('le thème ne déborde pas sur le site public', () => {
  it('toutes les règles du bloc « espace client » de index.css sont limitées à .dash-theme', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8');
    const marker = css.indexOf('ESPACE CLIENT — look « SaaS moderne »');
    expect(marker).toBeGreaterThan(0);
    const block = css.slice(css.lastIndexOf('/*', marker)).replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const sel of selectors) {
      for (const part of sel.split(/,\s*(?![^()]*\))/)) {
        expect(/^(\.dash-theme|\.dash-gradient|html:has\(\.dash-theme\))/.test(part.trim()), `sélecteur non limité : ${part.trim().slice(0, 80)}`).toBe(true);
      }
    }
  });
});
