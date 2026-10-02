// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IG_ID, USER_ID, seedAutomation, seedMerchant } from './helpers/fakes';
import { installUiBackend, type UiBackend } from './helpers/ui-backend';

// Le jeton de connexion du marchand (le vrai client Supabase n'est pas nécessaire ici).
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER_U1' } } }) } },
}));

import { InstagramAutomations } from '../src/components/InstagramAutomations';

let be: UiBackend;
let goToInstagram: ReturnType<typeof vi.fn>;

beforeEach(() => {
  be = installUiBackend();
  seedMerchant(be.supabase);
  be.meta.subscribedFields = ['messages', 'messaging_postbacks', 'comments'];
  be.meta.media = [
    { id: '17895695668004550', caption: 'Nouvelle collection ✨', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg', permalink: 'https://instagram.com/p/a', timestamp: '2026-09-20T10:00:00+0000', comments_count: 12 },
    { id: '17918195224117851', caption: 'Reel livraison', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/b.jpg', media_url: 'https://cdn/b.mp4', permalink: 'https://instagram.com/reel/b', timestamp: '2026-09-10T10:00:00+0000', comments_count: 3 },
  ];
  goToInstagram = vi.fn();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  be.restore();
});

const mount = (isAdmin = true) => render(<InstagramAutomations businessName="Boutique Nour" isAdmin={isAdmin} onGoToInstagram={goToInstagram as any} />);
const apiCalls = (method: string, path: string) => be.api.filter((c) => c.method === method && c.url.startsWith(path));

async function openTemplate(title: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: /Nouvelle automatisation/ }));
  fireEvent.click(await screen.findByRole('button', { name: title }));
  await screen.findByText(/Essaie en direct/);
}

describe('Automatisations — premier lancement', () => {
  it('base pas encore préparée : guide pas à pas, copie du SQL, puis reprise automatique', async () => {
    be.supabase.missing.add('ig_automations');
    be.supabase.missing.add('ig_automation_events');
    mount();
    expect(await screen.findByText(/Une dernière étape avant de commencer/)).toBeTruthy();
    // la liste et le bouton « Nouvelle automatisation » ne sont pas proposés tant que la base n'est pas prête
    expect(screen.queryByRole('button', { name: /Nouvelle automatisation/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Copier la mise à jour/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const copied = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    expect(copied).toContain('create table if not exists public.ig_automations');
    expect(copied).toContain('ig_automation_events');
    expect(await screen.findByText(/Copié ✓/)).toBeTruthy();

    const link = screen.getByRole('link', { name: /Ouvrir Supabase/ }) as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/supabase\.com\/dashboard/);
    expect(link.target).toBe('_blank');

    // le marchand exécute le SQL, puis clique « C'est fait »
    be.supabase.missing.clear();
    fireEvent.click(screen.getByRole('button', { name: /C’est fait, vérifier/ }));
    expect(await screen.findByText(/Tu n’as pas encore d’automatisation/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nouvelle automatisation/ })).toBeTruthy();
  });

  it('un CLIENT (pas le propriétaire) ne voit aucune consigne technique : un simple message et « Réessayer »', async () => {
    be.supabase.missing.add('ig_automations');
    be.supabase.missing.add('ig_automation_events');
    mount(false);
    expect(await screen.findByText(/Les automatisations sont en cours d’activation/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copier la mise à jour/ })).toBeNull();
    expect(screen.queryByText(/Supabase/)).toBeNull();
    be.supabase.missing.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Tu n’as pas encore d’automatisation/)).toBeTruthy();
  });

  it('liste vide : propose les 4 modèles', async () => {
    mount();
    expect(await screen.findByText(/Tu n’as pas encore d’automatisation/)).toBeTruthy();
    const grid = screen.getByLabelText('Modèles d’automatisation');
    expect(within(grid).getAllByRole('button')).toHaveLength(4);
    for (const label of [/Commentaire ➜ message privé/, /Réponse automatique à un mot-clé/, /Réponse à une story/, /Remerciement pour une mention/]) {
      expect(within(grid).getByRole('button', { name: label })).toBeTruthy();
    }
  });
});

describe('Automatisations — créer « commentaire → message privé »', () => {
  it('modèle → aperçu en direct → enregistrer et activer → la ligne est bien en base', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);

    // l'aperçu montre déjà ce que recevrait « sara_dz » en commentant « prix svp ? »
    expect((screen.getByLabelText('Texte de test') as HTMLInputElement).value).toBe('prix svp ?');
    expect(screen.getByTestId('sim-verdict').textContent).toMatch(/« prix » est reconnu/);
    expect(screen.getByTestId('preview-public-reply').textContent).toMatch(/@sara_dz/);
    expect(screen.getByTestId('preview-dm').textContent).toMatch(/Salut 👋/); // prénom inconnu sous un commentaire : pas de trou

    // un commentaire sans mot-clé : « rien ne se passe » + la raison
    fireEvent.change(screen.getByLabelText('Texte de test'), { target: { value: 'Superbe photo' } });
    expect(screen.getByTestId('preview-no-trigger')).toBeTruthy();
    expect(screen.getByTestId('sim-verdict').textContent).toMatch(/Aucun de tes mots-clés/);
    fireEvent.change(screen.getByLabelText('Texte de test'), { target: { value: 'PRIX ?' } });
    expect(screen.getByTestId('sim-verdict').textContent).toMatch(/reconnu/);

    // le marchand complète son message et ajoute un bouton avec un lien invalide, puis valide
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Salut {prenom} 👋 Voici notre catalogue complet.' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un bouton/ }));
    fireEvent.change(screen.getByLabelText('Texte du bouton 1'), { target: { value: 'Voir le catalogue' } });
    fireEvent.change(screen.getByLabelText('Lien du bouton 1'), { target: { value: 'pas un lien' } });
    expect(screen.getByText(/Ce lien n’est pas valide/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    expect(await screen.findByText(/Il manque quelque chose avant d’enregistrer/)).toBeTruthy();
    expect(screen.getByText(/lien du bouton « Voir le catalogue » n’est pas valide/)).toBeTruthy();
    expect(apiCalls('POST', '/api/instagram/automations')).toHaveLength(0); // rien n'est parti au serveur

    fireEvent.change(screen.getByLabelText('Lien du bouton 1'), { target: { value: 'ma-boutique.dz/catalogue' } });
    expect(screen.getByTestId('phone-preview').textContent).toContain('Voir le catalogue');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));

    // retour à la liste, avec la nouvelle automatisation ACTIVE
    expect(await screen.findByText(/est activée : le robot travaille pour toi/)).toBeTruthy();
    const list = await screen.findByLabelText('Tes automatisations');
    expect(within(list).getByText('Commentaire « prix » ➜ message privé')).toBeTruthy();
    expect(within(list).getByText(/Quand un commentaire contient/)).toBeTruthy();
    const toggle = within(list).getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    const row = be.supabase.rows('ig_automations')[0];
    expect(row).toMatchObject({ user_id: USER_ID, trigger_type: 'comment', enabled: true });
    expect(row.config.dm.buttons).toEqual([{ title: 'Voir le catalogue', url: 'https://ma-boutique.dz/catalogue' }]);
    expect(row.config.match.keywords).toEqual(['prix', 'info', 'lien', 'combien', 'سعر', 'ch7al']);
    expect(row.config.oncePerUser).toBe(true);
  });

  it('mots-clés : ajouter avec Entrée, suggestion en un clic, retirer, et le robot suit', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    // on retire tous les mots du modèle
    for (const k of ['prix', 'info', 'lien', 'combien', 'سعر', 'ch7al']) fireEvent.click(screen.getByRole('button', { name: `Retirer le mot « ${k} »` }));
    expect(screen.getByTestId('preview-no-trigger')).toBeTruthy();

    const input = screen.getByLabelText('Ajouter un mot-clé');
    fireEvent.change(input, { target: { value: 'Promo, Soldes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Retirer le mot « Promo »' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer le mot « Soldes »' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ livraison' })); // une « idée » cliquable
    expect(screen.getByRole('button', { name: 'Retirer le mot « livraison »' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Texte de test'), { target: { value: 'Y a des SOLDES ?' } });
    expect(screen.getByTestId('sim-verdict').textContent).toMatch(/Soldes/);
  });

  it('refuse d’enregistrer sans mot-clé, et le dit clairement', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    for (const k of ['prix', 'info', 'lien', 'combien', 'سعر', 'ch7al']) fireEvent.click(screen.getByRole('button', { name: `Retirer le mot « ${k} »` }));
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Salut' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    expect(await screen.findByText(/Ajoute au moins un mot-clé/)).toBeTruthy();
    expect(apiCalls('POST', '/api/instagram/automations')).toHaveLength(0);
    expect(be.supabase.rows('ig_automations')).toHaveLength(0);
  });

  it('variantes de réponse publique : ajouter, insérer une variable, supprimer', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    expect(screen.getByLabelText('Réponse publique, variante 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une variante/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une variante/ }));
    expect(screen.getByLabelText('Réponse publique, variante 5')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Ajouter une variante/ }) as HTMLButtonElement).disabled).toBe(true); // 5 maximum
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la variante 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la variante 4' }));
    expect(screen.queryByLabelText('Réponse publique, variante 4')).toBeNull();

    // insérer {entreprise} dans le message privé
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Merci' } });
    const chips = screen.getAllByRole('button', { name: '+ Mon entreprise' }); // un jeu de variables par zone de texte
    fireEvent.click(chips[chips.length - 1]); // celui du message privé
    expect((screen.getByLabelText('Message privé') as HTMLTextAreaElement).value).toContain('{entreprise}');
  });

  it('« suis mon compte » : l’aperçu montre la demande avec son bouton', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    expect(screen.queryByTestId('preview-gate')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Demander de suivre mon compte' }));
    expect(screen.getByTestId('preview-gate').textContent).toMatch(/C’est fait/);
    fireEvent.click(screen.getByRole('button', { name: /Personnaliser les messages de la demande/ }));
    expect(screen.getByDisplayValue('✅ C’est fait')).toBeTruthy();
  });

  it('on peut désactiver la réponse publique ou le message privé (pas les deux)', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    fireEvent.click(screen.getByRole('switch', { name: 'Activer la réponse publique' }));
    expect(screen.queryByLabelText('Réponse publique, variante 1')).toBeNull();
    expect(screen.getByText(/Pas de réponse publique/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Activer le message privé' }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    expect(await screen.findByText(/Active au moins une action/)).toBeTruthy();
  });
});

describe('Automatisations — choisir une publication', () => {
  it('le sélecteur affiche les vrais posts ; le choix est mémorisé avec sa miniature', async () => {
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Voici les infos' } });
    fireEvent.click(screen.getByRole('radio', { name: /Une publication précise/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Choisir une publication' });
    const posts = await within(dialog).findAllByRole('button', { name: /Choisir la publication/ });
    expect(posts).toHaveLength(2);
    expect(within(dialog).getByText('Nouvelle collection ✨')).toBeTruthy();
    expect(within(dialog).getByText('Reel')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Choisir la publication : Nouvelle collection/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('chosen-media').textContent).toMatch(/Nouvelle collection/);

    // sous une AUTRE publication, l'essai dit que ça ne se déclenche pas : la logique de ciblage est la même que celle du robot
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    await screen.findByLabelText('Tes automatisations');
    const cfg = be.supabase.rows('ig_automations')[0].config;
    expect(cfg.media).toMatchObject({ scope: 'one', id: '17895695668004550', permalink: 'https://instagram.com/p/a', thumbnail: 'https://cdn/a.jpg' });
    expect(screen.getByText(/sous la publication choisie/)).toBeTruthy();
  });

  it('si Instagram est injoignable, le dit en français et propose de réessayer', async () => {
    // seule la liste des publications échoue (le bilan de santé, lui, ne demande qu'1 publication)
    be.meta.failWhen((c) => c.path === '/me/media' && c.query.limit === '24', 400, { message: 'Error validating access token', code: 190 }, 1);
    mount();
    await openTemplate(/Commentaire ➜ message privé/);
    fireEvent.click(screen.getByRole('radio', { name: /Une publication précise/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/reconnecte ton compte/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Réessayer/ }));
    expect(await within(dialog).findAllByRole('button', { name: /Choisir la publication/ })).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Automatisations — gérer la liste', () => {
  const baseRow = () => seedAutomation(be.supabase, { enabled: false, name: 'Prix → DM', triggered_count: 12, public_reply_count: 11, dm_count: 10, error_count: 2, last_triggered_at: new Date(Date.now() - 3600_000).toISOString() });

  it('affiche le résumé en langage simple et les chiffres', async () => {
    baseRow();
    mount();
    const list = await screen.findByLabelText('Tes automatisations');
    expect(within(list).getByText('Prix → DM')).toBeTruthy();
    expect(within(list).getByText(/Quand un commentaire contient « prix » sous n’importe laquelle de tes publications/)).toBeTruthy();
    expect(within(list).getByText(/réponse publique \+ message privé/)).toBeTruthy();
    expect(within(list).getByText(/En pause/)).toBeTruthy();
    const stats = within(list).getByTestId(/^stats-/).textContent || '';
    expect(stats).toMatch(/12\s*déclenchements/);
    expect(stats).toMatch(/10\s*messages privés/);
    expect(stats).toMatch(/11\s*réponses publiques/);
    expect(stats).toMatch(/il y a 1 h/);
    expect(within(list).getByRole('button', { name: /2 erreurs — voir pourquoi/ })).toBeTruthy();
    expect(screen.getByTestId('automation-count').textContent).toMatch(/1 automatisation · 0 active/);
  });

  it('l’interrupteur active/désactive pour de vrai (et affiche le résultat)', async () => {
    const row = baseRow();
    mount();
    const toggle = await screen.findByRole('switch', { name: /Activer « Prix → DM »/ });
    fireEvent.click(toggle);
    await waitFor(() => expect(be.supabase.rows('ig_automations')[0].enabled).toBe(true));
    expect(await screen.findByText(/« Prix → DM » est activée/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Mettre en pause « Prix → DM »/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: /Mettre en pause « Prix → DM »/ }));
    await waitFor(() => expect(be.supabase.rows('ig_automations')[0].enabled).toBe(false));
    expect(await screen.findByText(/« Prix → DM » est en pause/)).toBeTruthy();
    expect(apiCalls('PATCH', '/api/instagram/automations')).toHaveLength(2);
    void row;
  });

  it('si le serveur refuse (automatisation incomplète), l’interrupteur revient en arrière avec l’explication', async () => {
    seedAutomation(be.supabase, { enabled: false, name: 'Cassée', config: { match: { mode: 'contains', keywords: [] }, dm: { enabled: true, text: '' }, publicReply: { enabled: false, variations: [] } } });
    mount();
    fireEvent.click(await screen.findByRole('switch', { name: /Activer « Cassée »/ }));
    expect(await screen.findByText(/Impossible d’activer/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Activer « Cassée »/ }).getAttribute('aria-checked')).toBe('false');
    expect(be.supabase.rows('ig_automations')[0].enabled).toBe(false);
  });

  it('modifier : le formulaire reprend les réglages, la sauvegarde met à jour la même ligne', async () => {
    baseRow();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier « Prix → DM »/ }));
    await screen.findByText(/Modifier l’automatisation/);
    expect((screen.getByLabelText('Nom de l’automatisation') as HTMLInputElement).value).toBe('Prix → DM');
    fireEvent.change(screen.getByLabelText('Nom de l’automatisation'), { target: { value: 'Prix v2' } });
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Nouveau message' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await screen.findByLabelText('Tes automatisations');
    expect(be.supabase.rows('ig_automations')).toHaveLength(1);
    expect(be.supabase.rows('ig_automations')[0]).toMatchObject({ name: 'Prix v2' });
    expect(be.supabase.rows('ig_automations')[0].config.dm.text).toBe('Nouveau message');
    expect(be.supabase.rows('ig_automations')[0].triggered_count).toBe(12); // les statistiques sont conservées
  });

  it('dupliquer crée une copie en pause', async () => {
    baseRow();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Dupliquer « Prix → DM »/ }));
    expect(await screen.findByText(/Copie créée/)).toBeTruthy();
    const rows = be.supabase.rows('ig_automations');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === 'Prix → DM (copie)')).toMatchObject({ enabled: false, triggered_count: 0 });
    expect(screen.getByTestId('automation-count').textContent).toMatch(/2 automatisations/);
  });

  it('supprimer demande confirmation ; « Annuler » ne supprime rien', async () => {
    baseRow();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer « Prix → DM »/ }));
    const confirm = await screen.findByRole('group', { name: 'Confirmer la suppression' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    expect(be.supabase.rows('ig_automations')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Supprimer « Prix → DM »/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oui, supprimer' }));
    expect(await screen.findByText(/a été supprimée/)).toBeTruthy();
    expect(be.supabase.rows('ig_automations')).toHaveLength(0);
    expect(await screen.findByText(/Tu n’as pas encore d’automatisation/)).toBeTruthy();
  });
});

describe('Automatisations — mot-clé en message privé, stories', () => {
  it('« mot-clé » : pas de « n’importe quel message », pas de réponse publique ; enregistrement OK', async () => {
    mount();
    await openTemplate(/Réponse automatique à un mot-clé/);
    expect(screen.queryByRole('radio', { name: 'Tout commentaire' })).toBeNull();
    expect(screen.queryByLabelText('Réponse publique, variante 1')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Demander de suivre mon compte' })).toBeNull();
    // l'essai se comporte comme un message privé : le prénom est connu
    expect(screen.getByLabelText('Prénom de test')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message privé'), { target: { value: 'Bonjour {prenom} ! Livraison en 48h.' } });
    expect(screen.getByTestId('preview-dm').textContent).toMatch(/Bonjour Sara ! Livraison en 48h\./);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    await screen.findByLabelText('Tes automatisations');
    expect(be.supabase.rows('ig_automations')[0]).toMatchObject({ trigger_type: 'dm_keyword', enabled: true });
  });

  it('« mention en story » : seulement un message de remerciement', async () => {
    mount();
    await openTemplate(/Remerciement pour une mention/);
    expect(screen.queryByLabelText('Ajouter un mot-clé')).toBeNull();
    expect(screen.getByText(/t’a mentionné dans sa story/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et activer/ }));
    await screen.findByLabelText('Tes automatisations');
    expect(be.supabase.rows('ig_automations')[0]).toMatchObject({ trigger_type: 'story_mention', enabled: true });
  });

  it('« réponse à une story » : l’avertissement apparaît pour « toute réponse »', async () => {
    mount();
    await openTemplate(/Réponse à une story/);
    expect(screen.getByText(/remplace la réponse de l’IA pour TOUTES les réponses/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Contient un mot' }));
    expect(screen.queryByText(/remplace la réponse de l’IA/)).toBeNull();
  });
});

describe('Automatisations — historique', () => {
  it('montre qui a déclenché quoi, les réussites et les échecs expliqués', async () => {
    const a = seedAutomation(be.supabase);
    be.supabase.seed('ig_automation_events', [
      { id: 'e1', user_id: USER_ID, automation_id: a.id, automation_name: 'Prix → DM', trigger_type: 'comment', contact_id: 'X1', contact_username: 'sara_dz', input_text: 'Prix svp ?', public_reply_status: 'sent', dm_status: 'sent', outcome: 'done', created_at: new Date(Date.now() - 120_000).toISOString() },
      { id: 'e2', user_id: USER_ID, automation_id: a.id, automation_name: 'Prix → DM', trigger_type: 'comment', contact_id: 'X2', contact_username: 'yasmine', input_text: 'info', public_reply_status: 'sent', dm_status: 'failed', outcome: 'partial', error: 'Message privé : Trop tard : Instagram n’autorise le message privé que dans les 7 jours qui suivent le commentaire.', created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
      { id: 'e3', user_id: USER_ID, automation_id: a.id, automation_name: 'Prix → DM', trigger_type: 'comment', contact_id: 'X3', contact_username: 'karim', input_text: 'prix', dm_status: 'awaiting_follow', gate_state: 'awaiting', outcome: 'done', created_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Historique$/ }));
    const list = await screen.findByLabelText('Historique des déclenchements');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('@sara_dz')).toBeTruthy();
    expect(within(rows[0]).getByText('Réussi')).toBeTruthy();
    expect(within(rows[0]).getByText(/il y a 2 min/)).toBeTruthy();
    expect(within(rows[1]).getByText('Partiel')).toBeTruthy();
    expect(within(rows[1]).getByText(/Trop tard/)).toBeTruthy();
    expect(within(rows[2]).getByText(/en attente de l’abonnement/)).toBeTruthy();

    // filtrer par automatisation puis revenir
    fireEvent.change(screen.getByLabelText('Filtrer par automatisation'), { target: { value: a.id } });
    await waitFor(() => expect(apiCalls('GET', '/api/instagram/automations?view=events').some((c) => c.url.includes(`automationId=${a.id}`))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(await screen.findByLabelText('Tes automatisations')).toBeTruthy();
  });

  it('historique vide : explication rassurante', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Historique$/ }));
    expect(await screen.findByText(/Rien pour l’instant/)).toBeTruthy();
  });

  it('depuis une carte : « n erreurs — voir pourquoi » ouvre l’historique de cette automatisation', async () => {
    const a = seedAutomation(be.supabase, { triggered_count: 3, error_count: 1 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /1 erreur — voir pourquoi/ }));
    await screen.findByText('Historique');
    await waitFor(() => expect(apiCalls('GET', '/api/instagram/automations?view=events').some((c) => c.url.includes(`automationId=${a.id}`))).toBe(true));
    expect((screen.getByLabelText('Filtrer par automatisation') as HTMLSelectElement).value).toBe(a.id);
  });
});

describe('Automatisations — « est-ce que ça marche ? »', () => {
  it('tout va bien : bandeau vert avec le @compte', async () => {
    be.supabase.seed('ig_automation_state', [{ user_id: USER_ID, last_comment_at: new Date(Date.now() - 600_000).toISOString() }]);
    mount();
    expect((await screen.findByTestId('health-title')).textContent).toBe('Instagram est bien branché (@boutique_nour)');
    expect(screen.getByText(/Dernier commentaire reçu il y a 10 min/)).toBeTruthy();
  });

  it('autorisation « commentaires » manquante → bouton pour reconnecter, qui renvoie vers l’onglet Instagram', async () => {
    be.meta.commentsPermission = false;
    mount();
    expect((await screen.findByTestId('health-title')).textContent).toMatch(/1 point à régler/);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnecter Instagram' }));
    expect(goToInstagram).toHaveBeenCalledWith('comments');
  });

  it('notifications manquantes → « Réparer » abonne le compte puis rafraîchit le bilan', async () => {
    be.meta.subscribedFields = ['messages'];
    mount();
    expect((await screen.findByTestId('health-title')).textContent).toMatch(/à régler/);
    fireEvent.click(await screen.findByRole('button', { name: 'Réparer' }));
    expect(await screen.findByText(/Parfait : Instagram enverra désormais les commentaires/)).toBeTruthy();
    expect(be.meta.subscribedFields).toEqual(['messages', 'messaging_postbacks', 'comments']);
    await waitFor(() => expect(screen.getByTestId('health-title').textContent).toMatch(/Instagram est bien branché/));
  });

  it('compte non connecté → bouton qui renvoie vers la connexion', async () => {
    be.supabase.tables.instagram_integrations = [];
    mount();
    expect((await screen.findByTestId('health-title')).textContent).toBe('Instagram n’est pas encore connecté');
    fireEvent.click(await screen.findByRole('button', { name: 'Connecter Instagram' }));
    expect(goToInstagram).toHaveBeenCalledWith('connect');
  });

  it('« Vérifier » relance vraiment les contrôles', async () => {
    mount();
    await screen.findByTestId('health-title');
    const before = apiCalls('GET', '/api/instagram/diagnostics').length;
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier à nouveau la connexion' }));
    await waitFor(() => expect(apiCalls('GET', '/api/instagram/diagnostics').length).toBe(before + 1));
  });
});

describe('Automatisations — robustesse', () => {
  it('serveur indisponible : message clair + « Réessayer » qui fonctionne', async () => {
    let failing = true;
    be.stub('/api/instagram/automations', () => (failing ? new Response('oups', { status: 500 }) : new Response(JSON.stringify({ setupRequired: false, automations: [] }), { status: 200 })));
    mount();
    expect(await screen.findByText(/Une erreur est survenue/)).toBeTruthy();
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Tu n’as pas encore d’automatisation/)).toBeTruthy();
  });

  it('le jeton Instagram n’apparaît jamais dans l’interface', async () => {
    seedAutomation(be.supabase);
    const { container } = mount();
    await screen.findByLabelText('Tes automatisations');
    expect(container.innerHTML).not.toContain('TOKEN1');
    expect(JSON.stringify(be.api)).not.toContain('TOKEN1');
    void IG_ID;
  });
});
