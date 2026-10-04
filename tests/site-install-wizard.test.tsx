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
import { SiteInstallWizard, SITE_PLATFORMS } from '../src/components/dashboard/SiteInstallWizard';
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



const SCRIPT = '<script src="https://jawebflow.pages.dev/widget.js" data-assistant-id="asst1" defer></script>';
const clipboard = () => (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>);

function mountWizard(over: Partial<React.ComponentProps<typeof SiteInstallWizard>> = {}) {
  const props = { scriptHtml: SCRIPT, websiteUrl: 'https://nour.dz', userId: 'u1', onGoTest: vi.fn(), onGoInstagram: vi.fn(), ...over };
  render(<SiteInstallWizard {...props} />);
  return props;
}

describe('Mettre la bulle sur mon site — 3 étapes', () => {
  it('étape 1 : des cartes simples (pas de code, pas d’onglets React / Next.js / PHP)', () => {
    mountWizard();
    const group = screen.getByRole('radiogroup', { name: 'Type de site' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toHaveLength(SITE_PLATFORMS.length);
    for (const name of ['Shopify', 'WordPress', 'Wix']) expect(within(group).getByRole('radio', { name: new RegExp(name) })).toBeTruthy();
    expect(screen.queryByText(/React|Next\.js|PHP|cURL|développeur\)/)).toBeNull();
    expect(screen.queryByText(SCRIPT)).toBeNull(); // le code n'apparaît qu'à l'étape 2
    expect(document.querySelector('[data-step="code"]')!.hasAttribute('disabled')).toBe(true); // on ne saute pas d'étape
  });

  it('choisir son site mène au code ET à la façon de le coller (propre à ce site)', () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Shopify/ }));
    expect(screen.getByText('Copie ton code')).toBeTruthy();
    expect(screen.getByLabelText('Ton code').textContent).toBe(SCRIPT);
    expect(screen.getByText(/theme\.liquid/)).toBeTruthy();
    expect(screen.queryByText(/WPCode/)).toBeNull();
    // retour, autre choix
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    fireEvent.click(screen.getByRole('radio', { name: /WordPress/ }));
    expect(screen.getByText(/WPCode/)).toBeTruthy();
    expect(screen.queryByText(/theme\.liquid/)).toBeNull();
  });

  it('« Copier le code » copie la ligne <script> (et PAS un composant React comme avant)', async () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Wix/ }));
    await act(async () => { fireEvent.click(document.getElementById('install-copy')!); });
    expect(clipboard()).toHaveBeenCalledWith(SCRIPT);
    expect(screen.getByText('Code copié !')).toBeTruthy();
  });

  it('si la copie automatique est refusée par le navigateur : on le dit et on explique quoi faire', async () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Wix/ }));
    clipboard().mockRejectedValueOnce(new Error('refusé'));
    await act(async () => { fireEvent.click(document.getElementById('install-copy')!); });
    expect(screen.getByRole('alert').textContent).toMatch(/Ctrl \+ C/);
  });

  it('« Envoyer à mon webmaster » : un e-mail déjà écrit qui contient le code', () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Site sur mesure/ }));
    const link = screen.getByRole('link', { name: /Envoyer à mon webmaster/ }) as HTMLAnchorElement;
    expect(link.href.startsWith('mailto:')).toBe(true);
    expect(decodeURIComponent(link.href)).toContain(SCRIPT);
    expect(decodeURIComponent(link.href)).toContain('</body>');
  });

  it('étape 3 : « Oui, je vois la bulle » termine (et c’est retenu) ; « Revoir les étapes » recommence', () => {
    const props = mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Shopify/ }));
    fireEvent.click(screen.getByRole('button', { name: /J’ai collé le code/ }));
    expect(screen.getByText('Vérifie que ça marche')).toBeTruthy();
    expect((screen.getByRole('link', { name: /Ouvrir mon site/ }) as HTMLAnchorElement).href).toBe('https://nour.dz/');

    fireEvent.click(screen.getByRole('button', { name: /Oui, je vois la bulle/ }));
    expect(screen.getByTestId('site-install-done').textContent).toContain('Ton assistant est sur ton site');
    expect(localStorage.getItem('jawebflow_site_installed_u1')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /Connecter Instagram/ }));
    expect(props.onGoInstagram).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Tester mon assistant/ }));
    expect(props.onGoTest).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Revoir les étapes/ }));
    expect(screen.getByRole('radiogroup', { name: 'Type de site' })).toBeTruthy();
    expect(localStorage.getItem('jawebflow_site_installed_u1')).toBeNull();
  });

  it('déjà installé lors d’une visite précédente : on ouvre directement sur « c’est fait »', () => {
    localStorage.setItem('jawebflow_site_installed_u1', '1');
    mountWizard();
    expect(screen.getByTestId('site-install-done')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('« Non, je ne vois rien » : une aide en français, avec le raccourci vers le webmaster', () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /WordPress/ }));
    fireEvent.click(screen.getByRole('button', { name: /J’ai collé le code/ }));
    expect(screen.queryByTestId('no-bubble-help')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Non, je ne vois rien/ }));
    const help = screen.getByTestId('no-bubble-help');
    expect(help.textContent).toMatch(/cache/);
    expect(within(help).getByRole('link', { name: /Envoie le code à ton webmaster/ })).toBeTruthy();
    expect(localStorage.getItem('jawebflow_site_installed_u1')).toBeNull(); // pas « installé » tant qu'il ne l'a pas dit
  });

  it('sans adresse de site : pas de faux lien « Ouvrir mon site »', () => {
    mountWizard({ websiteUrl: '' });
    fireEvent.click(screen.getByRole('radio', { name: /Wix/ }));
    fireEvent.click(screen.getByRole('button', { name: /J’ai collé le code/ }));
    expect(screen.queryByRole('link', { name: /Ouvrir mon site/ })).toBeNull();
  });

  it('le fil d’étapes : les étapes passées sont cliquables, pas les suivantes', () => {
    mountWizard();
    fireEvent.click(screen.getByRole('radio', { name: /Wix/ }));
    expect(document.querySelector('[data-step="site"]')!.hasAttribute('disabled')).toBe(false); // étape passée
    expect(document.querySelector('[data-step="code"]')!.getAttribute('aria-current')).toBe('step');
    fireEvent.click(document.querySelector('[data-step="site"]')!);
    expect(screen.getByRole('radiogroup', { name: 'Type de site' })).toBeTruthy();
  });
});

describe('dans le tableau de bord', () => {
  it('« Mettre sur mon site » ouvre l’assistant en 3 étapes ; plus de version développeur ni d’outil de webhook', async () => {
    render(<DashboardPlatform initialSection="integration" />);
    await settle(300);
    expect(screen.getByTestId('site-install')).toBeTruthy();
    expect(document.querySelector('header h1')!.textContent).toBe('Canaux');
    const main = document.querySelector('main')!.textContent || '';
    for (const technical of ['version pour développeur', 'Options avancées', 'Webhook', 'webhook', 'App.tsx', 'cURL', 'React / Vite']) {
      expect(main, technical).not.toContain(technical);
    }
    // le code proposé est bien celui de CE compte (identifiant de l'assistant), jamais un composant React
    fireEvent.click(screen.getByRole('radio', { name: /Shopify/ }));
    const code = screen.getByLabelText('Ton code').textContent || '';
    expect(code).toContain('<script');
    expect(code).toContain('data-assistant-id="asst1"');
    expect(code).not.toContain('import React');
  });

  it('depuis l’assistant : « Tester l’assistant ici » ouvre le test, « Connecter Instagram » ouvre Instagram', async () => {
    localStorage.setItem('jawebflow_site_installed_11111111-1111-4111-8111-111111111111', '1');
    render(<DashboardPlatform initialSection="integration" />);
    await settle(300);
    fireEvent.click(screen.getByRole('button', { name: /Tester mon assistant/ }));
    await settle(60);
    expect(document.querySelector('header h1')!.textContent).toBe('Tester mon assistant');
    fireEvent.click(document.getElementById('nav-integration')!);
    await settle(60);
    fireEvent.click(screen.getByRole('button', { name: /Connecter Instagram/ }));
    await settle(60);
    expect(document.querySelector('header h1')!.textContent).toBe('Canaux');
    expect(document.querySelector('[data-tab="instagram"]')!.getAttribute('aria-current')).toBe('page');
  });
});
