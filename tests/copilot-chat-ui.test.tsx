// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';
import { FakeGemini, functionCall, httpError, modelReply, textPart } from './helpers/fake-gemini';

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
}));

import { CopilotChat, type CopilotChatProps } from '../src/components/CopilotChat';
import { resetCopilotMemory } from '../functions/api/copilot';

const UID = '11111111-1111-4111-8111-111111111111';

let be: UiBackend;
let gemini: FakeGemini;
let onStatePatch: ReturnType<typeof vi.fn>;
let onNavigate: ReturnType<typeof vi.fn>;
let onBusyChange: ReturnType<typeof vi.fn>;
let ensureReady: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  resetCopilotMemory();
  be = installUiBackend();
  gemini = new FakeGemini();
  be.external.handler = gemini.handler;
  seedMerchant(be.supabase);
  Object.assign(be.supabase.rows('assistants')[0], { knowledge_notes: [], config: { behavior: { language: 'auto', length: 'normal', customRules: '' } } });
  onStatePatch = vi.fn();
  onNavigate = vi.fn();
  onBusyChange = vi.fn();
  ensureReady = vi.fn(async () => 'asst1');
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  be.restore();
  vi.restoreAllMocks();
});

const mount = (over: Partial<CopilotChatProps> = {}) =>
  render(
    <CopilotChat
      open
      onClose={() => undefined}
      userId={UID}
      assistantId="asst1"
      ensureReady={ensureReady as any}
      onStatePatch={onStatePatch as any}
      onNavigate={onNavigate as any}
      onBusyChange={onBusyChange as any}
      {...over}
    />,
  );

const box = () => screen.getByRole('textbox', { name: 'Ton message pour mon IA' }) as HTMLTextAreaElement;
const copilotCalls = () => be.api.filter((c) => c.url === '/api/copilot');
const notes = () => (be.supabase.rows('assistants')[0].knowledge_notes || []) as any[];

async function say(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.keyDown(box(), { key: 'Enter' });
}

const addNoteTurn = () =>
  gemini.next(
    modelReply(functionCall('add_knowledge', { title: 'Coque Spiderman', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA', category: 'produits' })),
    modelReply(textPart('C’est ajouté ✅ La coque Spiderman est à 1900 DA.')),
  );

describe('ouverture et premiers pas', () => {
  it('fermé : invisible ; ouvert : un accueil clair, des exemples, un champ prêt à écrire', () => {
    const { rerender } = mount({ open: false });
    expect(screen.queryByRole('dialog', { name: 'Discussion avec mon IA' })).toBeNull();
    rerender(
      <CopilotChat open onClose={() => undefined} userId={UID} assistantId="asst1" ensureReady={ensureReady as any} onStatePatch={onStatePatch as any} onNavigate={onNavigate as any} />,
    );
    expect(screen.getByRole('dialog', { name: 'Discussion avec mon IA' })).toBeTruthy();
    expect(screen.getByText(/Salut 👋 Je suis ton IA/)).toBeTruthy();
    expect(screen.getByText(/pour de vrai/)).toBeTruthy();
    for (const label of ['Ajouter une info à ma base', 'Répondre aux commentaires', 'Répondre plus court', 'Parler darija', 'Que sais-tu de moi ?', 'Mes automatisations']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(document.activeElement).toBe(box());
    expect((screen.getByRole('button', { name: 'Envoyer' }) as HTMLButtonElement).disabled).toBe(true); // rien à envoyer
  });

  it('un exemple à compléter pré-remplit le champ SANS rien envoyer ; un exemple complet part tout de suite', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une info à ma base' }));
    expect(box().value).toBe('Ajoute à ma base : ');
    expect(copilotCalls()).toHaveLength(0);

    gemini.next(modelReply(textPart('Voilà ce que je sais : ...')));
    fireEvent.click(screen.getByRole('button', { name: 'Que sais-tu de moi ?' }));
    expect(await screen.findByText('Voilà ce que je sais : ...')).toBeTruthy();
    expect(copilotCalls()).toHaveLength(1);
    expect(copilotCalls()[0].body.messages[0].text).toMatch(/résumé de ce que tu sais/);
  });
});

describe('« ajoute ça à ma base » — de la phrase à la fiche enregistrée', () => {
  it('le marchand écrit, l’IA répond, la fiche existe vraiment, une carte le prouve, et l’écran est mis à jour', async () => {
    addNoteTurn();
    mount();
    await say('ajoute le produit coque spiderman iphone 13 14 15 16 à 1900 DA');

    // la phrase du marchand apparaît tout de suite, le champ est vidé, l'attente est visible
    expect(screen.getByText('ajoute le produit coque spiderman iphone 13 14 15 16 à 1900 DA')).toBeTruthy();
    expect(box().value).toBe('');
    expect(screen.getByRole('status').textContent).toMatch(/Mon IA s’en occupe/);

    expect(await screen.findByText(/C’est ajouté ✅ La coque Spiderman est à 1900 DA/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    // preuve : la base contient la fiche
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatchObject({ title: 'Coque Spiderman', category: 'produits' });

    // la carte « ce qui a été fait »
    const card = screen.getByTestId('copilot-action');
    expect(within(card).getByText('Fiche ajoutée à « Mes informations »')).toBeTruthy();
    expect(within(card).getByText(/1900 DA/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Annuler/ })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Voir mes informations/ })).toBeTruthy();

    // le tableau de bord reçoit la nouvelle liste de fiches (sinon sa sauvegarde automatique l'écraserait)
    expect(onStatePatch).toHaveBeenCalledTimes(1);
    expect(onStatePatch.mock.calls[0][0].knowledgeNotes).toHaveLength(1);
    // et il a été prévenu qu'une demande est en cours, puis terminée
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(ensureReady).toHaveBeenCalledTimes(1);
  });

  it('Entrée envoie, Maj+Entrée fait un retour à la ligne (rien n’est envoyé)', async () => {
    mount();
    fireEvent.change(box(), { target: { value: 'première ligne' } });
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(copilotCalls()).toHaveLength(0);
    expect(box().value).toBe('première ligne');
  });

  it('« Annuler » défait vraiment l’ajout : la fiche disparaît de la base et de l’écran', async () => {
    addNoteTurn();
    mount();
    await say('ajoute la coque');
    await screen.findByText(/C’est ajouté/);
    onStatePatch.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    await waitFor(() => expect(notes()).toHaveLength(0));
    expect(await screen.findByText('Annulé')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Annuler/ })).toBeNull();
    expect(onStatePatch).toHaveBeenCalledWith({ knowledgeNotes: [] });
  });

  it('« Voir mes informations » mène à l’écran concerné', async () => {
    addNoteTurn();
    mount();
    await say('ajoute la coque');
    await screen.findByText(/C’est ajouté/);
    fireEvent.click(screen.getByRole('button', { name: /Voir mes informations/ }));
    expect(onNavigate).toHaveBeenCalledWith('knowledge');
  });

  it('la deuxième demande rappelle à l’IA ce qu’elle a déjà fait', async () => {
    addNoteTurn();
    mount();
    await say('ajoute la coque');
    await screen.findByText(/C’est ajouté/);

    gemini.next(modelReply(textPart('Ok.')));
    await say('et la livraison ?');
    await screen.findByText('Ok.');
    const sent = copilotCalls()[1].body.messages as Array<{ role: string; text: string }>;
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent[1].text).toContain('C’est ajouté ✅');
    expect(sent[1].text).toMatch(/\(Actions effectuées : Fiche ajoutée à « Mes informations » — Coque Spiderman/);
  });
});

describe('« réponds aux commentaires comme ça » — création puis activation', () => {
  const createTurn = () =>
    gemini.next(
      modelReply(
        functionCall('create_automation', {
          trigger: 'comment',
          name: 'Prix en commentaire',
          keywords: ['prix', 'ch7al'],
          public_replies: ['Merci {@pseudo} ! Regarde tes messages 📩'],
          dm_text: 'Salut {prenom} 👋 Voici nos tarifs : coque 1900 DA.',
        }),
      ),
      modelReply(textPart('J’ai créé la réponse automatique, elle est en pause. Je l’active ?')),
    );

  it('la carte propose « Activer maintenant » : un clic et elle est vraiment active en base', async () => {
    createTurn();
    mount();
    await say('quand on commente prix ou ch7al, réponds merci en public et envoie les tarifs en privé');
    await screen.findByText(/elle est en pause/);

    const card = screen.getByTestId('copilot-action');
    expect(within(card).getByText('Réponse automatique créée (en pause)')).toBeTruthy();
    expect(be.supabase.rows('ig_automations')[0].enabled).toBe(false);
    expect(onStatePatch.mock.calls[0][0].automationsChanged).toBe(true);

    fireEvent.click(within(card).getByRole('button', { name: /Activer maintenant/ }));
    await waitFor(() => expect(be.supabase.rows('ig_automations')[0].enabled).toBe(true));
    expect(await within(card).findByText('Activée')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: /Activer maintenant/ })).toBeNull();
    // « Annuler » reste possible : il supprime l'automatisation
    fireEvent.click(within(card).getByRole('button', { name: /Annuler/ }));
    await waitFor(() => expect(be.supabase.rows('ig_automations')).toHaveLength(0));
    expect(await within(card).findByText('Annulé')).toBeTruthy();
    // « Voir » ne se propose plus pour une action annulée
    expect(within(card).queryByRole('button', { name: /Voir les automatisations/ })).toBeNull();
  });

  it('si l’IA active elle-même l’automatisation (« oui, active »), le bouton « Activer maintenant » de la carte précédente disparaît', async () => {
    createTurn();
    mount();
    await say('crée la réponse prix');
    await screen.findByText(/elle est en pause/);
    const autoId = be.supabase.rows('ig_automations')[0].id;
    expect(screen.getByRole('button', { name: /Activer maintenant/ })).toBeTruthy();

    gemini.next(modelReply(functionCall('set_automation_enabled', { id: autoId, enabled: true })), modelReply(textPart('C’est activé ✅')));
    await say('oui active');
    await screen.findByText('C’est activé ✅');
    expect(be.supabase.rows('ig_automations')[0].enabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Activer maintenant/ })).toBeNull();
    expect(screen.getAllByText('Activée').length).toBeGreaterThan(0);
  });

  it('une activation refusée (automatisation incomplète) affiche le motif en français sur la carte', async () => {
    createTurn();
    mount();
    await say('crée la réponse prix');
    await screen.findByText(/elle est en pause/);
    // on la rend incomplète en base, comme si elle avait été modifiée ailleurs
    be.supabase.rows('ig_automations')[0].config.match.keywords = [];
    fireEvent.click(screen.getByRole('button', { name: /Activer maintenant/ }));
    expect(await screen.findByText(/Impossible d’activer/)).toBeTruthy();
    expect(be.supabase.rows('ig_automations')[0].enabled).toBe(false);
    expect(screen.getByRole('button', { name: /Activer maintenant/ })).toBeTruthy(); // on peut réessayer
  });
});

describe('« réponds court, en darija » — le comportement du robot', () => {
  it('le réglage est écrit, l’écran reçoit le nouveau comportement, et « Annuler » remet comme avant', async () => {
    gemini.next(
      modelReply(functionCall('set_behavior', { language: 'darija_dz', length: 'short', add_rules: ['Tutoie toujours le client.'] })),
      modelReply(textPart('C’est réglé : réponses courtes, en darija algérienne.')),
    );
    mount();
    await say('réponds court et en darija, et tutoie les clients');
    await screen.findByText(/C’est réglé/);
    expect(be.supabase.rows('assistants')[0].config.behavior).toMatchObject({ language: 'darija_dz', length: 'short', customRules: 'Tutoie toujours le client.' });
    const card = screen.getByTestId('copilot-action');
    expect(within(card).getByText('Façon de répondre mise à jour')).toBeTruthy();
    expect(within(card).getByText(/langue : darija algérienne/)).toBeTruthy();
    expect(onStatePatch.mock.calls[0][0].behavior).toMatchObject({ language: 'darija_dz', length: 'short' });

    fireEvent.click(within(card).getByRole('button', { name: /Annuler/ }));
    await waitFor(() => expect(be.supabase.rows('assistants')[0].config.behavior).toMatchObject({ language: 'auto', length: 'normal', customRules: '' }));
    expect(onStatePatch.mock.calls.at(-1)![0].behavior).toMatchObject({ language: 'auto', length: 'normal' });
  });
});

describe('quand quelque chose ne va pas', () => {
  it('IA indisponible : message simple + « Réessayer » ; au 2e essai ça marche et le message n’est pas dupliqué', async () => {
    gemini.fallback = () => httpError(500, 'boom');
    mount();
    await say('ajoute la coque');
    expect(await screen.findByText(/momentanément indisponible/)).toBeTruthy();
    expect(screen.queryByText(/boom|500|gemini/i)).toBeNull();
    expect(screen.getAllByText('ajoute la coque')).toHaveLength(1);

    gemini.fallback = () => new Response('', { status: 500 });
    gemini.next(modelReply(textPart('Enfin ! C’est fait.')));
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Enfin ! C’est fait.')).toBeTruthy();
    expect(screen.queryByText(/momentanément indisponible/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
    expect(screen.getAllByText('ajoute la coque')).toHaveLength(1);
    // l'erreur n'a jamais été envoyée à l'IA comme si c'était une de ses réponses
    const last = copilotCalls().at(-1)!.body.messages as Array<{ role: string; text: string }>;
    expect(last).toEqual([{ role: 'user', text: 'ajoute la coque' }]);
  });

  it('assistant pas encore chargé / enregistrement impossible : message clair, aucun appel au serveur', async () => {
    ensureReady.mockResolvedValueOnce(null);
    mount();
    await say('salut');
    expect(await screen.findByText(/encore en train de se charger/)).toBeTruthy();
    ensureReady.mockResolvedValueOnce({ error: 'Je n’arrive pas à enregistrer tes dernières modifications (connexion ?). Réessaie dans un instant.' });
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText(/Je n’arrive pas à enregistrer/)).toBeTruthy();
    expect(copilotCalls()).toHaveLength(0);
  });

  it('pas de connexion internet : message en français', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith('/api/copilot')) throw new TypeError('Failed to fetch');
      return real(input, init);
    }) as any;
    mount();
    await say('salut');
    expect(await screen.findByText(/Pas de connexion internet/)).toBeTruthy();
    globalThis.fetch = real;
  });

  it('pendant une demande : on ne peut pas envoyer deux fois, et le bouton le montre', async () => {
    let release!: () => void;
    gemini.next(() => new Promise((resolve) => { release = () => resolve(modelReply(textPart('Voilà.'))); }));
    mount();
    await say('première');
    await screen.findByRole('status');
    fireEvent.change(box(), { target: { value: 'deuxième' } });
    expect((screen.getByRole('button', { name: 'Envoyer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(copilotCalls()).toHaveLength(1);
    await act(async () => { release(); });
    expect(await screen.findByText('Voilà.')).toBeTruthy();
    expect(box().value).toBe('deuxième'); // ce qu'il a commencé à écrire n'est pas perdu
  });
});

describe('historique de la discussion', () => {
  it('revient après un rechargement ; les cartes deviennent de simples rappels (plus d’« Annuler » périmé)', async () => {
    addNoteTurn();
    const first = mount();
    await say('ajoute la coque');
    await screen.findByText(/C’est ajouté/);
    first.unmount();

    mount();
    expect(screen.getByText('ajoute la coque')).toBeTruthy();
    expect(screen.getByText(/C’est ajouté ✅/)).toBeTruthy();
    const card = screen.getByTestId('copilot-action');
    expect(within(card).getByText('Fiche ajoutée à « Mes informations »')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: /Annuler/ })).toBeNull();
    expect(within(card).getByRole('button', { name: /Voir mes informations/ })).toBeTruthy();
    expect(screen.queryByText(/Salut 👋 Je suis ton IA/)).toBeNull();
  });

  it('« Nouvelle discussion » efface tout (écran et mémoire du navigateur)', async () => {
    gemini.next(modelReply(textPart('Bonjour !')));
    mount();
    await say('salut');
    await screen.findByText('Bonjour !');
    expect(localStorage.getItem(`jawebflow_copilot_v1_${UID}`)).toContain('Bonjour !');
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle discussion' }));
    expect(screen.getByText(/Salut 👋 Je suis ton IA/)).toBeTruthy();
    expect(screen.queryByText('Bonjour !')).toBeNull();
    expect(JSON.parse(localStorage.getItem(`jawebflow_copilot_v1_${UID}`) || '[]')).toEqual([]);
  });

  it('chaque marchand a SA discussion (rien n’est mélangé entre comptes)', async () => {
    gemini.next(modelReply(textPart('Bonjour Nour !')));
    const a = mount();
    await say('salut');
    await screen.findByText('Bonjour Nour !');
    a.unmount();
    mount({ userId: 'autre-marchand' });
    expect(screen.queryByText('Bonjour Nour !')).toBeNull();
    expect(screen.getByText(/Salut 👋 Je suis ton IA/)).toBeTruthy();
  });

  it('une mémoire du navigateur abîmée ne fait pas planter le chat', () => {
    localStorage.setItem(`jawebflow_copilot_v1_${UID}`, '{ pas du json');
    mount();
    expect(screen.getByText(/Salut 👋 Je suis ton IA/)).toBeTruthy();
    localStorage.setItem(`jawebflow_copilot_v1_${UID}`, JSON.stringify([{ role: 'robot', text: 'x' }, { role: 'user', text: 42 }, null]));
    cleanup();
    mount();
    expect(screen.getByText(/Salut 👋 Je suis ton IA/)).toBeTruthy();
  });
});

describe('petits détails qui comptent', () => {
  it('le texte de l’IA est nettoyé du markdown ; le texte du marchand reste tel quel', async () => {
    gemini.next(modelReply(textPart('**C’est fait** :\n- fiche 1\n* fiche 2\nAppelle `Mon IA`')));
    mount();
    await say('**gras** à moi');
    const bubble = await screen.findByText(/C’est fait :/);
    expect(bubble.textContent).toBe('C’est fait :\n• fiche 1\n• fiche 2\nAppelle Mon IA');
    expect(screen.getByText('**gras** à moi')).toBeTruthy();
  });

  it('Échap ferme la fenêtre ; le bouton « Fermer » aussi', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('« Voir » sur téléphone ferme aussi le chat (il cacherait l’écran) ; sur grand écran il reste ouvert', async () => {
    addNoteTurn();
    const onClose = vi.fn();
    mount({ onClose });
    await say('ajoute la coque');
    await screen.findByText(/C’est ajouté/);
    (window as any).innerWidth = 1280;
    fireEvent.click(screen.getByRole('button', { name: /Voir mes informations/ }));
    expect(onClose).not.toHaveBeenCalled();
    (window as any).innerWidth = 390;
    fireEvent.click(screen.getByRole('button', { name: /Voir mes informations/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    (window as any).innerWidth = 1024;
  });

  it('dictée vocale : le bouton n’existe que si le navigateur sait écouter ; le texte dicté arrive dans le champ ; FR / arabe', async () => {
    mount();
    expect(screen.queryByRole('button', { name: /Dicter mon message/ })).toBeNull(); // pas de bouton mort
    cleanup();

    const instances: any[] = [];
    (window as any).SpeechRecognition = class {
      lang = '';
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      onresult: any; onend: any; onerror: any;
      constructor() { instances.push(this); }
    };
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Dicter mon message/ }));
    expect(instances[0].lang).toBe('fr-FR');
    expect(instances[0].start).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Arrêter la dictée/ })).toBeTruthy();
    act(() => { instances[0].onresult({ results: [[{ transcript: 'ajoute la livraison gratuite' }]] }); instances[0].onend(); });
    expect(box().value).toBe('ajoute la livraison gratuite');

    fireEvent.click(screen.getByRole('button', { name: /Langue de la dictée : français/ }));
    fireEvent.click(screen.getByRole('button', { name: /Dicter mon message/ }));
    expect(instances[1].lang).toBe('ar-DZ');
  });
});
