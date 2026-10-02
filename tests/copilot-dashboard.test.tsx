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

const USER = '11111111-1111-4111-8111-111111111111';
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
  render(<DashboardPlatform initialSection="overview" />);
  await settle();
  fireEvent.click(document.getElementById('copilot-launcher')!);
  await screen.findByRole('dialog', { name: 'Discussion avec mon IA' });
}
async function say(text: string) {
  fireEvent.change(chatBox(), { target: { value: text } });
  fireEvent.keyDown(chatBox(), { key: 'Enter' });
}

describe('où trouver « Parler à mon IA »', () => {
  it('bouton flottant, entrée du menu et bouton de l’accueil : tous ouvrent le même chat', async () => {
    render(<DashboardPlatform initialSection="overview" />);
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Discussion avec mon IA' })).toBeNull();

    const launcher = document.getElementById('copilot-launcher')!;
    expect(launcher.textContent).toContain('Parler à mon IA');
    fireEvent.click(launcher);
    expect(await screen.findByRole('dialog', { name: 'Discussion avec mon IA' })).toBeTruthy();
    expect(document.getElementById('copilot-launcher')).toBeNull(); // le bouton flottant s'efface quand le chat est ouvert

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog', { name: 'Discussion avec mon IA' })).toBeNull();
    expect(document.getElementById('copilot-launcher')).toBeTruthy();

    fireEvent.click(document.getElementById('nav-copilot')!);
    expect(await screen.findByRole('dialog', { name: 'Discussion avec mon IA' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    fireEvent.click(within(document.querySelector('main')!).getByRole('button', { name: /Parler à mon IA/ }));
    expect(await screen.findByRole('dialog', { name: 'Discussion avec mon IA' })).toBeTruthy();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('le chat reste disponible sur les autres onglets', async () => {
    render(<DashboardPlatform initialSection="behavior" />);
    await settle();
    expect(document.getElementById('copilot-launcher')).toBeTruthy();
  });
});

describe('ce que l’IA écrit apparaît dans les écrans, et la sauvegarde automatique ne l’écrase JAMAIS', () => {
  it('« ajoute… » : la fiche est dans « Mes informations », en base, et les sauvegardes suivantes la contiennent', async () => {
    await openChat();
    gemini.next(
      modelReply(functionCall('add_knowledge', { title: 'Coque Spiderman', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA', category: 'produits' })),
      modelReply(textPart('Ajouté ✅')),
    );
    await say('ajoute la coque spiderman à 1900 DA');
    await screen.findByText('Ajouté ✅');

    // 1) l'écran « Mes informations » montre la nouvelle fiche À CÔTÉ de l'ancienne
    fireEvent.click(screen.getByRole('button', { name: /Voir mes informations/ }));
    const main = document.querySelector('main')!;
    await waitFor(() => expect(within(main).getAllByText(/Coque Spiderman/).length).toBeGreaterThan(0));
    expect(within(main).getAllByText(/Livraison/).length).toBeGreaterThan(0);

    // 2) la base du serveur l'a
    expect(notesInDb().map((n) => n.title)).toEqual(['Livraison', 'Coque Spiderman']);

    // 3) la sauvegarde automatique du tableau de bord (≈1 s plus tard) réécrit les DEUX fiches — rien n'est perdu
    await waitFor(() => {
      const titles = (lastSave()?.knowledgeNotes || []).map((n: any) => n.title);
      expect(titles).toContain('Coque Spiderman');
      expect(titles).toContain('Livraison');
    }, { timeout: 4000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('avant de répondre, l’IA lit ce qui est affiché : les modifications en attente sont enregistrées d’abord', async () => {
    await openChat();
    gemini.next(modelReply(textPart('Ok.')));
    await say('salut');
    await screen.findByText('Ok.');
    const firstGemini = hoisted.order.indexOf('gemini');
    expect(firstGemini).toBeGreaterThan(-1);
    expect(hoisted.order.slice(0, firstGemini)).toContain('save'); // sauvegarde AVANT l'appel à l'IA
  });

  it('« réponds court en darija » : l’onglet Comportement affiche le nouveau réglage, et il est conservé par la sauvegarde suivante', async () => {
    await openChat();
    gemini.next(
      modelReply(functionCall('set_behavior', { language: 'darija_dz', length: 'short', add_rules: ['Tutoie toujours le client.'] })),
      modelReply(textPart('Réglé.')),
    );
    await say('réponds court et en darija, tutoie les clients');
    await screen.findByText('Réglé.');

    fireEvent.click(screen.getByRole('button', { name: /Voir le comportement/ }));
    const select = (await screen.findByDisplayValue('100% algérien (darija algérienne)')) as HTMLSelectElement;
    expect(select.value).toBe('darija_dz');
    expect((screen.getByDisplayValue(/Tutoie toujours le client/) as HTMLTextAreaElement).value).toBe('Tutoie toujours le client.');

    // une sauvegarde complète du tableau de bord (bouton « Enregistrer ces informations ») garde le nouveau comportement
    fireEvent.click(document.getElementById('nav-knowledge')!);
    const savesBefore = hoisted.saves.length;
    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer ces informations/ }));
    await waitFor(() => expect(hoisted.saves.length).toBeGreaterThan(savesBefore));
    expect(hoisted.saves.at(-1).behavior).toMatchObject({ language: 'darija_dz', length: 'short', customRules: 'Tutoie toujours le client.' });
  });

  it('« Annuler » depuis le chat remet aussi l’écran à jour', async () => {
    await openChat();
    gemini.next(modelReply(functionCall('add_knowledge', { title: 'Promo été', content: 'Promo -20 %' })), modelReply(textPart('Ajouté ✅')));
    await say('ajoute la promo été -20%');
    await screen.findByText('Ajouté ✅');
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    await waitFor(() => expect(notesInDb().map((n) => n.title)).not.toContain('Promo été'));
    await waitFor(() => {
      const titles = (lastSave()?.knowledgeNotes || []).map((n: any) => n.title);
      expect(titles).toContain('Livraison');
      expect(titles).not.toContain('Promo été');
    }, { timeout: 4000 });
  });

  it('automatisation créée par le chat : l’onglet Automatisations la montre', async () => {
    be.meta.subscribedFields = ['messages', 'messaging_postbacks', 'comments'];
    await openChat();
    gemini.next(
      modelReply(functionCall('create_automation', { trigger: 'comment', name: 'Prix en commentaire', keywords: ['prix'], public_replies: ['Merci !'], dm_text: 'Voici nos prix 📩' })),
      modelReply(textPart('Créée, en pause.')),
    );
    await say('quand on commente prix, réponds merci et envoie les prix');
    await screen.findByText('Créée, en pause.');
    fireEvent.click(screen.getByRole('button', { name: /Voir les automatisations/ }));
    expect(await screen.findByText('Prix en commentaire')).toBeTruthy();
  });
});

describe('« Mes informations » : l’ajout éclair marche, et mène au chat pour aller plus loin', () => {
  it('« Ajout éclair » reçoit bien l’identifiant de l’assistant (il était refusé sans) et la fiche apparaît', async () => {
    render(<DashboardPlatform initialSection="knowledge" />);
    await settle();
    gemini.next({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'add', title: 'Coque Spiderman', category: 'produits', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA' }) }] } }] });

    const input = await screen.findByPlaceholderText(/Ex : j'ai ajouté le produit spiderman/);
    const card = input.closest('div.space-y-2') as HTMLElement; // la carte « Ajout éclair »
    fireEvent.change(input, { target: { value: 'j’ai ajouté la coque spiderman à 1900 DA' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/✅ Enregistré : Coque Spiderman/)).toBeTruthy();
    expect(be.api.find((c) => c.url === '/api/knowledge/quick-add')?.body.assistantId).toBe('asst1');
    expect(notesInDb().map((n) => n.title)).toContain('Coque Spiderman');
    expect(screen.queryByText(/assistantId requis/)).toBeNull();
  });

  it('le lien « Parle à ton IA » ouvre le chat', async () => {
    render(<DashboardPlatform initialSection="knowledge" />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Parle à ton IA' }));
    expect(await screen.findByRole('dialog', { name: 'Discussion avec mon IA' })).toBeTruthy();
  });
});

describe('sauvegarde automatique : en pause pendant que l’IA travaille', () => {
  it('une modification faite à l’écran pendant l’attente n’est PAS écrite par le minuteur… puis enregistrée dès que l’IA a fini', async () => {
    await openChat();
    let release!: () => void;
    gemini.next(() => new Promise((resolve) => { release = () => resolve(modelReply(textPart('Voilà.'))); }));
    await say('salut');
    await screen.findByRole('status');
    await waitFor(() => expect(release).toBeTypeOf('function'));

    // pendant l'attente, le marchand met une fiche de côté dans « Mes informations » (derrière le chat)
    fireEvent.click(document.getElementById('nav-knowledge')!);
    const toggle = await screen.findByRole('button', { name: /Désactiver la fiche Livraison/ });
    const beforeEdit = hoisted.saves.length;
    fireEvent.click(toggle);
    await waitFor(() => expect(hoisted.saves.length).toBeGreaterThan(beforeEdit)); // enregistrement immédiat du bouton lui-même
    const afterEdit = hoisted.saves.length;

    await settle(1400); // plus long que le délai de la sauvegarde automatique (≈0,9 s)
    expect(hoisted.saves.length).toBe(afterEdit); // le minuteur n'a RIEN écrit tant que l'IA travaille

    await act(async () => { release(); });
    await screen.findByText('Voilà.');
    // fin de l'attente : ce qui était en attente est enregistré maintenant
    await waitFor(() => expect(hoisted.saves.length).toBeGreaterThan(afterEdit), { timeout: 4000 });
    expect(lastSave().knowledgeNotes.find((n: any) => n.id === 'n1').enabled).toBe(false);
  });
});

describe('réponse perdue en route : les écrans disent la vérité', () => {
  it('l’IA a écrit la fiche mais la réponse n’est jamais arrivée : « Mes informations » la montre quand même (et elle n’est pas écrasée)', async () => {
    await openChat();
    // Le serveur travaille normalement, mais la réponse se perd (coupure réseau côté marchand).
    const routed = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const res = await routed(input, init);
      if (String(input).startsWith('/api/copilot') && JSON.parse(String(init?.body || '{}')).messages) {
        hoisted.assistants[0].knowledgeNotes = notesInDb(); // ce que la base contient maintenant
        throw new TypeError('Failed to fetch');
      }
      return res;
    }) as any;
    gemini.next(
      modelReply(functionCall('add_knowledge', { title: 'Coque Spiderman', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA', category: 'produits' })),
      modelReply(textPart('Ajouté ✅')),
    );
    await say('ajoute la coque spiderman à 1900 DA');
    expect(await screen.findByText(/Pas de connexion internet/)).toBeTruthy();
    expect(notesInDb().map((n) => n.title)).toContain('Coque Spiderman');

    // l'écran « Mes informations » a été remis d'équerre avec la base
    fireEvent.click(document.getElementById('nav-knowledge')!);
    const main = document.querySelector('main')!;
    await waitFor(() => expect(within(main).getAllByText(/Coque Spiderman/).length).toBeGreaterThan(0));
    globalThis.fetch = routed;

    // et la sauvegarde automatique qui suit garde la fiche
    await waitFor(() => expect((lastSave()?.knowledgeNotes || []).map((n: any) => n.title)).toContain('Coque Spiderman'), { timeout: 4000 });
  });
});

describe('premier message d’un nouveau marchand', () => {
  it('sans assistant enregistré, le premier message crée d’abord l’assistant, puis l’IA travaille', async () => {
    hoisted.assistants = [];
    await openChat();
    gemini.next(modelReply(textPart('Bienvenue !')));
    await say('bonjour');
    await screen.findByText('Bienvenue !');
    expect(hoisted.saves.length).toBeGreaterThan(0);
    expect(hoisted.order.indexOf('save')).toBeLessThan(hoisted.order.indexOf('gemini'));
    expect(be.api.filter((c) => c.url === '/api/copilot')[0].body.assistantId).toBe('asst1');
  });

  it('enregistrement impossible : le chat le dit et n’appelle pas l’IA', async () => {
    await openChat();
    hoisted.saveGate.wait = Promise.reject(new Error('base injoignable'));
    hoisted.saveGate.wait.catch(() => undefined);
    gemini.next(modelReply(textPart('ne doit pas arriver')));
    await say('salut');
    expect(await screen.findByText(/Je n’arrive pas à enregistrer tes dernières modifications/)).toBeTruthy();
    expect(gemini.calls).toHaveLength(0);
    hoisted.saveGate.wait = null;
  });
});
