// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ID, seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: '11111111-1111-4111-8111-111111111111', email: 'nour@test.dz' } }),
}));

import { InstagramIntegration } from '../src/components/InstagramIntegration';

let be: UiBackend;
let openAutomations: ReturnType<typeof vi.fn>;
let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  be = installUiBackend();
  seedMerchant(be.supabase, { webhook_status: 'active', respond_to_stories: true });
  be.meta.subscribedFields = ['messages', 'messaging_postbacks', 'comments'];
  openAutomations = vi.fn();
  openSpy = vi.fn().mockReturnValue({ closed: false });
  (window as any).open = openSpy;
});
afterEach(() => {
  cleanup();
  be.restore();
});

const mount = (props: Record<string, unknown> = {}) =>
  render(<InstagramIntegration assistantId="asst1" businessName="Boutique Nour" websiteUrl="https://nour.dz" onGoToAutomations={openAutomations as any} {...props} />);

const integrationPosts = () => be.api.filter((c) => c.method === 'POST' && c.url === '/api/instagram/integration');

describe('onglet Instagram — compte connecté', () => {
  it('affiche le vrai compte, un seul bouton « Reconnecter », plus de faux boutons', async () => {
    mount();
    expect(await screen.findByText(/Compte Connecté : @boutique_nour/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reconnecter/ })).toBeTruthy();
    expect(screen.queryByText(/Modifier @pseudo/)).toBeNull();
    expect(screen.queryByText(/Re-synchroniser/)).toBeNull();
    expect(screen.getByText(/Connexion confirmée/)).toBeTruthy();
  });

  it('l’interrupteur « IA » est enregistré tout de suite, et dit ce qui continue de marcher', async () => {
    mount();
    const sw = await screen.findByRole('switch', { name: /Répondre aux messages privés avec l'IA/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    await waitFor(() => expect(be.supabase.rows('instagram_integrations')[0].auto_reply_enabled).toBe(false));
    expect(integrationPosts().at(-1)!.body).toEqual({ autoReplyEnabled: false });
    expect(await screen.findByText(/Les réponses de l’IA sont en pause\. Tes automatisations par mots-clés continuent/)).toBeTruthy();
    expect(screen.getByText('IA en pause')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /Répondre aux messages privés avec l'IA/ }));
    await waitFor(() => expect(be.supabase.rows('instagram_integrations')[0].auto_reply_enabled).toBe(true));
  });

  it('l’interrupteur « stories » agit VRAIMENT (il ne faisait rien avant)', async () => {
    mount();
    fireEvent.click(await screen.findByRole('switch', { name: /Répondre aux réponses à mes stories/ }));
    await waitFor(() => expect(be.supabase.rows('instagram_integrations')[0].respond_to_stories).toBe(false));
    expect(await screen.findByText(/ne répondra plus aux réponses à tes stories/)).toBeTruthy();
  });

  it('si le serveur refuse, l’interrupteur revient en arrière et le dit', async () => {
    mount();
    const sw = await screen.findByRole('switch', { name: /Répondre aux messages privés avec l'IA/ });
    be.stub('/api/instagram/integration', (init) =>
      init.method === 'POST' ? new Response(JSON.stringify({ error: 'boom' }), { status: 500 }) : new Response(JSON.stringify({ data: { connected: true, instagramUsername: '@boutique_nour', autoReplyEnabled: true, respondToStories: true, webhookStatus: 'active' } })),
    );
    fireEvent.click(sw);
    expect(await screen.findByText(/n’a pas pu être enregistré/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Répondre aux messages privés avec l'IA/ }).getAttribute('aria-checked')).toBe('true');
    expect(be.supabase.rows('instagram_integrations')[0].auto_reply_enabled).toBe(true);
  });

  it('le message d’accueil s’enregistre seul (sans renvoyer l’ancien jeton Meta)', async () => {
    mount();
    const input = (await screen.findByLabelText('Message d\'accueil')) as HTMLInputElement;
    expect(input.value).toBe(''); // vide par défaut : salutation automatique dans la langue choisie
    fireEvent.change(input, { target: { value: 'Ahlan ! Ici {entreprise} 💜' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    expect(await screen.findByText(/Tes réglages Instagram sont enregistrés/)).toBeTruthy();
    const body = integrationPosts().at(-1)!.body;
    expect(body).toEqual({ autoReplyEnabled: true, respondToStories: true, assistantTone: 'professionnel', customGreeting: 'Ahlan ! Ici {entreprise} 💜' });
    expect(JSON.stringify(body)).not.toContain('TOKEN1');
    expect(be.supabase.rows('instagram_integrations')[0].custom_greeting).toBe('Ahlan ! Ici {entreprise} 💜');
    expect(be.supabase.rows('instagram_integrations')[0].access_token).toBe('TOKEN1'); // le jeton n'a pas été touché
  });

  it('l’ancien texte d’accueil pré-rempli (jamais choisi par le marchand) n’est plus affiché comme s’il l’était', async () => {
    be.supabase.tables.instagram_integrations[0].custom_greeting = 'Salam 👋 Bienvenue sur notre page Instagram ! Comment puis-je vous aider ?';
    mount();
    const input = (await screen.findByLabelText('Message d\'accueil')) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('si l’enregistrement échoue, le dit (au lieu d’afficher un faux « enregistré »)', async () => {
    mount();
    const input = (await screen.findByLabelText('Message d\'accueil')) as HTMLInputElement;
    be.stub('/api/instagram/integration', (init) =>
      init.method === 'POST' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ data: { connected: true, instagramUsername: '@boutique_nour', webhookStatus: 'active' } })),
    );
    fireEvent.change(input, { target: { value: 'Salut' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    expect(await screen.findByText(/L’enregistrement a échoué/)).toBeTruthy();
    expect(screen.queryByText(/réglages Instagram sont enregistrés/)).toBeNull();
  });
});

describe('onglet Instagram — commentaires', () => {
  it('« Ouvrir les automatisations » mène à l’onglet des automatisations', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir les automatisations' }));
    expect(openAutomations).toHaveBeenCalledTimes(1);
  });

  it('« Autoriser les commentaires » ouvre Instagram avec la permission en plus — la connexion normale reste inchangée', async () => {
    const popup = { closed: false };
    openSpy.mockReturnValue(popup);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Autoriser les commentaires' }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = new URL(openSpy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments');

    // Le marchand ferme la fenêtre Instagram sans valider : le bouton se débloque (il ne reste pas bloqué sur « en cours »).
    popup.closed = true;
    expect(await screen.findByText(/Connexion annulée : rien n’a été modifié/, {}, { timeout: 4000 })).toBeTruthy();
    expect((screen.getByRole('button', { name: /Reconnecter/ }) as HTMLButtonElement).disabled).toBe(false);

    openSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Reconnecter/ }));
    const normal = new URL(openSpy.mock.calls[0][0] as string);
    expect(normal.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages');
  });

  it('après avoir autorisé les commentaires, « Reconnecter » ne les fait pas disparaître', async () => {
    be.stub('/api/instagram/oauth/exchange', () =>
      new Response(JSON.stringify({
        success: true, accessToken: 'NEW', instagramUserId: '17841400000000001', instagramUsername: '@boutique_nour', subscribed: true, serverSaved: true,
        permissions: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'],
      }), { status: 200 }),
    );
    mount();
    await screen.findByText(/Compte Connecté/);
    // Instagram renvoie le code d'autorisation : l'échange confirme que les commentaires ont été accordés
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'INSTAGRAM_AUTH_SUCCESS', code: 'CODE_COMMENTS' } }));
    await waitFor(() => expect(localStorage.getItem('jawebflow_ig_comments_ok_11111111-1111-4111-8111-111111111111')).toBe('1'));
    await waitFor(() => expect((screen.getByRole('button', { name: /Reconnecter/ }) as HTMLButtonElement).disabled).toBe(false));
    openSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Reconnecter/ }));
    expect(new URL(openSpy.mock.calls[0][0] as string).searchParams.get('scope')).toContain('instagram_business_manage_comments');
  });

  it('venu des Automatisations : la carte est mise en avant', async () => {
    mount({ highlightCommentsAuth: true });
    const card = await waitFor(() => {
      const el = document.getElementById('instagram-comments-card');
      if (!el) throw new Error('carte absente');
      return el;
    });
    expect(card.className).toMatch(/ring-2/);
  });

  it('plus aucun interrupteur « commentaires » factice', async () => {
    mount();
    await screen.findByText(/Compte Connecté/);
    expect(screen.queryByText(/Auto-DM lors d'un commentaire/)).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(2); // IA + stories : les deux agissent vraiment
  });
});

describe('onglet Instagram — pas de faux affichages', () => {
  it('sans compte connecté : pas de panneau « connecté », pas de faux @telyaagency', async () => {
    be.supabase.tables.instagram_integrations = [];
    mount();
    expect(await screen.findByRole('button', { name: /Connecter mon Instagram/ })).toBeTruthy();
    expect(screen.queryByText(/Connexion confirmée/)).toBeNull();
    expect(screen.queryByText(/telyaagency/)).toBeNull();
    expect(screen.queryByText(/État de la connexion Instagram/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Autoriser les commentaires' })).toBeNull();
  });

  it('connexion incomplète : « Terminer la connexion » répare vraiment (jeton lu côté serveur)', async () => {
    be.supabase.tables.instagram_integrations[0].webhook_status = 'error';
    be.meta.subscribedFields = ['messages'];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Terminer la connexion/ }));
    expect(await screen.findByText(/Instagram enverra désormais les commentaires/)).toBeTruthy();
    const call = be.api.find((c) => c.url === '/api/instagram/diagnostics' && c.method === 'POST');
    expect(call?.body).toEqual({ action: 'subscribe' });
    expect(JSON.stringify(be.api)).not.toContain('TOKEN1'); // le jeton ne voyage plus du navigateur vers le serveur
    expect(be.supabase.rows('instagram_integrations')[0].webhook_status).toBe('active');
  });
});

describe('onglet Instagram — simulateur de DM', () => {
  const send = async (text: string) => {
    // Le simulateur est à l'étape « Test » du parcours.
    const stepBtn = await waitFor(() => {
      const el = document.querySelector('[data-step="test"]') as HTMLButtonElement | null;
      if (!el || el.disabled) throw new Error('étape Test pas encore accessible');
      return el;
    });
    fireEvent.click(stepBtn);
    const box = await screen.findByPlaceholderText('Écrire un message Instagram...');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
  };

  it('pose la question à l’assistant et affiche SA réponse', async () => {
    be.stub('/api/chat', () => new Response(JSON.stringify({ text: 'La livraison à Blida coûte 400 DA.' }), { status: 200 }));
    mount();
    await send('Combien coûte la livraison ?');
    expect(await screen.findByText('La livraison à Blida coûte 400 DA.')).toBeTruthy();
    const chat = be.api.find((c) => c.url === '/api/chat');
    expect(chat?.body).toMatchObject({ assistantId: 'asst1', message: 'Combien coûte la livraison ?', businessName: 'Boutique Nour' });
  });

  it('si l’assistant est injoignable : message honnête, JAMAIS une réponse inventée', async () => {
    be.stub('/api/chat', () => new Response('{}', { status: 500 }));
    const { container } = mount();
    await send('Vous livrez où ?');
    expect(await screen.findByText(/Je n’ai pas pu joindre l’assistant/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/58 wilayas|BaridiMob|Telya/);
  });

  it('sans assistant configuré : explique quoi faire', async () => {
    mount({ assistantId: '' });
    await send('Bonjour');
    expect(await screen.findByText(/Configure d’abord ton assistant/)).toBeTruthy();
    expect(be.api.some((c) => c.url === '/api/chat')).toBe(false);
  });
});

void USER_ID;
