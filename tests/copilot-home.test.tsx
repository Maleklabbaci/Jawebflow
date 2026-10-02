// @vitest-environment jsdom
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
  logout: async () => undefined,
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => AUTH }));

import { DashboardPlatform } from '../src/components/DashboardPlatform';
import { resetCopilotMemory } from '../functions/api/copilot';
import { goTo } from './helpers/nav';

const USER = '11111111-1111-4111-8111-111111111111';
// Aucun test ici ne touche à la facturation : seule la fenêtre d'alerte de l'Accueil est vérifiée.
const NOTE_1 = { id: 'n1', title: 'Livraison', content: 'Livraison en 48h', category: 'livraison', enabled: true };

let be: UiBackend;
let gemini: FakeGemini;
let errors: string[];

beforeEach(() => {
  localStorage.clear();
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

describe('Accueil façon Gemini / Claude', () => {
  it('« Bonjour {prénom} », la question et le grand champ de texte — sans bouton flottant', async () => {
    await openChat();
    expect(screen.getByRole('heading', { level: 2, name: 'Bonjour, Nour' })).toBeTruthy();
    expect(screen.getByText('Quoi de neuf ? On ajoute quoi ?')).toBeTruthy();
    expect(chatBox().placeholder).toMatch(/Ajoute une info, demande tes chiffres/);
    expect(document.querySelector('header h1')!.textContent).toBe('Accueil');
    expect(document.getElementById('copilot-launcher')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // des suggestions, dont les deux questions de chiffres
    for (const label of ['Combien de messages cette semaine ?', 'Combien de leads ?', 'Ajouter une info à ma base', 'Répondre aux commentaires', 'Parler darija', 'Que sais-tu de moi ?']) {
      expect(screen.getByRole('button', { name: label }), label).toBeTruthy();
    }
    // résumé discret + pas d'étapes à faire pour un compte complet
    expect(screen.getByText(/Assistant en ligne/)).toBeTruthy();
    expect(screen.queryByText('Pour démarrer')).toBeNull();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('« Combien de messages ? » : la suggestion part toute seule, l’IA lit les VRAIS chiffres du compte et répond', async () => {
    const now = Date.now();
    const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
    const cc = (id: string, session: string, created: string) => ({ id, assistant_id: 'asst1', session_id: session, channel: 'web_widget', user_message: 'q', assistant_response: 'r', created_at: created });
    be.supabase.seed('conversation_contexts', [cc('c1', 's1', ago(2)), cc('c2', 's1', ago(3)), cc('c3', 's2', ago(30)), cc('old', 's9', ago(24 * 40))]);
    be.supabase.seed('prospects', [
      { id: 'p1', assistant_id: 'asst1', data: { name: 'Karim', phone: '0550112233' }, created_at: ago(5), updated_at: ago(5) },
      { id: 'p2', assistant_id: 'asst1', data: { name: 'Sara', email: 'sara@mail.dz' }, created_at: ago(6), updated_at: ago(6) },
      { id: 'p3', assistant_id: 'asst1', data: { status: 'visited' }, created_at: ago(7), updated_at: ago(7) },
    ]);
    gemini.next(
      modelReply(functionCall('get_stats', { period: '7d' })),
      modelReply(textPart('Cette semaine : 3 messages et 2 leads.')),
    );
    await openChat();
    fireEvent.click(screen.getByRole('button', { name: 'Combien de messages cette semaine ?' }));
    expect(await screen.findByText('Cette semaine : 3 messages et 2 leads.')).toBeTruthy();

    // la question du marchand est partie telle quelle…
    expect(JSON.stringify(gemini.calls[0].body)).toContain('Combien de messages mes clients');
    // …et le serveur a donné à l'IA les vrais nombres (3 messages sur 7 jours, 2 leads), sans rien modifier
    const toolAnswer = JSON.stringify(gemini.calls[1].body.contents.at(-1));
    expect(toolAnswer).toContain('functionResponse');
    expect(toolAnswer).toMatch(/messages_de_clients\W+3\b/);
    expect(toolAnswer).toMatch(/leads\W+2\b/);
    expect(notesInDb()).toHaveLength(1);
    // la discussion a pris la place du titre
    expect(screen.queryByRole('heading', { level: 2, name: /Bonjour/ })).toBeNull();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('« Ajouter une info à ma base » prépare la phrase dans le champ, sans l’envoyer', async () => {
    await openChat();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une info à ma base' }));
    expect(chatBox().value).toBe('Ajoute à ma base : ');
    expect(gemini.calls).toHaveLength(0);
  });

  it('la discussion commence : le champ de texte reste le même (le curseur ne saute pas), « Nouvelle discussion » ramène au titre', async () => {
    gemini.next(modelReply(textPart('Salam ! Je suis là.')));
    await openChat();
    const box = chatBox();
    box.focus();
    await say('salam');
    expect(await screen.findByText('Salam ! Je suis là.')).toBeTruthy();
    expect(screen.getByText('salam')).toBeTruthy(); // la bulle du marchand
    expect(chatBox()).toBe(box); // même élément…
    expect(document.activeElement).toBe(box); // …et le curseur est toujours dedans
    expect(screen.queryByText('Quoi de neuf ? On ajoute quoi ?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle discussion' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Bonjour, Nour' })).toBeTruthy();
    expect(chatBox()).toBe(box);
    expect(screen.queryByText('Salam ! Je suis là.')).toBeNull();
  });

  it('c’est la MÊME discussion partout : Accueil → autre écran (fenêtre flottante) → Accueil', async () => {
    gemini.next(modelReply(textPart('Réponse une.')), modelReply(textPart('Réponse deux.')));
    await openChat();
    await say('premier');
    await screen.findByText('Réponse une.');

    goTo('behavior');
    await settle(60);
    fireEvent.click(document.getElementById('copilot-launcher')!);
    const dialog = await screen.findByRole('dialog', { name: 'Discussion avec mon IA' });
    expect(within(dialog).getByText('premier')).toBeTruthy();
    expect(within(dialog).getByText('Réponse une.')).toBeTruthy();

    await say('deuxième');
    await within(dialog).findByText('Réponse deux.');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    fireEvent.click(document.getElementById('nav-overview')!);
    await settle(60);
    expect(await screen.findByText('Réponse deux.')).toBeTruthy();
    expect(screen.getByText('premier')).toBeTruthy();
    expect(screen.getByText('deuxième')).toBeTruthy();
    expect(screen.getByText('Réponse une.')).toBeTruthy();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('une réponse reçue sur l’Accueil ne laisse pas de point rouge « nouveau » sur le bouton flottant', async () => {
    gemini.next(modelReply(textPart('Bien reçu.')));
    await openChat();
    await say('coucou');
    await screen.findByText('Bien reçu.');
    goTo('behavior');
    await settle(60);
    expect(document.getElementById('copilot-launcher')).toBeTruthy();
    expect(screen.queryByLabelText('Nouvelle réponse')).toBeNull();
  });
});

describe('Accueil : rien n’est perdu', () => {
  it('l’ancien écran d’accueil existe toujours sous le nom « Résumé » (statut, chiffres, à faire)', async () => {
    render(<DashboardPlatform initialSection="summary" />);
    await settle();
    expect(document.querySelector('header h1')!.textContent).toBe('Résumé');
    expect(screen.getByText('Statut de mon assistant')).toBeTruthy();
    expect(screen.getByText('À faire')).toBeTruthy();
    expect(screen.getByText('Clients intéressés')).toBeTruthy();
  });

  it('« Pour démarrer » : les étapes qui manquent sont des pastilles qui mènent au bon écran', async () => {
    hoisted.assistants[0].knowledgeNotes = [];
    Object.assign(be.supabase.rows('assistants')[0], { knowledge_notes: [] });
    await openChat();
    expect(screen.getByText('Pour démarrer')).toBeTruthy();
    expect(screen.getByText(/Assistant en préparation/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renseigner le nom de mon entreprise' })).toBeNull(); // le nom existe déjà
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter mes informations' }));
    expect(await screen.findByText('Mon assistant', { selector: 'h1' })).toBeTruthy();
  });

  it('une urgence (limite atteinte) remonte sur l’Accueil, avec un bouton qui mène au bon écran', async () => {
    be.stub('/api/usage', () => new Response(JSON.stringify({ ok: true, used: 100, limit: 100, prospects: 0, openQuestions: 0 }), { status: 200 }));
    await openChat();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Limite atteinte');
    fireEvent.click(within(alert).getByRole('button', { name: 'Voir mon abonnement' }));
    expect(await screen.findByText('Abonnement & factures', { selector: 'h1' })).toBeTruthy();
  });

  it('pas d’urgence : aucune alerte sur l’Accueil', async () => {
    await openChat();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
