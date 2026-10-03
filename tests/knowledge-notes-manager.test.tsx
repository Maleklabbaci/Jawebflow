// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'BEARER' } } }) } },
}));

import { KnowledgeNotesManager } from '../src/components/KnowledgeNotesManager';

const originalFetch = globalThis.fetch;
const onUpdateNotes = vi.fn();

beforeEach(() => {
  onUpdateNotes.mockReset();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/knowledge/entries')) {
      return new Response(JSON.stringify({ entries: [
        { id: 'manual-1', title: 'Prestations de conseil', content: 'Accompagnement sur devis.', category: 'services', source: 'manual', enabled: true, status: 'active' },
        { id: 'learned-1', title: 'Délai de réponse', content: 'Les demandes sont traitées sous deux jours.', category: 'faq', source: 'learned', enabled: false, status: 'pending_review' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/knowledge/documents')) {
      return new Response(JSON.stringify({ documents: [
        { id: 'scan-1', title: 'Horaires et adresse', excerpt: 'Ouvert du lundi au vendredi. Contact : accueil@example.test', sourceUrl: 'https://example.test/contact' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('Base de connaissances unifiée', () => {
  it('regroupe les documents scannés et les fiches, montre la provenance et fait valider les apprentissages', async () => {
    render(
      <KnowledgeNotesManager
        notes={[]}
        onUpdateNotes={onUpdateNotes}
        onScanClick={vi.fn()}
        assistantId="assistant-123456"
      />,
    );

    const serviceGroup = await screen.findByRole('region', { name: 'Groupe Produits & services' });
    expect(within(serviceGroup).getByText('Prestations de conseil')).toBeTruthy();
    expect(within(serviceGroup).getByText('Manuel')).toBeTruthy();

    const contactGroup = screen.getByRole('region', { name: 'Groupe Infos pratiques' });
    expect(within(contactGroup).getByText('Horaires et adresse')).toBeTruthy();
    expect(within(contactGroup).getByText('Site scanné')).toBeTruthy();
    expect(within(contactGroup).getByRole('link', { name: 'Ouvrir la page source' }).getAttribute('href')).toBe('https://example.test/contact');

    const faqGroup = screen.getByRole('region', { name: 'Groupe Questions fréquentes & garanties' });
    expect(within(faqGroup).getByText('Délai de réponse')).toBeTruthy();
    expect(within(faqGroup).getByText('À valider')).toBeTruthy();
    expect(within(faqGroup).getByText('Appris · à valider')).toBeTruthy();

    fireEvent.click(within(faqGroup).getByRole('button', { name: 'Valider' }));
    expect(onUpdateNotes).toHaveBeenCalledTimes(1);
    const updated = onUpdateNotes.mock.calls[0][0];
    expect(updated.find((note: any) => note.id === 'learned-1')).toMatchObject({
      enabled: true,
      approvalStatus: 'approved',
      status: 'active',
    });
    expect(screen.queryByText('À valider')).toBeNull();
  });

  it('conserve toujours les cinq groupes génériques dans les filtres', async () => {
    render(<KnowledgeNotesManager notes={[]} onUpdateNotes={vi.fn()} onScanClick={vi.fn()} assistantId="assistant-123456" />);
    await screen.findByRole('button', { name: /Prix & promos \(0\)/ });
    for (const label of [
      /Produits & services/,
      /Prix & promos/,
      /Livraison & paiement/,
      /Infos pratiques/,
      /Questions fréquentes & garanties/,
    ]) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
  });
});
