/**
 * 🤖 LE CHATBOT DU SITE VITRINE — /api/site-chat et /api/admin/site-chat
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. le visiteur reçoit les réglages PUBLICS (textes, couleurs, questions) et
 *      JAMAIS la base de connaissance ni les réglages internes ;
 *   2. le chatbot répond toujours quelque chose d'utile : avec l'IA quand la clé
 *      existe, avec la phrase de secours sinon — jamais une erreur brute ;
 *   3. un chat fermé depuis la console ne répond pas (403) ;
 *   4. les réglages ne s'écrivent QUE depuis la console admin (jeton + rôle) ;
 *      un marchand — même connecté — obtient 403 et ne lit rien ;
 *   5. sans la table `platform_settings`, tout dégrade proprement : lecture =
 *      valeurs par défaut, écriture = message qui dit quelle migration passer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as siteChatApi from '../functions/api/site-chat';
import * as adminSiteChatApi from '../functions/api/admin/site-chat';
import { ENV, installFakes } from './helpers/fakes';

const ADMIN = '22222222-2222-4222-8222-222222222222';
const CLIENT = '11111111-1111-4111-8111-111111111111';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  fx.supabase.addUser('BEARER_ADMIN', ADMIN, 'jimmy@jawebflow.dz');
  fx.supabase.addUser('BEARER_CLIENT', CLIENT, 'nour@test.dz');
  fx.supabase.seed('users', [
    { id: ADMIN, email: 'jimmy@jawebflow.dz', role: 'superadmin' },
    { id: CLIENT, email: 'nour@test.dz', role: 'user', plan: 'pro' },
  ]);
});

afterEach(() => fx.restore());

const post = (body: unknown, headers: Record<string, string> = {}, env: any = ENV) =>
  siteChatApi.onRequestPost({
    request: new Request('https://jawebflow.test/api/site-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
  });

const get = () => siteChatApi.onRequestGet({ request: new Request('https://jawebflow.test/api/site-chat'), env: ENV });

const adminGet = (token?: string) =>
  adminSiteChatApi.onRequestGet({
    request: new Request('https://jawebflow.test/api/admin/site-chat', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    env: ENV,
  });

const adminPost = (body: unknown, token?: string) =>
  adminSiteChatApi.onRequestPost({
    request: new Request('https://jawebflow.test/api/admin/site-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    env: ENV,
  });

describe('le site public lit ses réglages', () => {
  it('sans rien de réglé : les valeurs par défaut, prêtes à l’emploi', async () => {
    const res = await get();
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.enabled).toBe(true);
    expect(json.quickPrompts.length).toBeGreaterThan(2);
    expect(json.widget.headerTitle).toContain('JawebFlow');
    expect(json.widget.position).toBe('bottom-right');
  });

  it('ne laisse JAMAIS fuiter la base de connaissance ni les réglages internes', async () => {
    const json = (await (await get()).json()) as any;
    const dump = JSON.stringify(json);
    expect(dump).not.toContain('BASE DE CONNAISSANCE');
    expect(dump).not.toContain('knowledge');
    expect(dump).not.toContain('Découverte : 0 DA');
    expect(json.ai?.knowledge).toBeUndefined();
  });

  it('réglé depuis la console : le visiteur voit exactement ces réglages', async () => {
    fx.supabase.seed('platform_settings', [
      {
        id: 'site_chat',
        data: {
          enabled: true,
          quickPrompts: ['Chhal el prix ?'],
          placeholder: 'Écrivez ici…',
          ai: { enabled: true, tone: 'direct', language: 'darija', knowledge: 'SECRET INTERNE', fallbackReply: 'Écrivez-nous.' },
          contact: { email: 'contact@jawebflow.dz', whatsapp: '+213555000111', whatsappText: 'WhatsApp' },
          widget: {
            headerTitle: 'Assistant Jimmy',
            primaryColor: '#2563eb',
            position: 'bottom-left',
            themeMode: 'light',
            showTeaser: false,
            welcomeMessage: 'Salam, comment je peux aider ?',
            attention: { pulse: false, teaserDelaySeconds: 10, autoOpenSeconds: 0, proactiveText: '', callCtaText: '' },
            customCss: '.lux-chip{color:red}',
          },
        },
      },
    ]);

    const json = (await (await get()).json()) as any;
    expect(json.widget.headerTitle).toBe('Assistant Jimmy');
    expect(json.widget.primaryColor).toBe('#2563eb');
    expect(json.widget.position).toBe('bottom-left');
    expect(json.widget.themeMode).toBe('light');
    expect(json.placeholder).toBe('Écrivez ici…');
    expect(json.quickPrompts).toEqual(['Chhal el prix ?']);
    expect(json.contact.whatsapp).toBe('+213555000111');
    // Le contenu interne, lui, reste au serveur.
    expect(JSON.stringify(json)).not.toContain('SECRET INTERNE');
  });
});

describe('le chatbot répond', () => {
  it('chat fermé depuis la console : il ne répond pas', async () => {
    fx.supabase.seed('platform_settings', [{ id: 'site_chat', data: { enabled: false } }]);
    const res = await post({ message: 'Bonjour' }, { 'CF-Connecting-IP': '10.0.0.1' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).ok).toBe(false);
  });

  it('sans clé Gemini : la phrase de secours réglée, jamais une erreur brute', async () => {
    const res = await post({ message: 'C’est combien ?' }, { 'CF-Connecting-IP': '10.0.0.2' });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.fallback).toBe(true);
    expect(json.text.length).toBeGreaterThan(40);
  });

  it('avec la clé : l’IA répond à partir de la base, et sans réflexion facturée', async () => {
    fx.external.handler = (url: URL) => {
      expect(url.host).toBe('generativelanguage.googleapis.com');
      expect(url.pathname).toContain('gemini-3.1-flash-lite');
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Basic, c’est 10 $ par mois pour 500 conversations.' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await post(
      { message: 'Le tarif ?', history: [{ role: 'user', text: 'salut' }, { role: 'model', text: 'salam' }] },
      { 'CF-Connecting-IP': '10.0.0.3' },
      { ...ENV, GEMINI_API_KEY: 'GEMINI_TEST_KEY' },
    );
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.text).toContain('10 $ par mois');

    // Le prompt envoyé contient bien la base de connaissance et son garde-fou.
    const sent = JSON.parse(String(fx.external.calls[0].init.body));
    const prompt = sent.systemInstruction.parts[0].text;
    expect(prompt).toContain('BASE DE CONNAISSANCE');
    expect(prompt).toContain("JAWEBFLOW — l'essentiel");
    expect(prompt).toContain("Tu n'inventes jamais un prix");
    expect(sent.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    // L'historique est transmis : le bot garde le fil de la discussion.
    expect(sent.contents.length).toBe(3);
    expect(sent.contents[0].role).toBe('user');
  });

  it('un visiteur ne peut pas vider le quota : au-delà de 20 messages, 429', async () => {
    const ip = '10.0.0.9';
    for (let i = 0; i < 20; i += 1) {
      const ok = await post({ message: `question ${i}` }, { 'CF-Connecting-IP': ip });
      expect(ok.status).toBe(200);
    }
    const blocked = await post({ message: 'encore' }, { 'CF-Connecting-IP': ip });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as any).error).toMatch(/Trop de messages/);
  });
});

describe('la console admin règle le chatbot', () => {
  it('sans jeton ou pour un marchand : 403 / 401, aucune donnée', async () => {
    const anonymous = await adminGet();
    expect(anonymous.status).toBe(401);

    const merchant = await adminGet('BEARER_CLIENT');
    expect(merchant.status).toBe(403);
    const dump = JSON.stringify(await merchant.json());
    expect(dump).not.toContain('contact@jawebflow.dz');
    expect(dump).not.toContain('knowledge');
  });

  it('l’admin lit les réglages complets (base de connaissance incluse)', async () => {
    const res = await adminGet('BEARER_ADMIN');
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.stored).toBe(false);
    expect(json.config.ai.knowledge).toContain('JAWEBFLOW');
    expect(json.config.widget.headerTitle).toContain('JawebFlow');
  });

  it('enregistre, borne ce qui dépasse, et relit la même chose', async () => {
    const res = await adminPost(
      {
        config: {
          enabled: false,
          quickPrompts: ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit'],
          ai: { enabled: true, tone: 'n’importe quoi', language: 'kabyle', knowledge: 'x'.repeat(9000), fallbackReply: 'ok' },
          widget: { mode: 'voice', customCss: 'y'.repeat(5000), attention: { teaserDelaySeconds: 9999 } },
        },
      },
      'BEARER_ADMIN',
    );
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const config = json.config;
    expect(config.enabled).toBe(false);
    expect(config.quickPrompts.length).toBe(6);
    expect(config.ai.knowledge.length).toBe(8000);
    expect(config.ai.tone).toBe('pro'); // ton inconnu → valeur sûre
    expect(config.ai.language).toBe('auto'); // langue inconnue → auto
    expect(config.widget.customCss.length).toBe(4000);
    expect(config.widget.mode).toBe('chat'); // pas d'appel sur le site vitrine
    expect(config.widget.attention.teaserDelaySeconds).toBe(120); // délai borné

    // Persisté pour de vrai : un second appel relit les mêmes valeurs.
    const reread = (await (await adminGet('BEARER_ADMIN')).json()) as any;
    expect(reread.stored).toBe(true);
    expect(reread.config.enabled).toBe(false);
    expect(fx.supabase.rows('platform_settings').length).toBe(1);
  });

  it('la réponse d’un admin qui enregistre deux fois ne crée pas de doublon', async () => {
    await adminPost({ config: { placeholder: 'Premier' } }, 'BEARER_ADMIN');
    await adminPost({ config: { placeholder: 'Deuxième' } }, 'BEARER_ADMIN');
    const rows = fx.supabase.rows('platform_settings');
    expect(rows.length).toBe(1);
    expect((rows[0].data as any).placeholder).toBe('Deuxième');
  });

  it('sans la table platform_settings : lecture par défaut, écriture expliquée', async () => {
    fx.supabase.missing.add('platform_settings');

    const read = (await (await adminGet('BEARER_ADMIN')).json()) as any;
    expect(read.ok).toBe(true);
    expect(read.available).toBe(false);
    expect(read.config.widget.headerTitle).toContain('JawebFlow');

    const write = await adminPost({ config: { enabled: true } }, 'BEARER_ADMIN');
    const json = (await write.json()) as any;
    expect(write.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('migration_site_chatbot.sql');
  });
});
