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
    // Pas de nom dans la conversation : la demande est créée, mais le bot garde
    // un brouillon « awaiting_name » et demande le nom au client.
    expect(prospect?.data.orderDraft).toMatchObject({ status: 'awaiting_name', orderId: prospect.data.orders[0].id });
    expect(gemini.calls[1].body.generationConfig.maxOutputTokens).toBe(180);
    expect(JSON.stringify(gemini.calls[1].body.contents)).toContain(prospect.data.orders[0].reference);

    const third = await send('Karim Haddad', 'message-nom-3', [
      { sender: 'user', text: 'Je veux acheter cette veste' },
      { sender: 'bot', text: 'Confirmez-vous cette commande ? C’est à quel nom ?' },
    ]);
    expect(third.status).toBe(200);
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].customerName).toBe('Karim Haddad');
    expect(prospect?.data.orderDraft).toBeNull();
    expect(prospect?.data.name).toBe('Karim Haddad');
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
    // « sur » et non « de » : la même phrase doit rester correcte pour
    // « la modification sur le rendez-vous JF-… » ou « sur la visite JF-… ».
    expect((await confirmation.json() as any).text).toContain('modification sur la commande');
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0]).toMatchObject({
      status: 'confirmed', city: 'Oran', updatedAt: expect.any(String),
      changeHistory: [{ type: 'customer_modification', details: 'Je veux changer la ville de livraison à Oran' }],
    });
    expect(prospect?.data.orderChangeDraft).toBeNull();
  });
});

describe('/api/chat — politesse et nature de la validation', () => {
  it('ne renvoie JAMAIS le message de bienvenue en pleine conversation', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;

    const first = await send('Salam', 'politesse-1');
    const firstText = (await first.json() as any).text as string;
    expect(firstText).toMatch(/Marhba|Bienvenue/);
    expect(gemini.calls).toHaveLength(0); // politesse = réponse locale gratuite

    const thanks = await send('merci', 'politesse-2', [
      { sender: 'user', text: 'Salam' },
      { sender: 'bot', text: firstText },
    ]);
    const thanksText = (await thanks.json() as any).text as string;
    expect(thanksText).toMatch(/Avec plaisir/);
    expect(thanksText).not.toContain('Marhba');
    expect(thanksText).not.toContain('Bienvenue');
    expect(gemini.calls).toHaveLength(0);

    // Un « ok » en pleine conversation répond à la question précédente : l'IA tranche.
    gemini.next(modelReply(textPart('Parfait, je vous envoie le lien 🙂')));
    const ok = await send('ok', 'politesse-3', [
      { sender: 'bot', text: 'Je vous envoie le lien du produit ?' },
    ]);
    expect((await ok.json() as any).text).toBe('Parfait, je vous envoie le lien 🙂');
    expect(gemini.calls).toHaveLength(1);
  });

  it('deux salutations de suite (widget sans historique) : une seule « Bienvenue »', async () => {
    const first = await send('Salam', 'politesse-4');
    expect((await first.json() as any).text).toMatch(/Marhba|Bienvenue/);

    // Le widget n'envoie pas toujours l'historique : la fiche client sert de
    // mémoire, sinon le deuxième « salam » renvoyait encore la bienvenue.
    const second = await send('salam', 'politesse-5');
    const text = (await second.json() as any).text as string;
    expect(text).not.toMatch(/Marhba|Bienvenue/);
    expect(text).not.toContain('Kifach n9der n3awnek');
  });

  it('« oui je valide la visite » crée une VISITE, pas une commande', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(modelReply(textPart('C’est noté, votre demande de visite est transmise à l’équipe 🙂')));

    const res = await send('oui je valide la visite', 'visite-1', [
      { sender: 'user', text: 'L’appartement de Hydra est disponible ?' },
      { sender: 'bot', text: 'Oui. Souhaitez-vous planifier une visite ?' },
    ]);
    expect(res.status).toBe(200);

    const prospect = fx.supabase.rows('prospects').find((row) => row.id === 'asst1_web_session-order-test');
    expect(prospect?.data.orders).toHaveLength(1);
    expect(prospect?.data.orders[0]).toMatchObject({ kind: 'visit', kindLabel: 'Visite', channel: 'Site web' });
    const prompt = JSON.stringify(gemini.calls[0].body.contents);
    expect(prompt).toContain('Demande de visite enregistrée');
    expect(prompt).not.toContain('Demande de commande enregistrée');
  });

  it('le brouillon garde la nature de la demande posée par le bot', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(modelReply(textPart('Jeudi 15 h, ça vous va ? Confirmez-vous ce rendez-vous ?')));

    await send('Je voudrais un rendez-vous', 'rdv-1');
    let prospect = fx.supabase.rows('prospects').find((row) => row.id === 'asst1_web_session-order-test');
    expect(prospect?.data.orderDraft).toMatchObject({ status: 'awaiting_confirmation', kind: 'appointment' });

    gemini.next(modelReply(textPart('C’est enregistré 🙂')));
    await send('oui', 'rdv-2', [{ sender: 'bot', text: 'Jeudi 15 h, ça vous va ? Confirmez-vous ce rendez-vous ?' }]);
    prospect = fx.supabase.rows('prospects').find((row) => row.id === 'asst1_web_session-order-test');
    expect(prospect?.data.orders[0]).toMatchObject({ kind: 'appointment', kindLabel: 'Rendez-vous' });
    // Sans nom, le brouillon passe en « awaiting_name » au lieu de disparaître.
    expect(prospect?.data.orderDraft).toMatchObject({ status: 'awaiting_name', orderId: prospect.data.orders[0].id });

    gemini.next(modelReply(textPart('Merci Karim, c’est noté !')));
    await send('Karim Benali', 'rdv-nom-3', [{ sender: 'bot', text: 'C’est à quel nom ?' }]);
    prospect = fx.supabase.rows('prospects').find((row) => row.id === 'asst1_web_session-order-test');
    expect(prospect?.data.orders[0].customerName).toBe('Karim Benali');
    expect(prospect?.data.orderDraft).toBeNull();
  });
});

describe('garde-fou anti « commande » depuis le small talk', () => {
  it('un « oui » dans une conversation de salutations ne crée aucune commande', async () => {
    fx.supabase.seed('prospects', [{
      id: 'asst1_web_session-order-test', assistant_id: 'asst1', updated_at: '2026-10-03T10:00:00.000Z',
      data: { name: 'Andelmalek', orderDraft: { status: 'awaiting_confirmation', kind: 'order', channel: 'Site web', summary: 'Client : Salam', updatedAt: '2026-10-05T00:00:00.000Z' } },
    }]);
    const res = await send('oui', 'greet-nocreate-1', [
      { sender: 'user', text: 'Salam' },
      { sender: 'bot', text: 'Confirmez-vous ?' },
    ]);
    expect(res.status).toBe(200);
    const prospect = fx.supabase.rows('prospects').find((r) => r.id === 'asst1_web_session-order-test');
    expect(prospect?.data.orders || []).toHaveLength(0);
  });
});
