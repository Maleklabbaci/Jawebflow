import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/chat.js';
import { FakeGemini, modelReply, textPart } from './helpers/fake-gemini';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => fx.restore());

async function send(message: string, messageId: string, history: Array<{ sender: string; text: string }> = []) {
  return onRequestPost({
    env: { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' },
    request: new Request('https://jawebflow.test/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: 'asst1', sessionId: 'session-order-test', messageId, message, history }),
    }),
  } as any);
}

describe('/api/chat — création et suivi des commandes', () => {
  it('garde une intention d’achat comme brouillon, puis crée la commande après « oui »', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(
      modelReply(textPart('Confirmez-vous cette commande ?')),
      modelReply(textPart('Votre demande attend maintenant la validation de la boutique.')),
    );

    const first = await send('Je veux acheter cette veste', 'message-achat-1');
    expect(first.status).toBe(200);
    const prospectId = 'asst1_web_session-order-test';
    let prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders || []).toHaveLength(0);
    expect(prospect?.data.orderDraft?.status).toBe('awaiting_confirmation');

    const second = await send('oui', 'message-confirmation-2', [
      { sender: 'user', text: 'Je veux acheter cette veste' },
      { sender: 'bot', text: 'Confirmez-vous cette commande ?' },
    ]);
    expect(second.status).toBe(200);
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders).toHaveLength(1);
    expect(prospect?.data.orders[0]).toMatchObject({
      id: 'web_message-confirmation-2', channel: 'Site web',
      status: 'pending_merchant_confirmation', totalAmount: null,
    });
    expect(prospect?.data.orderDraft).toBeNull();
    expect(gemini.calls[1].body.generationConfig.maxOutputTokens).toBe(180);
    expect(JSON.stringify(gemini.calls[1].body.contents)).toContain(prospect.data.orders[0].reference);
  });

  it('demande le motif, propose une alternative et annule seulement après la confirmation du même client', async () => {
    const prospectId = 'asst1_web_session-order-test';
    fx.supabase.seed('prospects', [{
      id: prospectId,
      assistant_id: 'asst1',
      data: {
        sessionId: 'session-order-test',
        orders: [{ id: 'order-cancel', reference: 'JF-CANCEL1', status: 'confirmed', summary: 'Veste noire', createdAt: '2026-10-01T10:00:00.000Z' }],
      },
    }]);

    const first = await send('Je veux annuler ma commande', 'cancel-1');
    expect((await first.json() as any).text).toContain('Qu’est-ce qui vous pousse');
    let prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].status).toBe('confirmed');
    expect(prospect?.data.orderChangeDraft.status).toBe('awaiting_reason');

    const reason = await send('Le délai de livraison est trop long', 'cancel-2');
    expect((await reason.json() as any).text).toContain('Souhaitez-vous toujours annuler');
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].status).toBe('confirmed');
    expect(prospect?.data.orderChangeDraft).toMatchObject({ status: 'awaiting_confirmation', reason: 'Le délai de livraison est trop long' });

    const confirmation = await send('Oui, annule la commande', 'cancel-3');
    expect((await confirmation.json() as any).text).toContain('est annulée');
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0]).toMatchObject({ status: 'cancelled', cancellationReason: 'Le délai de livraison est trop long' });
    expect(prospect?.data.orderChangeDraft).toBeNull();
  });

  it('enregistre une modification de détail uniquement après le « oui » du client', async () => {
    const prospectId = 'asst1_web_session-order-test';
    fx.supabase.seed('prospects', [{
      id: prospectId,
      assistant_id: 'asst1',
      data: {
        sessionId: 'session-order-test',
        orders: [{ id: 'order-edit', reference: 'JF-EDIT001', status: 'confirmed', summary: 'Veste noire, taille S', city: 'Blida', createdAt: '2026-10-01T10:00:00.000Z' }],
      },
    }]);

    const proposal = await send('Je veux changer la ville de livraison à Oran', 'edit-1');
    expect((await proposal.json() as any).text).toContain('Confirmez-vous');
    let prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].city).toBe('Blida');
    expect(prospect?.data.orderChangeDraft.status).toBe('awaiting_confirmation');

    const confirmation = await send('oui', 'edit-2');
    expect((await confirmation.json() as any).text).toContain('modification de la commande');
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0]).toMatchObject({
      status: 'confirmed', city: 'Oran', updatedAt: expect.any(String),
      changeHistory: [{ type: 'customer_modification', details: 'Je veux changer la ville de livraison à Oran' }],
    });
    expect(prospect?.data.orderChangeDraft).toBeNull();
  });
});
