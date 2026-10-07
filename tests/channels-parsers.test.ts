/**
 * CANAUX — FONCTIONS PURES
 * ============================================================================
 * Règle du dépôt (DEV.md §2) : « un changement de comportement = une fonction
 * pure + un test ». Ce fichier teste tout ce qui décide SANS réseau :
 *   • l'authenticité des webhooks (sinon n'importe qui ferait dépenser l'IA) ;
 *   • la lecture des accusés de livraison (c'est la facture du client) ;
 *   • le quota WhatsApp (1000 → 1001ᵉ message bloqué) ;
 *   • le découpage des réponses longues.
 */

import { describe, expect, it } from 'vitest';
import { metaChallenge, metaSignature, hmacSha256Hex, timingSafeEqual, verifyMetaSignature } from '../functions/_shared/channels/signature';
import { messengerChannel, parseMessengerEvent } from '../functions/_shared/channels/messenger';
import { whatsappChannel, cameFromAd, whatsappText } from '../functions/_shared/channels/whatsapp';
import { telegramChannel, parseTelegramUpdate, TELEGRAM_MAX_LENGTH } from '../functions/_shared/channels/telegram';
import { tiktokChannel, parseTikTokEvent, TIKTOK_MAX_LENGTH } from '../functions/_shared/channels/tiktok';
import { splitForLimit } from '../functions/_shared/channels/types';
import {
  waQuotaAvailable,
  waQuotaForPlan,
  waQuotaWarning,
  WHATSAPP_MESSAGES_PER_PLAN,
} from '../functions/_shared/channels/metering';
import { channelCostsMoney, channelLabel, getChannel } from '../functions/_shared/channels/registry';
import {
  ENV_CHANNELS, PAGE_ID, PSID, TG_SECRET, TT_BIZ_ID, WA_CUSTOMER, WA_PHONE_ID,
  messengerDelivery, messengerEvent, telegramUpdate, tiktokEvent, whatsappMessage, whatsappStatus,
} from './helpers/fakes';

// ═══════════════════════════════════════════════════════════════════════════
// 1. SIGNATURES — échec fermé obligatoire
// ═══════════════════════════════════════════════════════════════════════════

describe('signature des webhooks Meta', () => {
  const body = JSON.stringify({ object: 'page', entry: [] });
  const secret = 'APP_SECRET_TEST';

  it('accepte la signature exacte de Meta', async () => {
    const header = await metaSignature(secret, body);
    expect(await verifyMetaSignature(body, header, secret)).toBe(true);
  });

  it('refuse un corps modifié d’un seul caractère', async () => {
    const header = await metaSignature(secret, body);
    expect(await verifyMetaSignature(body + ' ', header, secret)).toBe(false);
  });

  it('refuse un en-tête absent, mal formé, ou signé avec un autre secret', async () => {
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
    expect(await verifyMetaSignature(body, 'abcd', secret)).toBe(false);
    expect(await verifyMetaSignature(body, await metaSignature('AUTRE', body), secret)).toBe(false);
  });

  it('ÉCHOUE FERMÉ : sans secret configuré, rien ne passe (même une signature valide)', async () => {
    const header = await metaSignature(secret, body);
    expect(await verifyMetaSignature(body, header, undefined)).toBe(false);
    expect(await verifyMetaSignature(body, header, '')).toBe(false);
  });

  it('la comparaison est à durée constante (longueurs différentes → faux)', async () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('HMAC-SHA256 : vecteur de référence', async () => {
    // Vecteur RFC 4231 (clé « key », message « The quick brown fox jumps over the lazy dog »)
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'))
      .toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
});

describe('challenge de vérification Meta (GET du webhook)', () => {
  const url = (q: string) => new URL(`https://jawebflow.test/api/webhook/messenger?${q}`);

  it('renvoie le challenge quand le jeton correspond', () => {
    const res = metaChallenge(url('hub.mode=subscribe&hub.verify_token=VERIFY_1&hub.challenge=12345'), ENV_CHANNELS);
    expect(res).toEqual({ status: 200, body: '12345' });
  });

  it('refuse (403) un mauvais jeton', () => {
    const res = metaChallenge(url('hub.mode=subscribe&hub.verify_token=MAUVAIS&hub.challenge=12345'), ENV_CHANNELS);
    expect(res?.status).toBe(403);
  });

  it('refuse (503) quand aucun jeton n’est configuré côté serveur', () => {
    const res = metaChallenge(url('hub.mode=subscribe&hub.verify_token=VERIFY_1&hub.challenge=12345'), {});
    expect(res?.status).toBe(503);
  });

  it('ne répond rien si ce n’est pas un challenge', () => {
    expect(metaChallenge(url('hub.mode=subscribe'), ENV_CHANNELS)).toBeNull();
    expect(metaChallenge(url(''), ENV_CHANNELS)).toBeNull();
  });
});

describe('signature Telegram et TikTok', () => {
  it('Telegram : accepte le bon en-tête, refuse le reste (échec fermé)', async () => {
    const headers = (v?: string) => new Headers(v ? { 'x-telegram-bot-api-secret-token': v } : {});
    expect(await telegramChannel.verify!('{}', headers(TG_SECRET), ENV_CHANNELS)).toBe(true);
    expect(await telegramChannel.verify!('{}', headers('MAUVAIS'), ENV_CHANNELS)).toBe(false);
    expect(await telegramChannel.verify!('{}', headers(), ENV_CHANNELS)).toBe(false);
    expect(await telegramChannel.verify!('{}', headers(TG_SECRET), {})).toBe(false);
  });

  it('TikTok : HMAC en hexadécimal, brut ou sous la forme `t=…,s=…`', async () => {
    const body = JSON.stringify({ events: [] });
    const hex = await hmacSha256Hex(ENV_CHANNELS.TIKTOK_APP_SECRET, body);
    expect(await tiktokChannel.verify!(body, new Headers({ 'TikTok-Signature': hex }), ENV_CHANNELS)).toBe(true);
    expect(await tiktokChannel.verify!(body, new Headers({ 'TikTok-Signature': `t=1760000000,s=${hex}` }), ENV_CHANNELS)).toBe(true);
    expect(await tiktokChannel.verify!(body, new Headers({ 'TikTok-Signature': 'deadbeef' }), ENV_CHANNELS)).toBe(false);
    expect(await tiktokChannel.verify!(body, new Headers(), ENV_CHANNELS)).toBe(false);
    expect(await tiktokChannel.verify!(body, new Headers({ 'TikTok-Signature': hex }), {})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MESSENGER
// ═══════════════════════════════════════════════════════════════════════════

describe('canal Messenger — lecture des messages', () => {
  it('lit un message texte, avec le nom du contact et l’identifiant de la page', () => {
    const [m] = messengerChannel.parseInbound(messengerEvent({ text: 'C’est combien ?' }));
    expect(m).toMatchObject({
      channel: 'messenger', accountId: PAGE_ID, contactId: PSID,
      text: 'C’est combien ?', kind: 'message',
    });
    expect(m.messageId).toContain('mid');
  });

  it('lit un clic de bouton (`postback`)', () => {
    const [m] = messengerChannel.parseInbound(messengerEvent({ postback: 'Voir les prix' }));
    expect(m.text).toBe('Voir les prix');
    expect(m.kind).toBe('postback');
  });

  it('IGNORE notre propre message (`is_echo`) — sinon le bot se répondrait à lui-même', () => {
    expect(messengerChannel.parseInbound(messengerEvent({ isEcho: true }))).toEqual([]);
  });

  it('détecte une conversation venue d’une publicité (fenêtre gratuite)', () => {
    const [ad] = messengerChannel.parseInbound(messengerEvent({ text: 'Vu sur votre pub', referral: true }));
    expect(ad.fromAd).toBe(true);
    const [normal] = messengerChannel.parseInbound(messengerEvent({ text: 'Bonjour' }));
    expect(normal.fromAd).toBe(false);
  });

  it('ignore ce qui n’est pas un message (aucune exception sur une charge utile vide)', () => {
    expect(parseMessengerEvent(null)).toBeNull();
    expect(messengerChannel.parseInbound({})).toEqual([]);
    expect(messengerChannel.parseInbound({ entry: [{ id: PAGE_ID, messaging: [{ sender: { id: PSID } }] }] })).toEqual([]);
  });

  it('lit les accusés de livraison (préparation de la future facturation Meta)', () => {
    const events = messengerChannel.parseStatuses!(messengerDelivery({ mid: 'mid_x', billable: true, category: 'service' }));
    expect(events).toEqual([{ channel: 'messenger', accountId: PAGE_ID, messageId: 'mid_x', billable: true, category: 'service' }]);
  });

  it('sans objet `pricing`, le message est réputé gratuit (Messenger l’est aujourd’hui)', () => {
    const [e] = messengerChannel.parseStatuses!(messengerDelivery({ mid: 'mid_y' }));
    expect(e.billable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. WHATSAPP — le canal payant
// ═══════════════════════════════════════════════════════════════════════════

describe('canal WhatsApp — lecture des messages', () => {
  it('lit un texte, le nom du contact et le numéro de l’ENTREPRISE (clé de routage)', () => {
    const [m] = whatsappChannel.parseInbound(whatsappMessage({ text: 'Salam' }));
    expect(m).toMatchObject({
      channel: 'whatsapp', accountId: WA_PHONE_ID, contactId: WA_CUSTOMER,
      contactName: 'Sara', text: 'Salam', kind: 'message',
    });
  });

  it('lit un bouton, une réponse interactive et la légende d’une image', () => {
    expect(whatsappText({ button: { text: 'Oui' } })).toBe('Oui');
    expect(whatsappText({ interactive: { button_reply: { title: 'Non' } } })).toBe('Non');
    expect(whatsappText({ interactive: { list_reply: { title: 'Livraison' } } })).toBe('Livraison');
    expect(whatsappText({ image: { caption: 'Ce modèle' } })).toBe('Ce modèle');
    expect(whatsappText({ image: { id: 'x' } })).toBe('[image]');
    expect(whatsappText({ audio: { id: 'x' } })).toBe('[audio]');
    expect(whatsappText({ document: { id: 'x' } })).toBe('[document]');
    expect(whatsappText({})).toBe('');
  });

  it('détecte une conversation venue d’une publicité click-to-WhatsApp', () => {
    expect(cameFromAd({ referral: { source_url: 'https://fb.me/ad' } })).toBe(true);
    expect(cameFromAd({})).toBe(false);
    const [ad] = whatsappChannel.parseInbound(whatsappMessage({ referral: true }));
    expect(ad.fromAd).toBe(true);
  });

  it('les messages entrants sont marqués gratuits ? — ils ne portent aucun `pricing` : on n’en invente aucun', () => {
    const [m] = whatsappChannel.parseInbound(whatsappMessage());
    expect(m).not.toHaveProperty('billable');
  });
});

describe('WhatsApp — accusés de livraison = LA FACTURE', () => {
  it('ne compte QUE la livraison (un `sent` ou un `failed` n’est pas facturé)', () => {
    expect(whatsappChannel.parseStatuses!(whatsappStatus({ status: 'sent', billable: true }))).toEqual([]);
    expect(whatsappChannel.parseStatuses!(whatsappStatus({ status: 'failed', billable: true }))).toEqual([]);
    expect(whatsappChannel.parseStatuses!(whatsappStatus({ status: 'read', billable: true }))).toEqual([]);
    expect(whatsappChannel.parseStatuses!(whatsappStatus({ status: 'delivered', billable: true }))).toHaveLength(1);
  });

  it('recopie `pricing.billable` tel quel : facturé / gratuit', () => {
    const [paye] = whatsappChannel.parseStatuses!(whatsappStatus({ id: 'wamid.A', billable: true, category: 'service' }));
    expect(paye).toEqual({ channel: 'whatsapp', accountId: WA_PHONE_ID, messageId: 'wamid.A', billable: true, category: 'service' });

    const [gratuit] = whatsappChannel.parseStatuses!(whatsappStatus({ id: 'wamid.B', billable: false, category: 'service' }));
    expect(gratuit.billable).toBe(false);
  });

  it('sans objet `pricing` (Meta n’en envoie pas toujours), le message n’est PAS compté comme facturé', () => {
    const [e] = whatsappChannel.parseStatuses!(whatsappStatus({ id: 'wamid.C' }));
    expect(e.billable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. TELEGRAM (banc d’essai)
// ═══════════════════════════════════════════════════════════════════════════

describe('canal Telegram', () => {
  it('lit un message privé', () => {
    const [m] = telegramChannel.parseInbound(telegramUpdate({ text: 'Salam' }), { accountId: 'TG_KEY_1' });
    expect(m).toMatchObject({ channel: 'telegram', accountId: 'TG_KEY_1', contactId: '555111222', contactName: 'Sara', text: 'Salam' });
    expect(m.messageId).toBe('1');
  });

  it('IGNORE les messages d’un bot (deux bots ne se répondent pas)', () => {
    expect(parseTelegramUpdate(telegramUpdate({ isBot: true }))).toBeNull();
  });

  it('IGNORE les groupes : le bot ne peut pas écrire le premier', () => {
    expect(parseTelegramUpdate(telegramUpdate({ chatType: 'group' }))).toBeNull();
    expect(parseTelegramUpdate(telegramUpdate({ chatType: 'supergroup' }))).toBeNull();
  });

  it('traite un bouton cliqué comme un message', () => {
    const [m] = telegramChannel.parseInbound(telegramUpdate({ callback: 'OUI' }), { accountId: 'TG_KEY_1' });
    expect(m.text).toBe('OUI');
    expect(m.kind).toBe('postback');
  });

  it('accepte aussi un lot d’« updates » et n’explose sur rien', () => {
    const batch = telegramChannel.parseInbound([telegramUpdate({ text: 'A' }), telegramUpdate({ text: 'B', updateId: 2 })], { accountId: 'K' });
    expect(batch.map((m) => m.text)).toEqual(['A', 'B']);
    expect(parseTelegramUpdate(undefined)).toBeNull();
    expect(parseTelegramUpdate({})).toBeNull();
    expect(telegramChannel.parseInbound({}, { accountId: 'K' })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. TIKTOK (parseur tolérant — accès non encore accordé)
// ═══════════════════════════════════════════════════════════════════════════

describe('canal TikTok — parseur tolérant', () => {
  it('lit un texte à plat', () => {
    const [m] = tiktokChannel.parseInbound(tiktokEvent({ text: 'C’est combien ?' }), { accountId: TT_BIZ_ID });
    expect(m).toMatchObject({ channel: 'tiktok', accountId: TT_BIZ_ID, contactId: 'TT_USER_1', contactName: 'Sara', text: 'C’est combien ?' });
  });

  it('lit aussi une forme imbriquée `message: { text }` (et n’écrit jamais « [object Object] »)', () => {
    const [m] = tiktokChannel.parseInbound(tiktokEvent({ text: 'Bonjour', nested: true }), { accountId: TT_BIZ_ID });
    expect(m.text).toBe('Bonjour');
  });

  it('n’écrase pas `accountId` si la charge utile en contient un', () => {
    const [m] = tiktokChannel.parseInbound({ business_id: 'TT_BIZ_9', events: tiktokEvent().events });
    expect(m.accountId).toBe('TT_BIZ_9');
  });

  it('ne plante sur RIEN : charge utile inconnue, vide, ou d’un autre type', () => {
    expect(parseTikTokEvent(null)).toBeNull();
    expect(parseTikTokEvent({ event: 'COMMENT_CREATED' })).toBeNull();
    expect(tiktokChannel.parseInbound({})).toEqual([]);
    expect(tiktokChannel.parseInbound({ events: [{ event: 'STATS' }, { event: 'MESSAGE_RECEIVED' }] }, { accountId: 'K' })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. QUOTA WHATSAPP (décision commerciale : Pro 1 000 / Enterprise 5 000)
// ═══════════════════════════════════════════════════════════════════════════

describe('forfait WhatsApp par plan', () => {
  it('Basic et Découverte : 0 message (WhatsApp n’y est pas vendu)', () => {
    expect(waQuotaForPlan('free')).toBe(0);
    expect(waQuotaForPlan('basic')).toBe(0);
    expect(WHATSAPP_MESSAGES_PER_PLAN.basic).toBe(0);
  });

  it('Pro : 1 000 — Enterprise : 5 000', () => {
    expect(waQuotaForPlan('pro')).toBe(1000);
    expect(waQuotaForPlan('enterprise')).toBe(5000);
  });

  it('le 1 000ᵉ message passe, le 1 001ᵉ est refusé', () => {
    expect(waQuotaAvailable('pro', 999)).toBe(true);
    expect(waQuotaAvailable('pro', 1000)).toBe(false);
    expect(waQuotaAvailable('pro', 1001)).toBe(false);
  });

  it('une recharge prépayée rouvre le forfait', () => {
    expect(waQuotaAvailable('pro', 1000, 500)).toBe(true);
    expect(waQuotaAvailable('pro', 1500, 500)).toBe(false);
  });

  it('un plan inconnu ne donne aucun droit (on n’offre pas WhatsApp par erreur)', () => {
    expect(waQuotaForPlan('')).toBe(0);
    expect(waQuotaForPlan('plan-bidon')).toBe(0);
    expect(waQuotaAvailable('plan-bidon', 0)).toBe(false);
  });

  it('alerte le marchand à 80 % puis à 100 %', () => {
    expect(waQuotaWarning('pro', 700)).toBeNull();
    expect(waQuotaWarning('pro', 800)).toContain('80 %');
    expect(waQuotaWarning('pro', 800)).toContain('800/1000');
    expect(waQuotaWarning('pro', 1000)).toContain('épuisé');
    expect(waQuotaWarning('basic', 10)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. REGISTRE, LONGUEURS, DÉCOUPAGE
// ═══════════════════════════════════════════════════════════════════════════

describe('registre des canaux', () => {
  it('les 4 canaux sont enregistrés et retrouvables', () => {
    for (const id of ['messenger', 'whatsapp', 'telegram', 'tiktok']) {
      expect(getChannel(id)?.id).toBe(id);
    }
    expect(getChannel('inconnu')).toBeNull();
  });

  it('un seul canal coûte de l’argent : WhatsApp', () => {
    expect(channelCostsMoney('whatsapp')).toBe(true);
    expect(channelCostsMoney('messenger')).toBe(false);
    expect(channelCostsMoney('telegram')).toBe(false);
    expect(channelCostsMoney('tiktok')).toBe(false);
  });

  it('les libellés sont lisibles (journal, diagnostics)', () => {
    expect(channelLabel('messenger')).toBe('Facebook Messenger');
    expect(channelLabel('instagram')).toBe('Instagram');
    expect(channelLabel('web')).toBe('Widget web');
  });

  it('chaque canal annonce la limite de sa plateforme', () => {
    expect(messengerChannel.maxLength).toBe(2000);
    expect(whatsappChannel.maxLength).toBe(4096);
    expect(telegramChannel.maxLength).toBe(TELEGRAM_MAX_LENGTH);
    expect(tiktokChannel.maxLength).toBe(TIKTOK_MAX_LENGTH);
  });
});

describe('découpage des réponses trop longues', () => {
  it('ne touche pas un texte court', () => {
    expect(splitForLimit('Bonjour', 100)).toEqual(['Bonjour']);
  });

  it('découpe sur un espace et conserve TOUT le texte', () => {
    const text = 'mot '.repeat(60).trim(); // 239 caractères
    const parts = splitForLimit(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(100));
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('découpe un pavé sans espaces (aucune perte)', () => {
    const parts = splitForLimit('a'.repeat(250), 100);
    expect(parts.join('')).toBe('a'.repeat(250));
  });

  it('renvoie un tableau vide pour un texte vide', () => {
    expect(splitForLimit('   ', 100)).toEqual([]);
    expect(splitForLimit('', 100)).toEqual([]);
  });
});
