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

describe('/api/chat — création de commande après confirmation', () => {
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
});
