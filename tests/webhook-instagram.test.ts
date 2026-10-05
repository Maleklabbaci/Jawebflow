import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { greetingReply, onRequestPost } from '../functions/api/webhook/instagram';
import { FakeGemini, modelReply, textPart } from './helpers/fake-gemini';
import { ENV, IG_ID, USER_ID, commentPayload, dmEvent, installFakes, seedAutomation, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => {
  expect(fx.other).toEqual([]); // jamais d'appel réseau imprévu (donc jamais d'appel à l'IA dans ces scénarios)
  fx.restore();
});

/** Envoie une charge utile comme le ferait Meta, et attend la fin du travail en arrière-plan. */
async function deliver(payload: unknown, env: Record<string, any> = ENV, headers: Record<string, string> = {}) {
  const raw = JSON.stringify(payload);
  const pending: Promise<unknown>[] = [];
  const res = await onRequestPost({
    request: new Request('https://jawebflow.test/api/webhook/instagram', { method: 'POST', body: raw, headers }),
    env,
    waitUntil: (p: Promise<unknown>) => { pending.push(p); },
  });
  await Promise.all(pending);
  return res;
}

const messagingPayload = (...events: unknown[]) => ({ object: 'instagram', entry: [{ id: IG_ID, time: 1, messaging: events }] });

describe('webhook : commentaires', () => {
  it('un commentaire déclenche la réponse publique ET le message privé, puis répond 200 à Meta', async () => {
    seedAutomation(fx.supabase);
    const res = await deliver(commentPayload());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');
    expect(fx.meta.sent('replies')).toHaveLength(1);
    expect(fx.meta.sent('messages')).toHaveLength(1);
    expect(fx.meta.sent('messages')[0].body.recipient).toEqual({ comment_id: 'c1' });
  });

  it('Meta renvoie la même notification : une seule réponse', async () => {
    seedAutomation(fx.supabase);
    await deliver(commentPayload());
    await deliver(commentPayload());
    expect(fx.meta.sent('replies')).toHaveLength(1);
    expect(fx.meta.sent('messages')).toHaveLength(1);
  });

  it('un lot de 12 commentaires de 12 personnes : tout le monde est servi, une fois chacun', async () => {
    seedAutomation(fx.supabase);
    const entry = {
      id: IG_ID, time: 1,
      changes: Array.from({ length: 12 }, (_, i) => ({
        field: 'comments',
        value: { id: `c${i}`, from: { id: `U${i}`, username: `user${i}` }, text: 'prix ?', media: { id: 'MEDIA_1' } },
      })),
    };
    await deliver({ object: 'instagram', entry: [entry] });
    expect(fx.meta.sent('messages')).toHaveLength(12);
    expect(new Set(fx.meta.sent('messages').map((c) => c.body.recipient.comment_id)).size).toBe(12);
    expect(fx.supabase.rows('ig_automations')[0].triggered_count).toBe(12);
  });

  it('le commentaire de test de Meta (compte fictif) ne casse rien', async () => {
    const res = await deliver({
      object: 'instagram',
      entry: [{ id: '0', time: 1, changes: [{ field: 'comments', value: { from: { id: '1234', username: 'test' }, media: { id: '123', media_product_type: 'FEED' }, id: '17865799348089039', text: 'This is an example.' } }] }],
    });
    expect(res.status).toBe(200);
    expect(fx.meta.calls).toHaveLength(0);
  });

  it('les autres types de notifications (mentions, etc.) sont ignorés sans erreur', async () => {
    const res = await deliver({ object: 'instagram', entry: [{ id: IG_ID, time: 1, changes: [{ field: 'mentions', value: { media_id: '1' } }] }] });
    expect(res.status).toBe(200);
    expect(fx.meta.calls).toHaveLength(0);
  });

  it('vérifie la signature Meta quand le secret est configuré', async () => {
    seedAutomation(fx.supabase);
    const env = { ...ENV, INSTAGRAM_APP_SECRET: 'secret-app' };
    const raw = JSON.stringify(commentPayload());
    const good = 'sha256=' + createHmac('sha256', 'secret-app').update(raw).digest('hex');
    expect((await deliver(commentPayload(), env, { 'X-Hub-Signature-256': 'sha256=faux' })).status).toBe(401);
    expect(fx.meta.sent('messages')).toHaveLength(0);
    expect((await deliver(commentPayload(), env, { 'X-Hub-Signature-256': good })).status).toBe(200);
    expect(fx.meta.sent('messages')).toHaveLength(1);
  });
});

describe('webhook : messages privés et stories', () => {
  it('un mot-clé reçoit sa réponse AUTOMATIQUE, même quand l’IA est en pause', async () => {
    fx.supabase.tables.instagram_integrations[0].auto_reply_enabled = false;
    seedAutomation(fx.supabase, {
      trigger_type: 'dm_keyword', name: 'Horaires',
      config: { media: { scope: 'any' }, match: { mode: 'contains', keywords: ['horaires'] }, publicReply: { enabled: false, variations: [] }, dm: { enabled: true, text: 'Ouvert de 9h à 18h', buttons: [] }, gate: { enabled: false }, oncePerUser: false },
    });
    await deliver(messagingPayload(dmEvent({ text: 'Vos horaires ?' })));
    expect(fx.meta.sent('messages')).toHaveLength(1);
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Ouvert de 9h à 18h');
  });

  it('IA en pause et aucun mot-clé : le robot se tait', async () => {
    fx.supabase.tables.instagram_integrations[0].auto_reply_enabled = false;
    await deliver(messagingPayload(dmEvent({ text: 'Bonjour, une question' })));
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('« Réponses aux stories » désactivé : l’IA ne répond pas à une réponse de story', async () => {
    fx.supabase.tables.instagram_integrations[0].respond_to_stories = false;
    await deliver(messagingPayload(dmEvent({ text: 'trop beau !', story: true })));
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('…mais une règle « story » reste prioritaire', async () => {
    fx.supabase.tables.instagram_integrations[0].respond_to_stories = false;
    seedAutomation(fx.supabase, {
      trigger_type: 'story_reply', name: 'Stories',
      config: { media: { scope: 'any' }, match: { mode: 'any', keywords: [] }, publicReply: { enabled: false, variations: [] }, dm: { enabled: true, text: 'Merci pour ton retour 🙏', buttons: [] }, gate: { enabled: false }, oncePerUser: false },
    });
    await deliver(messagingPayload(dmEvent({ text: 'trop beau !', story: true })));
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Merci pour ton retour 🙏');
  });

  it('n’envoie pas un partage Instagram non identifié à Gemini Vision comme une image', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(modelReply(textPart('Que souhaitez-vous savoir à propos de ce partage ?')));
    const event: any = dmEvent({ text: 'Tu peux me parler de ce produit ?', mid: 'share-unknown' });
    event.message.attachments = [{ type: 'share', payload: { url: 'https://www.instagram.com/p/private-example' } }];
    await deliver(messagingPayload(event), { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' });
    expect(JSON.stringify(gemini.calls[0].body.contents)).not.toContain('inline_data');
    expect(JSON.stringify(gemini.calls[0].body.contents)).toContain('sharedMediaUnavailable');
    expect(fx.meta.calls.some((call) => call.method === 'GET' && call.path.includes('/attachments'))).toBe(false);
  });

  it('ne crée pas une commande sur une intention seule, puis la crée après confirmation du brouillon', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(
      modelReply(textPart('Souhaitez-vous confirmer la commande ?')),
      modelReply(textPart('Votre demande est transmise à la boutique pour validation.')),
    );
    const env = { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' };

    await deliver(messagingPayload(dmEvent({ text: 'Je veux acheter une veste', mid: 'order-intent-1' })), env);
    let prospect = fx.supabase.rows('prospects').find((row) => row.data?.igUserId === 'IGSID_SARA');
    expect(prospect?.data?.orders || []).toHaveLength(0);
    expect(prospect?.data?.orderDraft?.status).toBe('awaiting_confirmation');

    await deliver(messagingPayload(dmEvent({ text: 'oui', mid: 'order-confirm-2' })), env);
    prospect = fx.supabase.rows('prospects').find((row) => row.data?.igUserId === 'IGSID_SARA');
    expect(prospect?.data?.orders).toHaveLength(1);
    expect(prospect?.data?.orders[0]).toMatchObject({
      status: 'pending_merchant_confirmation', channel: 'Instagram', totalAmount: null,
    });
    expect(prospect?.data?.orderDraft).toBeNull();
    expect(gemini.calls[1].body.generationConfig.maxOutputTokens).toBe(180);
  });

  it('permet au client Instagram d’expliquer puis de confirmer l’annulation de sa commande', async () => {
    const prospectId = 'asst1_ig_IGSID_SARA';
    fx.supabase.seed('prospects', [{
      id: prospectId,
      assistant_id: 'asst1',
      data: {
        igUserId: 'IGSID_SARA',
        sessionId: 'ig_IGSID_SARA',
        orders: [{ id: 'ig-order-1', reference: 'JF-IGORDER1', status: 'confirmed', summary: 'Veste noire', createdAt: '2026-10-01T10:00:00.000Z' }],
      },
    }]);

    await deliver(messagingPayload(dmEvent({ text: 'Je veux annuler ma commande', mid: 'ig-cancel-1' })));
    let prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].status).toBe('confirmed');
    expect(prospect?.data.orderChangeDraft.status).toBe('awaiting_reason');
    expect(fx.meta.sent('messages').at(-1)?.body.message.text).toContain('Qu’est-ce qui vous pousse');

    await deliver(messagingPayload(dmEvent({ text: 'Le prix est trop élevé', mid: 'ig-cancel-2' })));
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0].status).toBe('confirmed');
    expect(prospect?.data.orderChangeDraft.status).toBe('awaiting_confirmation');
    expect(fx.meta.sent('messages').at(-1)?.body.message.text).toContain('option moins chère');

    await deliver(messagingPayload(dmEvent({ text: 'oui', mid: 'ig-cancel-3' })));
    prospect = fx.supabase.rows('prospects').find((row) => row.id === prospectId);
    expect(prospect?.data.orders[0]).toMatchObject({ status: 'cancelled', cancellationReason: 'Le prix est trop élevé' });
    expect(prospect?.data.orderChangeDraft).toBeNull();
    expect(fx.meta.sent('messages').at(-1)?.body.message.text).toContain('est annulée');
  });

  it('les copies (« échos ») de nos propres messages sont ignorées : pas de boucle', async () => {
    seedAutomation(fx.supabase, {
      trigger_type: 'dm_keyword',
      config: { media: { scope: 'any' }, match: { mode: 'contains', keywords: ['prix'] }, publicReply: { enabled: false, variations: [] }, dm: { enabled: true, text: 'Nos prix', buttons: [] }, gate: { enabled: false }, oncePerUser: false },
    });
    await deliver(messagingPayload({ ...dmEvent({ text: 'Nos prix', echo: true }), sender: { id: IG_ID }, recipient: { id: 'IGSID_SARA' } }));
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('clic sur « ✅ C’est fait » : le message promis est envoyé', async () => {
    seedAutomation(fx.supabase, { config: {
      media: { scope: 'any' }, match: { mode: 'contains', keywords: ['prix'] }, publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Voici le code promo : NOUR10', buttons: [] },
      gate: { enabled: true, text: 'Suis-nous puis appuie', button: '✅ C’est fait', retry: 'Pas encore' }, oncePerUser: true,
    } });
    await deliver(commentPayload());
    const payload = fx.meta.sent('messages')[0].body.message.attachment.payload.buttons[0].payload as string;
    expect(payload).toMatch(/^jfg:/);
    fx.meta.profiles['IGSID_SARA'] = { name: 'Sara', username: 'sara_dz', is_user_follow_business: true };
    await deliver(messagingPayload({ sender: { id: 'IGSID_SARA' }, recipient: { id: IG_ID }, timestamp: 1, postback: { mid: 'pb1', title: '✅ C’est fait', payload } }));
    expect(fx.meta.sent('messages').at(-1)!.body.message.text).toBe('Voici le code promo : NOUR10');
  });
});

describe('message de premier contact (salutation)', () => {
  const config = { businessName: 'Boutique Nour', behavior: { language: 'fr' } };
  it('vide ou texte d’origine → salutation automatique dans la langue choisie', () => {
    expect(greetingReply('', 'bonjour', config)).toBe('Bonjour 👋 Bienvenue chez Boutique Nour ! Comment puis-je vous aider ?');
    expect(greetingReply('Salam 👋 Bienvenue sur notre page Instagram ! Comment puis-je vous aider ?', 'salam', config)).toMatch(/^Bonjour/);
    expect(greetingReply(undefined, 'salam', config)).toMatch(/^Bonjour/);
  });
  it('un message personnalisé est utilisé, avec {entreprise}', () => {
    expect(greetingReply('Ahlan ! Ici {entreprise}, on vous écoute 💜', 'salam', config)).toBe('Ahlan ! Ici Boutique Nour, on vous écoute 💜');
  });
  it('« merci » reste un « avec plaisir », jamais une re-salutation', () => {
    expect(greetingReply('Ahlan ! Ici {entreprise}', 'merci beaucoup', config)).toMatch(/Avec plaisir/);
  });
});

describe('politesse en pleine conversation : le bot ne recommence JAMAIS par la salutation', () => {
  /** Une conversation déjà entamée (le client a posé une question, le bot a répondu). */
  function seedConversation() {
    fx.supabase.seed('instagram_threads', [{
      integration_id: USER_ID,
      customer_id: 'IGSID_SARA',
      messages: [
        { role: 'user', text: 'Vous livrez à Oran ?', ts: '2026-10-04T09:00:00.000Z' },
        { role: 'model', text: 'Oui, livraison en 48 h partout en Algérie 🙂', ts: '2026-10-04T09:00:05.000Z' },
      ],
      handled_mids: ['old-1', 'old-2'],
      pending_messages: [],
      pending_token: null,
    }]);
  }

  it('« merci » puis « bonjour » : réponses courtes, jamais « Bienvenue chez… »', async () => {
    seedConversation();
    await deliver(messagingPayload(dmEvent({ text: 'merci', mid: 'polite-1' })));
    await deliver(messagingPayload(dmEvent({ text: 'bonjour', mid: 'polite-2' })));
    const sent = fx.meta.sent('messages').filter((call) => call.body?.message).map((call) => call.body.message.text);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(/Avec plaisir/);
    // « bonjour » en pleine discussion : réponse courte, PAS le message d'accueil.
    expect(sent[1]).toMatch(/^Salam/);
    for (const text of sent) {
      expect(text).not.toContain('Marhba');
      expect(text).not.toContain('Bienvenue');
      expect(text).not.toContain('Comment puis-je vous aider');
      expect(text).not.toContain('Kifach n9der n3awnek');
    }
  });

  it('un « ok » en pleine discussion va à l’IA (il répond à la question précédente)', async () => {
    seedConversation();
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(modelReply(textPart('Parfait, je vous envoie le lien tout de suite 🙂')));
    await deliver(messagingPayload(dmEvent({ text: 'ok', mid: 'polite-3' })), { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' });
    expect(gemini.calls).toHaveLength(1);
    expect(fx.meta.sent('messages').filter((call) => call.body?.message).at(-1)?.body.message.text).toBe('Parfait, je vous envoie le lien tout de suite 🙂');
  });

  it('au premier contact, la salutation du marchand est bien envoyée', async () => {
    await deliver(messagingPayload(dmEvent({ text: 'salam', mid: 'polite-4' })));
    const firstContact = fx.meta.sent('messages').filter((call) => call.body?.message).map((call) => call.body.message.text);
    expect(firstContact).toHaveLength(1);
    expect(firstContact[0]).toContain('Marhba');
  });
});

describe('validation typée : visite, rendez-vous ou commande', () => {
  it('« oui je valide la visite » enregistre une VISITE et l’annonce comme telle à l’IA', async () => {
    fx.supabase.seed('instagram_threads', [{
      integration_id: USER_ID,
      customer_id: 'IGSID_SARA',
      messages: [
        { role: 'user', text: 'L’appartement de Hydra est toujours disponible ?', ts: '2026-10-04T09:00:00.000Z' },
        { role: 'model', text: 'Oui. Souhaitez-vous planifier une visite ?', ts: '2026-10-04T09:00:05.000Z' },
      ],
      handled_mids: ['old-1'],
      pending_messages: [],
      pending_token: null,
    }]);
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(modelReply(textPart('C’est noté, votre demande de visite est transmise à l’équipe 🙂')));
    await deliver(messagingPayload(dmEvent({ text: 'oui je valide la visite', mid: 'visit-1' })), { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' });

    const prospect = fx.supabase.rows('prospects').find((row) => row.data?.igUserId === 'IGSID_SARA');
    expect(prospect?.data?.orders).toHaveLength(1);
    expect(prospect?.data?.orders[0]).toMatchObject({ kind: 'visit', kindLabel: 'Visite', status: 'pending_merchant_confirmation', channel: 'Instagram' });
    expect(prospect?.data?.salesIntentType).toBe('visit');
    const prompt = JSON.stringify(gemini.calls[0].body.contents);
    expect(prompt).toContain('Visite');
    expect(prompt).toContain('Demande de visite enregistrée');
    expect(prompt).not.toContain('Demande de commande enregistrée');
  });

  it('le bot qui fait confirmer un rendez-vous prépare un brouillon « rendez-vous », validé par un simple oui', async () => {
    const gemini = new FakeGemini();
    fx.external.handler = gemini.handler;
    gemini.next(
      modelReply(textPart('Je vous propose jeudi à 15 h. Confirmez-vous ce rendez-vous ?')),
      modelReply(textPart('C’est enregistré, à jeudi 🙂')),
    );
    const env = { ...ENV, GEMINI_API_KEY: 'gemini-test-key', GEMINI_CONTEXT_CACHE_ENABLED: 'false' };

    await deliver(messagingPayload(dmEvent({ text: 'Je veux un rendez-vous pour un devis', mid: 'rdv-1' })), env);
    let prospect = fx.supabase.rows('prospects').find((row) => row.data?.igUserId === 'IGSID_SARA');
    expect(prospect?.data?.orderDraft).toMatchObject({ status: 'awaiting_confirmation', kind: 'appointment' });
    expect(prospect?.data?.orders || []).toHaveLength(0);

    await deliver(messagingPayload(dmEvent({ text: 'oui', mid: 'rdv-2' })), env);
    prospect = fx.supabase.rows('prospects').find((row) => row.data?.igUserId === 'IGSID_SARA');
    expect(prospect?.data?.orders).toHaveLength(1);
    expect(prospect?.data?.orders[0]).toMatchObject({ kind: 'appointment', kindLabel: 'Rendez-vous' });
    expect(prospect?.data?.orderDraft).toBeNull();
  });
});
