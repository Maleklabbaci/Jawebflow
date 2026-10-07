/**
 * /api/health — « qu'est-ce qu'il me reste à régler ? »
 * ============================================================================
 * Cette route est la réponse en un clic à cette question. Deux choses doivent
 * être vraies, sinon elle est nuisible :
 *
 *   1. elle ne révèle JAMAIS une valeur (seulement des booléens et des noms) ;
 *   2. elle teste les NOMS EXACTS que le code lit — l'ancienne version testait
 *      `SLICKPAY_PUBLIC_KEY` / `SLICKPAY_SECRET_KEY`, des variables que
 *      `functions/api/slickpay.js` ne lit nulle part : elle annonçait donc
 *      « non configuré » même une fois tout en place.
 */

import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/health.js';

const SUPABASE_OK = {
  SUPABASE_URL: 'https://fake.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  VITE_SUPABASE_URL: 'https://fake.supabase.test',
  VITE_SUPABASE_ANON_KEY: 'eyJanon',
};

const call = async (env: Record<string, any>) => {
  const res = await onRequestGet({ env, request: new Request('https://jawebflow.test/api/health') });
  expect(res.status).toBe(200);
  return res.json() as Promise<any>;
};

const COMPLETE = {
  ...SUPABASE_OK,
  GEMINI_API_KEY: 'AIza-cle',
  INSTAGRAM_APP_SECRET: 'secret-meta',
  INSTAGRAM_ACCESS_TOKEN: 'token-ig',
  META_VERIFY_TOKEN: 'verif',
  MESSENGER_PAGE_ACCESS_TOKEN: 'page-token',
  WHATSAPP_ACCESS_TOKEN: 'wa-token',
  WHATSAPP_PHONE_NUMBER_ID: 'PHONE_1',
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_WEBHOOK_SECRET: 'tg-secret',
  TIKTOK_ACCESS_TOKEN: 'tt-token',
  TIKTOK_BUSINESS_ID: 'tt-biz',
  TIKTOK_APP_SECRET: 'tt-secret',
  BREVO_API_KEY: 'brevo',
  EMAIL_SENDER: 'noreply@jawebflow.dz',
  SLICKPAY_API_KEY: 'SP_SK_9911_Secret',
  CRON_SECRET: 'cron',
  FIREBASE_SERVICE_ACCOUNT: '{"type":"service_account"}',
};

describe('/api/health — secrets', () => {
  it('n’expose JAMAIS la valeur d’une clé, même partielle', async () => {
    const body = await call(COMPLETE);
    const brut = JSON.stringify(body);
    for (const secret of ['AIza-cle', 'secret-meta', 'wa-token', 'tg-secret', 'tt-secret', 'SP_SK_9911_Secret', 'eyJanon', 'service-role-key']) {
      expect(brut, `fuite de ${secret}`).not.toContain(secret);
    }
  });

  it('ne renvoie que des booléens pour les intégrations', async () => {
    const body = await call(COMPLETE);
    expect(body.integrations.gemini).toBe(true);
    expect(body.integrations.supabase).toBe(true);
    expect(typeof body.integrations.channels.messenger).toBe('boolean');
  });

  it('un placeholder de .env.example ne compte PAS comme configuré', async () => {
    const body = await call({ ...COMPLETE, GEMINI_API_KEY: 'MY_GEMINI_API_KEY' });
    expect(body.integrations.gemini).toBe(false);
    expect(body.toFix.map((f: any) => f.quoi).join(' ')).toContain('clé IA');

    const autre = await call({ ...COMPLETE, GEMINI_API_KEY: 'your_key_here' });
    expect(autre.integrations.gemini).toBe(false);
  });
});

describe('/api/health — la liste de ce qu’il reste à régler', () => {
  it('serveur vide : tout est signalé, par ordre d’importance', async () => {
    const body = await call({});
    expect(body.integrations.gemini).toBe(false);
    expect(body.integrations.supabase).toBe(false);
    expect(body.toFix.length).toBeGreaterThan(5);
    // La base et l'IA d'abord : sans elles, rien ne fonctionne.
    expect(body.toFix[0].quoi).toContain('page blanche');
    expect(body.toFix[2].quoi).toContain('clé IA');
  });

  it('serveur complet : toFix est vide et le dit', async () => {
    const body = await call(COMPLETE);
    expect(body.toFix).toEqual([]);
    expect(body.note).toContain('Tout est configuré');
  });

  it('nomme EXACTEMENT les variables manquantes (pour les coller dans Cloudflare)', async () => {
    const body = await call({ ...COMPLETE, WHATSAPP_PHONE_NUMBER_ID: undefined });
    const whatsapp = body.toFix.find((f: any) => f.quoi.startsWith('WhatsApp'));
    expect(whatsapp.variables).toContain('WHATSAPP_PHONE_NUMBER_ID');
    expect(whatsapp.ou).toContain('Phone number ID');
  });

  it('l’App Secret Meta est partagé : INSTAGRAM_APP_SECRET suffit aux canaux Meta', async () => {
    const body = await call({ ...COMPLETE, MESSENGER_APP_SECRET: undefined, WHATSAPP_APP_SECRET: undefined });
    expect(body.integrations.channels.messenger).toBe(true);
    expect(body.integrations.channels.whatsapp).toBe(true);
  });

  it('sans App Secret du tout, Messenger et WhatsApp réclament le leur', async () => {
    const body = await call({ ...COMPLETE, INSTAGRAM_APP_SECRET: undefined });
    expect(body.integrations.channels.messenger).toBe(false);
    const messenger = body.toFix.find((f: any) => f.quoi.startsWith('Messenger'));
    expect(messenger.variables.join(' ')).toContain('MESSENGER_APP_SECRET');
  });

  it('« non configuré » pour SlickPay se base sur le nom que le code LIT vraiment', async () => {
    // Régression : l'ancienne route testait SLICKPAY_PUBLIC_KEY/SLICKPAY_SECRET_KEY,
    // jamais lus par functions/api/slickpay.js → faux « non configuré ».
    const avecLesBonsNoms = await call({ ...COMPLETE, SLICKPAY_PUBLIC_KEY: undefined, SLICKPAY_SECRET_KEY: undefined });
    expect(avecLesBonsNoms.integrations.payments.slickpay).toBe(true);

    const avecLesMauvaisNoms = await call({ ...COMPLETE, SLICKPAY_API_KEY: undefined, SLICKPAY_PUBLIC_KEY: 'x', SLICKPAY_SECRET_KEY: 'y' });
    expect(avecLesMauvaisNoms.integrations.payments.slickpay).toBe(false);
    const ligne = avecLesMauvaisNoms.toFix.find((f: any) => f.quoi.includes('SlickPay'));
    expect(ligne.variables).toEqual(['SLICKPAY_API_KEY']); // le nom exact
  });

  it('le repli runtime du site est signalé quand il manque (cause des pages blanches)', async () => {
    const body = await call({ ...COMPLETE, VITE_SUPABASE_URL: undefined, SUPABASE_URL: undefined });
    expect(body.integrations.siteFallback).toBe(false);
    expect(body.toFix[0].quoi).toContain('page blanche');
    expect(body.toFix[0].ou).toContain('Environment variables');
  });

  it('les 4 canaux sont listés séparément (un canal ne dépend pas des autres)', async () => {
    const body = await call({ ...COMPLETE, TELEGRAM_BOT_TOKEN: undefined });
    expect(body.integrations.channels).toEqual({ messenger: true, whatsapp: true, telegram: false, tiktok: true });
    expect(body.toFix.filter((f: any) => f.quoi.startsWith('Telegram'))).toHaveLength(1);
  });
});
