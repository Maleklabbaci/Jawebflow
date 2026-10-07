/**
 * CANAUX — BOUT EN BOUT, À TRAVERS LES VRAIS WEBHOOKS HTTP
 * ============================================================================
 * On appelle les handlers `onRequestGet` / `onRequestPost` exactement comme
 * Cloudflare Pages le fera, avec le réseau entièrement simulé :
 *   • Supabase  → FakeSupabase
 *   • graph.facebook.com → FakeGraph (Messenger + WhatsApp)
 *   • api.telegram.org   → FakeTelegram
 *   • business-api.tiktok.com → FakeTikTok
 *   • Gemini    → FakeGemini
 *
 * `fx.other` doit rester VIDE à la fin de chaque test : c'est la preuve
 * qu'aucun test ne dépend d'une vraie connexion réseau.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet as messengerGet, onRequestPost as messengerPost } from '../functions/api/webhook/messenger';
import { onRequestGet as whatsappGet, onRequestPost as whatsappPost } from '../functions/api/webhook/whatsapp';
import { onRequestGet as telegramGet, onRequestPost as telegramPost } from '../functions/api/webhook/telegram';
import { onRequestGet as tiktokGet, onRequestPost as tiktokPost } from '../functions/api/webhook/tiktok';
import { FakeGemini, modelReply, textPart } from './helpers/fake-gemini';
import { metaSignature } from '../functions/_shared/channels/signature';
import { WA_QUOTA_REACHED_MSG } from '../functions/_shared/channels/metering';
import { whatsappText } from '../functions/_shared/channels/whatsapp';
import {
  ENV_CHANNELS, PAGE_ID, PSID, TG_SECRET, TT_BIZ_ID, WA_CUSTOMER, WA_PHONE_ID,
  installFakes, messengerDelivery, messengerEvent, seedChannel, seedMerchant, seedPlan,
  telegramUpdate, tiktokEvent, whatsappMessage, whatsappStatus,
} from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
let gemini: FakeGemini;

beforeEach(() => {
  fx = installFakes();
  gemini = new FakeGemini();
  fx.external.handler = gemini.handler;
  seedMerchant(fx.supabase);
});
afterEach(() => {
  expect(fx.other).toEqual([]); // aucun appel réseau imprévu
  fx.restore();
});

type Handler = (ctx: any) => Promise<Response>;

/** Envoie une charge utile comme le ferait la plateforme, et attend le travail de fond. */
async function deliver(
  handler: Handler,
  url: string,
  payload: unknown,
  env: Record<string, any> = ENV_CHANNELS,
  headers: Record<string, string> = {},
) {
  const raw = JSON.stringify(payload);
  const pending: Promise<unknown>[] = [];
  const res = await handler({
    request: new Request(url, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', ...headers } }),
    env,
    waitUntil: (p: Promise<unknown>) => { pending.push(p); },
  });
  await Promise.all(pending);
  return res;
}

async function callGet(handler: Handler, url: string, env: Record<string, any> = ENV_CHANNELS) {
  return handler({ request: new Request(url, { method: 'GET' }), env });
}

/** En-tête de signature Meta valide pour ce corps. */
async function metaHeaders(payload: unknown, secret: string) {
  return { 'x-hub-signature-256': await metaSignature(secret, JSON.stringify(payload)) };
}

/** Un message sortant du faux graph correspond-il à ce texte ? */
const sentTexts = (calls: Array<{ body?: any }>) => calls.map((c) => String(c.body?.message?.text || c.body?.text?.body || ''));

// ═══════════════════════════════════════════════════════════════════════════
// MESSENGER — priorité commerciale n°1 (29,3 M d’utilisateurs en Algérie)
// ═══════════════════════════════════════════════════════════════════════════

describe('webhook Messenger', () => {
  beforeEach(() => seedChannel(fx.supabase, 'messenger'));

  it('GET : renvoie le challenge quand le jeton de vérification correspond', async () => {
    const res = await callGet(messengerGet, 'https://jawebflow.test/api/webhook/messenger?hub.mode=subscribe&hub.verify_token=VERIFY_1&hub.challenge=98765');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('98765');
  });

  it('GET : refuse (403) un mauvais jeton et (503) un serveur non configuré', async () => {
    const bad = await callGet(messengerGet, 'https://jawebflow.test/api/webhook/messenger?hub.mode=subscribe&hub.verify_token=NON&hub.challenge=1');
    expect(bad.status).toBe(403);
    const unset = await callGet(messengerGet, 'https://jawebflow.test/api/webhook/messenger?hub.mode=subscribe&hub.verify_token=VERIFY_1&hub.challenge=1', {});
    expect(unset.status).toBe(503);
  });

  it('POST : une signature invalide est refusée AVANT tout traitement (401)', async () => {
    const res = await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', messengerEvent(), ENV_CHANNELS, { 'x-hub-signature-256': 'sha256=deadbeef' });
    expect(res.status).toBe(401);
    expect(fx.graph.calls).toHaveLength(0);   // rien n’est envoyé à Meta
    expect(fx.supabase.calls).toHaveLength(0); // et rien n’est lu/écrit en base
  });

  it('POST sans secret configuré : refus (échec fermé, jamais de webhook ouvert)', async () => {
    const env = { ...ENV_CHANNELS, MESSENGER_APP_SECRET: undefined, INSTAGRAM_APP_SECRET: undefined };
    const res = await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', messengerEvent(), env);
    expect(res.status).toBe(401);
    expect(fx.graph.calls).toHaveLength(0);
  });

  it('POST valide : le client reçoit la réponse de l’IA et Meta obtient son 200', async () => {
    gemini.next(modelReply(textPart('Salam ! Nos prix commencent à 2 500 DA 😊')));
    const payload = messengerEvent({ text: 'Vos prix ?' });
    const res = await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');

    const sent = fx.graph.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toBe('/me/messages');
    expect(sent[0].body.recipient).toEqual({ id: PSID });
    expect(sent[0].body.messaging_type).toBe('RESPONSE');
    expect(sentTexts(sent)[0]).toContain('2 500 DA');
    expect(sent[0].auth).toBe('Bearer PAGE_TOKEN_1');
  });

  it('chaque échange est journalisé : 1 entrant + 1 sortant, et la conversation compte pour le quota', async () => {
    gemini.next(modelReply(textPart('Oui, livraison gratuite.')));
    const payload = messengerEvent({ mid: 'mid_j1' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET));

    const rows = fx.supabase.rows('channel_messages');
    expect(rows).toHaveLength(2);
    const incoming = rows.find((r) => r.direction === 'in')!;
    const outgoing = rows.find((r) => r.direction === 'out')!;
    expect(incoming).toMatchObject({ channel: 'messenger', assistant_id: 'asst1', message_id: 'mid_j1', billable: false });
    expect(outgoing.billable).toBe(false); // Messenger est gratuit chez Meta : rien à refacturer
    // Le propriétaire est rempli depuis l'intégration : la jauge du tableau de
    // bord et la RLS s'appuient dessus (voir supabase/migration_channels.sql).
    expect(incoming.user_id).toBe(fx.supabase.rows('channel_integrations')[0].user_id);
    expect(outgoing.user_id).toBe(incoming.user_id);

    const contexts = fx.supabase.rows('conversation_contexts');
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ channel: 'messenger', session_id: PSID });
    expect(contexts[0].assistant_response).toContain('livraison gratuite');
  });

  it('Meta réémet la MÊME notification : une seule réponse, un seul appel à l’IA', async () => {
    gemini.next(modelReply(textPart('Bonjour !')));
    const payload = messengerEvent({ mid: 'mid_renvoi' });
    const headers = await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET);
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, headers);
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, headers);

    expect(fx.graph.sent()).toHaveLength(1);
    expect(gemini.calls).toHaveLength(1);
    expect(fx.supabase.rows('channel_messages').filter((r) => r.direction === 'in')).toHaveLength(1);
  });

  it('« stop » coupe le bot pour ce contact, « reprends » le rallume', async () => {
    const stop = messengerEvent({ mid: 'mid_stop', text: 'stop' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', stop, ENV_CHANNELS, await metaHeaders(stop, ENV_CHANNELS.MESSENGER_APP_SECRET));
    expect(fx.supabase.rows('bot_mutes')).toHaveLength(1);
    expect(gemini.calls).toHaveLength(0);

    const afterMute = messengerEvent({ mid: 'mid_apres', text: 'bonjour ?' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', afterMute, ENV_CHANNELS, await metaHeaders(afterMute, ENV_CHANNELS.MESSENGER_APP_SECRET));
    // Le message est bien ARRIVÉ (il est journalisé) mais aucun appel payant n’a eu lieu.
    expect(fx.supabase.rows('channel_messages').some((r) => r.message_id === 'mid_apres')).toBe(true);
    expect(gemini.calls).toHaveLength(0); // toujours silencieux
    expect(fx.graph.sent()).toHaveLength(0);

    const resume = messengerEvent({ mid: 'mid_resume', text: 'reprends' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', resume, ENV_CHANNELS, await metaHeaders(resume, ENV_CHANNELS.MESSENGER_APP_SECRET));
    expect(fx.supabase.rows('bot_mutes')).toHaveLength(0);

    // Et la conversation reprend vraiment : le message suivant reçoit sa réponse.
    gemini.next(modelReply(textPart('Nous revoilà 😊')));
    const apresReprise = messengerEvent({ mid: 'mid_apres_reprise', text: 'toujours là ?' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', apresReprise, ENV_CHANNELS, await metaHeaders(apresReprise, ENV_CHANNELS.MESSENGER_APP_SECRET));
    expect(gemini.calls).toHaveLength(1);
    expect(sentTexts(fx.graph.sent())[0]).toContain('Nous revoilà');
  });

  it('un message de plus de 2 000 caractères part en PLUSIEURS messages (jamais une erreur Meta)', async () => {
    gemini.next(modelReply(textPart('mot '.repeat(600).trim())));
    const payload = messengerEvent({ mid: 'mid_long' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET));

    const sent = fx.graph.sent();
    expect(sent.length).toBeGreaterThan(1);
    sent.forEach((c) => expect(String(c.body.message.text).length).toBeLessThanOrEqual(2000));
  });

  it('accusé de livraison : enregistré, non facturé (Messenger est gratuit)', async () => {
    const payload = messengerDelivery({ mid: 'mid_deliv', billable: true, category: 'service' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET));
    const rows = fx.supabase.rows('channel_messages');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: 'out', message_id: 'mid_deliv', billable: true });
  });

  it('sans intégration branchée pour cette page, on ne répond pas (et on ne paie pas d’IA)', async () => {
    fx.supabase.tables.channel_integrations = [];
    const payload = messengerEvent({ mid: 'mid_orphelin' });
    await deliver(messengerPost, 'https://jawebflow.test/api/webhook/messenger', payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.MESSENGER_APP_SECRET));
    expect(gemini.calls).toHaveLength(0);
    expect(fx.graph.sent()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP — le seul canal payant : ici, chaque message compte
// ═══════════════════════════════════════════════════════════════════════════

describe('webhook WhatsApp', () => {
  const url = 'https://jawebflow.test/api/webhook/whatsapp';

  /** Simule des messages sortants DÉJÀ facturés par Meta ce mois-ci. */
  function seedBillable(count: number, channel = 'whatsapp', assistantId = 'asst1') {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: `cm_${i}`, assistant_id: assistantId, channel, direction: 'out',
      message_id: `wamid.old.${i}`, billable: true, category: 'service',
      created_at: new Date().toISOString(),
    }));
    fx.supabase.seed('channel_messages', rows);
  }

  it('GET : challenge Meta accepté', async () => {
    const res = await callGet(whatsappGet, `${url}?hub.mode=subscribe&hub.verify_token=VERIFY_1&hub.challenge=4242`);
    expect(await res.text()).toBe('4242');
  });

  it('POST : signature invalide → 401, aucun effet', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    const res = await deliver(whatsappPost, url, whatsappMessage(), ENV_CHANNELS, { 'x-hub-signature-256': 'sha256=faux' });
    expect(res.status).toBe(401);
    expect(fx.graph.calls).toHaveLength(0);
  });

  it('plan Pro : le message reçoit une réponse, le numéro du client est bien le destinataire', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro');
    gemini.next(modelReply(textPart('Salam ! Oui, on livre à Blida.')));

    const payload = whatsappMessage({ text: 'Vous livrez à Blida ?' });
    await deliver(whatsappPost, url, payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET));

    const sent = fx.graph.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toBe(`/${WA_PHONE_ID}/messages`);
    expect(sent[0].body.to).toBe(WA_CUSTOMER);
    expect(sent[0].body.messaging_product).toBe('whatsapp');
    expect(sent[0].body.text.preview_url).toBe(false);
    expect(whatsappText({ text: { body: sentTexts(sent)[0] } })).toContain('Blida');
  });

  it('plan Basic : WhatsApp n’est pas vendu → aucune réponse, aucune dépense d’IA', async () => {
    seedChannel(fx.supabase, 'whatsapp'); // basic par défaut (WhatsApp non inclus)
    const payload = whatsappMessage({ text: 'Bonjour ?' });
    const res = await deliver(whatsappPost, url, payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET));
    expect(res.status).toBe(200);
    expect(gemini.calls).toHaveLength(0);
    expect(fx.graph.sent()).toHaveLength(0);
  });

  it('999 messages consommés : ça répond. 1 000 (le forfait est fini) : message d’attente, SANS IA', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro');

    seedBillable(999);
    gemini.next(modelReply(textPart('Oui, en stock.')));
    const avant = whatsappMessage({ id: 'wamid.IN.999', text: 'En stock ?' });
    await deliver(whatsappPost, url, avant, ENV_CHANNELS, await metaHeaders(avant, ENV_CHANNELS.WHATSAPP_APP_SECRET));
    expect(gemini.calls).toHaveLength(1);
    expect(fx.graph.sent()).toHaveLength(1);

    // Le 1 001ᵉ message (1 000 déjà facturés) : le forfait est épuisé.
    seedBillable(1);
    const apres = whatsappMessage({ id: 'wamid.IN.1000', text: 'Toujours là ?' });
    await deliver(whatsappPost, url, apres, ENV_CHANNELS, await metaHeaders(apres, ENV_CHANNELS.WHATSAPP_APP_SECRET));

    expect(gemini.calls).toHaveLength(1); // l’IA n’a PAS été rappelée
    const sent = fx.graph.sent();
    expect(sent).toHaveLength(2);
    expect(sentTexts(sent)[1]).toBe(WA_QUOTA_REACHED_MSG);
  });

  it('une recharge prépayée rouvre le forfait (le client a payé, il a droit à ses messages)', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro');
    seedBillable(1000);
    fx.supabase.seed('channel_credits', [{ id: 'cr1', assistant_id: 'asst1', channel: 'whatsapp', quantity: 500 }]);
    gemini.next(modelReply(textPart('Oui, je vous écoute.')));

    const payload = whatsappMessage({ id: 'wamid.IN.recharge' });
    await deliver(whatsappPost, url, payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET));
    expect(gemini.calls).toHaveLength(1);
    expect(fx.graph.sent()).toHaveLength(1);
  });

  it('LES ACCUSÉS DE LIVRAISON SONT LA FACTURE : seul un `delivered` facturé est compté', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro');

    for (const [status, billable] of [['sent', true], ['read', true], ['delivered', true], ['delivered', false]] as const) {
      const payload = whatsappStatus({ id: `wamid.S.${status}.${billable}`, status, billable });
      await deliver(whatsappPost, url, payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET));
    }

    const rows = fx.supabase.rows('channel_messages').filter((r) => r.direction === 'out');
    expect(rows).toHaveLength(2); // les deux `delivered` : un facturé, un gratuit
    expect(rows.filter((r) => r.billable === true)).toHaveLength(1);
    expect(rows.find((r) => r.message_id === 'wamid.S.delivered.false')!.billable).toBe(false);
  });

  it('le même accusé livré deux fois ne compte qu’une fois (anti-doublon de la facturation)', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    const payload = whatsappStatus({ id: 'wamid.DOUBLON', billable: true });
    const headers = await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET);
    await deliver(whatsappPost, url, payload, ENV_CHANNELS, headers);
    await deliver(whatsappPost, url, payload, ENV_CHANNELS, headers);
    expect(fx.supabase.rows('channel_messages').filter((r) => r.message_id === 'wamid.DOUBLON')).toHaveLength(1);
  });

  it('fenêtre de 24 h fermée (erreur 131047) : l’échec est explicite, et rien n’est facturé', async () => {
    seedChannel(fx.supabase, 'whatsapp');
    seedPlan(fx.supabase, 'pro');
    fx.graph.failWhen((c) => c.method === 'POST' && /\/messages$/.test(c.path) && c.path !== '/me/messages',
      400, { message: 'Message failed to send', code: 131047, type: 'OAuthException' });
    gemini.next(modelReply(textPart('Réponse hors fenêtre')));

    const payload = whatsappMessage({ id: 'wamid.IN.24h' });
    const res = await deliver(whatsappPost, url, payload, ENV_CHANNELS, await metaHeaders(payload, ENV_CHANNELS.WHATSAPP_APP_SECRET));
    expect(res.status).toBe(200); // Meta a son 200 : il ne doit pas réémettre en boucle

    const out = fx.supabase.rows('channel_messages').filter((r) => r.direction === 'out');
    expect(out).toHaveLength(0); // un envoi échoué n’est jamais facturé
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM — le banc d’essai (gratuit, sans revue d’application)
// ═══════════════════════════════════════════════════════════════════════════

describe('webhook Telegram', () => {
  const url = 'https://jawebflow.test/api/webhook/telegram?key=TG_KEY_1';
  const headers = { 'x-telegram-bot-api-secret-token': TG_SECRET };

  beforeEach(() => seedChannel(fx.supabase, 'telegram'));

  it('GET : répond simplement « ok » (pas de challenge chez Telegram)', async () => {
    const res = await callGet(telegramGet, 'https://jawebflow.test/api/webhook/telegram');
    expect(res.status).toBe(200);
  });

  it('POST : le secret_token de Telegram est exigé (401 sinon)', async () => {
    const res = await deliver(telegramPost, url, telegramUpdate(), ENV_CHANNELS);
    expect(res.status).toBe(401);
    expect(fx.telegram.calls).toHaveLength(0);
  });

  it('POST valide : la réponse part vers le bon bot et le bon chat', async () => {
    gemini.next(modelReply(textPart('Salam ! On est ouverts de 9h à 18h.')));
    const res = await deliver(telegramPost, url, telegramUpdate({ text: 'Vous êtes ouverts ?', chatId: '777888' }), ENV_CHANNELS, headers);
    expect(res.status).toBe(200);

    const sent = fx.telegram.sent();
    expect(sent).toHaveLength(1);
    expect(fx.telegram.tokenOf(sent[0])).toBe('TG_TOKEN_TEST'); // le jeton est DANS l’URL
    expect(sent[0].body.chat_id).toBe('777888');
    expect(sent[0].body.disable_web_page_preview).toBe(true);
    expect(sent[0].body.text).toContain('9h à 18h');
  });

  it('le routage se fait par la clé d’URL : une mauvaise clé = aucune intégration, aucune réponse', async () => {
    gemini.next(modelReply(textPart('ne doit pas partir')));
    await deliver(telegramPost, 'https://jawebflow.test/api/webhook/telegram?key=MAUVAISE', telegramUpdate(), ENV_CHANNELS, headers);
    expect(fx.telegram.calls).toHaveLength(0);
  });

  it('un message de bot est ignoré (deux bots ne se répondent pas)', async () => {
    await deliver(telegramPost, url, telegramUpdate({ isBot: true }), ENV_CHANNELS, headers);
    expect(fx.telegram.calls).toHaveLength(0);
    expect(gemini.calls).toHaveLength(0);
  });

  it('un groupe est ignoré (le bot ne peut pas écrire le premier)', async () => {
    await deliver(telegramPost, url, telegramUpdate({ chatType: 'group' }), ENV_CHANNELS, headers);
    expect(fx.telegram.calls).toHaveLength(0);
  });

  it('une réponse de plus de 4 096 caractères est découpée', async () => {
    gemini.next(modelReply(textPart('mot '.repeat(1200).trim())));
    await deliver(telegramPost, url, telegramUpdate({ text: 'Explique', messageId: 42 }), ENV_CHANNELS, headers);
    const sent = fx.telegram.sent();
    expect(sent.length).toBeGreaterThan(1);
    sent.forEach((c) => expect(String(c.body.text).length).toBeLessThanOrEqual(4096));
  });

  it('deux clients différents ayant tous les deux « message_id 1 » sont bien DEUX personnes', async () => {
    gemini.next(modelReply(textPart('Bonjour Sara')), modelReply(textPart('Bonjour Karim')));
    await deliver(telegramPost, url, telegramUpdate({ chatId: '111', messageId: 1 }), ENV_CHANNELS, headers);
    await deliver(telegramPost, url, telegramUpdate({ chatId: '222', messageId: 1, updateId: 2 }), ENV_CHANNELS, headers);
    expect(fx.telegram.sent()).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIKTOK — gratuit, mais accès à confirmer (voir docs/QUELS_CANAUX.md)
// ═══════════════════════════════════════════════════════════════════════════

describe('webhook TikTok', () => {
  const url = 'https://jawebflow.test/api/webhook/tiktok?key=TT_BIZ_1';

  beforeEach(() => seedChannel(fx.supabase, 'tiktok'));

  it('GET : répond « ok »', async () => {
    const res = await callGet(tiktokGet, 'https://jawebflow.test/api/webhook/tiktok');
    expect(res.status).toBe(200);
  });

  it('POST sans signature HMAC valide → 401', async () => {
    const res = await deliver(tiktokPost, url, tiktokEvent(), ENV_CHANNELS, { 'TikTok-Signature': 'deadbeef' });
    expect(res.status).toBe(401);
    expect(fx.tiktok.calls).toHaveLength(0);
  });

  it('POST signé : la réponse part par la Business Messaging API', async () => {
    const { hmacSha256Hex } = await import('../functions/_shared/channels/signature');
    gemini.next(modelReply(textPart('Salam ! Oui, on expédie partout en Algérie.')));

    const payload = tiktokEvent({ text: 'Vous expédiez ?', senderId: 'TT_USER_9' });
    const raw = JSON.stringify(payload);
    const headers = { 'TikTok-Signature': await hmacSha256Hex(ENV_CHANNELS.TIKTOK_APP_SECRET, raw) };
    const res = await deliver(tiktokPost, url, payload, ENV_CHANNELS, headers);
    expect(res.status).toBe(200);

    const sent = fx.tiktok.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0].auth).toBe('TT_TOKEN_1'); // en-tête Access-Token
    expect(sent[0].body.business_id).toBe(TT_BIZ_ID);
    expect(sent[0].body.recipient).toEqual({ user_id: 'TT_USER_9' });
    expect(sent[0].body.message.content).toContain('partout en Algérie');
  });

  it('une charge utile inconnue ne déclenche rien et ne casse rien', async () => {
    const { hmacSha256Hex } = await import('../functions/_shared/channels/signature');
    const payload = { events: [{ event: 'STATS_UPDATE', value: 42 }] };
    const raw = JSON.stringify(payload);
    const res = await deliver(tiktokPost, url, payload, ENV_CHANNELS, { 'TikTok-Signature': await hmacSha256Hex(ENV_CHANNELS.TIKTOK_APP_SECRET, raw) });
    expect(res.status).toBe(200);
    expect(fx.tiktok.calls).toHaveLength(0);
    expect(gemini.calls).toHaveLength(0);
  });
});
