/**
 * Le scénario complet du marchand, de bout en bout, sans rien simuler de NOTRE code :
 *
 *   « quand on commente prix, réponds merci en public et envoie mes tarifs en privé »
 *        → l'IA crée la réponse automatique (chat)
 *        → un client commente sous une publication (webhook Instagram)
 *        → la réponse publique ET le message privé partent vraiment (faux Instagram)
 *
 * Seuls Gemini, Instagram et la base sont simulés.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost as copilot, resetCopilotMemory } from '../functions/api/copilot';
import { onRequestPost as webhook } from '../functions/api/webhook/instagram';
import { ENV, IG_ID, commentPayload, dmEvent, installFakes, seedMerchant } from './helpers/fakes';
import { FakeGemini, functionCall, modelReply, textPart } from './helpers/fake-gemini';

const ENV_KEY = { ...ENV, GEMINI_API_KEY: 'test-gemini-key' };

let fx: ReturnType<typeof installFakes>;
let gemini: FakeGemini;

beforeEach(() => {
  resetCopilotMemory();
  fx = installFakes();
  gemini = new FakeGemini();
  fx.external.handler = gemini.handler;
  seedMerchant(fx.supabase);
  Object.assign(fx.supabase.rows('assistants')[0], { business_name: 'Boutique Nour', knowledge_notes: [], config: {} });
});
afterEach(() => fx.restore());

async function chat(text: string) {
  const res = await copilot({
    request: new Request('https://jawebflow.test/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer BEARER_U1' },
      body: JSON.stringify({ assistantId: 'asst1', messages: [{ role: 'user', text }] }),
    }),
    env: ENV_KEY,
  });
  return (await res.json()) as any;
}

/** Un client commente sous une publication : Meta prévient notre webhook, qui travaille en arrière-plan. */
async function customerComments(over: Parameters<typeof commentPayload>[0]) {
  const pending: Promise<unknown>[] = [];
  const res = await webhook({
    request: new Request('https://jawebflow.test/api/webhook/instagram', { method: 'POST', body: JSON.stringify(commentPayload(over)) }),
    env: ENV,
    waitUntil: (p: Promise<unknown>) => { pending.push(p); },
  });
  await Promise.all(pending);
  return res;
}

const createPriceAutomation = (activate: boolean) =>
  modelReply(
    functionCall('create_automation', {
      trigger: 'comment',
      name: 'Prix en commentaire',
      keywords: ['prix', 'ch7al', 'combien'],
      public_replies: ['Merci {@pseudo} ! Je t’envoie les prix en privé 📩'],
      dm_text: 'Salut {prenom} 👋 Nos tarifs : coque Spiderman iPhone 13 à 16 — 1900 DA.',
      dm_buttons: [{ title: 'Voir le catalogue', url: 'https://nour.dz/catalogue' }],
      activate,
    }),
  );

describe('de la phrase du marchand à la réponse envoyée sous le commentaire', () => {
  it('« réponds aux commentaires prix… » : créée en pause = le robot se tait ; « oui active » = il répond vraiment', async () => {
    gemini.next(createPriceAutomation(false), modelReply(textPart('Créée, en pause. Je l’active ?')));
    const made = await chat('quand on commente prix ou ch7al, réponds merci en public et envoie mes tarifs en privé');
    expect(made.actions[0].tool).toBe('create_automation');

    // En pause : un client commente « ch7al ? », rien ne part.
    await customerComments({ id: 'c1', text: 'ch7al had la coque ?' });
    expect(fx.meta.sent('replies')).toHaveLength(0);
    expect(fx.meta.sent('messages')).toHaveLength(0);

    // Le marchand dit « oui, active ».
    const autoId = made.actions[0].activate.automationId;
    gemini.next(modelReply(functionCall('set_automation_enabled', { id: autoId, enabled: true })), modelReply(textPart('C’est activé ✅')));
    const on = await chat('oui active');
    expect(on.actions[0].title).toBe('Réponse automatique activée');

    // Un client commente : la réponse publique ET le message privé partent, personnalisés.
    await customerComments({ id: 'c2', text: 'Ch7al le prix de la coque ?', username: 'sara_dz' });
    const replies = fx.meta.sent('replies');
    expect(replies).toHaveLength(1);
    expect(replies[0].path).toBe('/c2/replies');
    expect(replies[0].body.message).toBe('Merci @sara_dz ! Je t’envoie les prix en privé 📩');

    const dms = fx.meta.sent('messages');
    expect(dms).toHaveLength(1);
    expect(dms[0].path).toBe(`/${IG_ID}/messages`);
    expect(dms[0].body.recipient).toEqual({ comment_id: 'c2' });
    const dmBody = JSON.stringify(dms[0].body.message);
    expect(dmBody).toContain('Nos tarifs : coque Spiderman iPhone 13 à 16 — 1900 DA.');
    expect(dmBody).toContain('https://nour.dz/catalogue');
    expect(dmBody).toContain('Voir le catalogue');

    // Un commentaire sans les mots-clés ne déclenche rien.
    await customerComments({ id: 'c3', text: 'Magnifique robe 😍', username: 'lina_oran', fromId: 'IGSID_LINA' });
    expect(fx.meta.sent('replies')).toHaveLength(1);
    expect(fx.meta.sent('messages')).toHaveLength(1);

    // L'historique de l'écran « Automatisations » montre ce qui s'est passé, et le compteur a bougé.
    expect(fx.supabase.rows('ig_automations')[0]).toMatchObject({ triggered_count: 1, public_reply_count: 1, dm_count: 1 });
    expect(fx.supabase.rows('ig_automation_events')).toHaveLength(1);
    expect(fx.supabase.rows('ig_automation_events')[0]).toMatchObject({ contact_username: 'sara_dz', outcome: 'done' });
  });

  it('« mets-la en pause » : le robot se tait aussitôt ; « Annuler » sur la création supprime la réponse automatique', async () => {
    gemini.next(createPriceAutomation(true), modelReply(textPart('Créée et activée.')));
    const made = await chat('crée la réponse prix et active-la tout de suite');
    await customerComments({ id: 'c1', text: 'prix ?' });
    expect(fx.meta.sent('messages')).toHaveLength(1);

    const autoId = fx.supabase.rows('ig_automations')[0].id;
    gemini.next(modelReply(functionCall('set_automation_enabled', { id: autoId, enabled: false })), modelReply(textPart('Mise en pause.')));
    await chat('mets-la en pause');
    await customerComments({ id: 'c2', text: 'prix ?', fromId: 'IGSID_LINA', username: 'lina_oran' });
    expect(fx.meta.sent('messages')).toHaveLength(1); // rien de plus

    // « Annuler » (bouton de la carte de création) la supprime pour de bon.
    const undo = await copilot({
      request: new Request('https://jawebflow.test/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer BEARER_U1' },
        body: JSON.stringify({ assistantId: 'asst1', op: made.actions[0].undo }),
      }),
      env: ENV_KEY,
    });
    expect(undo.status).toBe(200);
    expect(fx.supabase.rows('ig_automations')).toHaveLength(0);
  });

  it('un mot-clé en message privé : « quand on m’écrit livraison, réponds… » répond sans IA, dès la première fois', async () => {
    gemini.next(
      modelReply(functionCall('create_automation', { trigger: 'dm_keyword', name: 'Livraison', keywords: ['livraison', 'tawsil'], dm_text: 'Livraison en 48h partout en Algérie 🚚 — 600 DA.', activate: true })),
      modelReply(textPart('C’est en place.')),
    );
    await chat('quand on m’écrit livraison, réponds que c’est livré en 48h pour 600 DA, et active');

    const pending: Promise<unknown>[] = [];
    await webhook({
      request: new Request('https://jawebflow.test/api/webhook/instagram', {
        method: 'POST',
        body: JSON.stringify({ object: 'instagram', entry: [{ id: IG_ID, time: 1, messaging: [dmEvent({ text: 'Salam, wach el livraison ?' })] }] }),
      }),
      env: ENV,
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
    });
    await Promise.all(pending);
    const dms = fx.meta.sent('messages');
    expect(dms).toHaveLength(1);
    expect(JSON.stringify(dms[0].body.message)).toContain('Livraison en 48h partout en Algérie');
    expect(gemini.calls).toHaveLength(2); // seulement les 2 appels du chat du marchand : le client, lui, n'a pas déclenché l'IA
  });
});
