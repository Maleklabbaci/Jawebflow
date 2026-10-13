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
import * as siteVoiceApi from '../functions/api/site-voice';
import * as voiceReport from '../functions/api/voice/report';
import * as leadApi from '../functions/api/voice/lead';
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

    // 🧩 ARCHITECTURE RAG MULTI-TENANT : les instructions système ne portent que
    // les RÈGLES (identité, ton, langues, interdits) — aucune donnée du commerce.
    const sent = JSON.parse(String(fx.external.calls[0].init.body));
    const prompt = sent.systemInstruction.parts[0].text;
    expect(prompt).toContain("Tu n'inventes jamais un prix");
    expect(prompt).toContain('RÈGLES ABSOLUES');
    expect(prompt).not.toContain("JAWEBFLOW — l'essentiel"); // ← plus de base dans les instructions
    expect(prompt).not.toMatch(/Basic.*10 \$/);
    expect(prompt).not.toContain('BASE DE CONNAISSANCE');
    expect(sent.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    // …et les données du client voyagent DANS LE MESSAGE, tour par tour.
    const dernierTour = sent.contents[sent.contents.length - 1];
    expect(dernierTour.role).toBe('user');
    expect(dernierTour.parts[0].text).toContain('<contexte_client');
    expect(dernierTour.parts[0].text).toContain("JAWEBFLOW — l'essentiel");
    expect(dernierTour.parts[0].text).toContain('QUESTION DU VISITEUR');
    // 📇 Le contact de l'équipe est une DONNÉE : elle voyage ici aussi…
    expect(dernierTour.parts[0].text).toContain('contact@jawebflow.dz');
    expect(prompt).not.toContain('contact@jawebflow.dz');   // …jamais dans les instructions
    // L'historique est transmis : le bot garde le fil de la discussion.
    expect(sent.contents.length).toBe(3);
    expect(sent.contents[0].role).toBe('user');
  });

  it('question HORS SUJET : aucune donnée du site n’est envoyée (le bot refuse, il ne répond pas « à côté »)', async () => {
    fx.external.handler = () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Je m’occupe uniquement de JawebFlow.' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await post({ message: 'qui a gagné le match de hier ?' }, { 'CF-Connecting-IP': '10.0.0.41' }, {
      ...ENV,
      GEMINI_API_KEY: 'GEMINI_TEST_KEY',
    });

    const sent = JSON.parse(String(fx.external.calls[0].init.body));
    const contexte = sent.contents[sent.contents.length - 1].parts[0].text;
    expect(contexte).toContain('<contexte_client');
    expect(contexte).toContain('aucun extrait de notre base');
    expect(contexte).not.toContain("JAWEBFLOW — l'essentiel");   // aucune fiche pour un hors-sujet
    // …et la règle interdit désormais de donner un élément de réponse.
    const prompt = sent.systemInstruction.parts[0].text;
    expect(prompt).toContain('Tu ne sors JAMAIS du sujet JawebFlow');
    expect(prompt).toContain('AUCUN élément de réponse');
  });

  it('question vague (« salut ») : la base part quand même (le visiteur écrit sans contexte)', async () => {
    fx.external.handler = () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Salam !' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await post({ message: 'salut' }, { 'CF-Connecting-IP': '10.0.0.42' }, {
      ...ENV,
      GEMINI_API_KEY: 'GEMINI_TEST_KEY',
    });

    const sent = JSON.parse(String(fx.external.calls[0].init.body));
    const contexte = sent.contents[sent.contents.length - 1].parts[0].text;
    expect(contexte).toContain("JAWEBFLOW — l'essentiel");
    expect(contexte).not.toContain('aucun extrait de notre base');
  });

  it('question hors base : le contexte le DIT (pas de trou silencieux dans le prompt)', async () => {
    fx.external.handler = () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Je ne sais pas.' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await post({ message: 'vous réparez les motos ?' }, { 'CF-Connecting-IP': '10.0.0.31' }, {
      ...ENV,
      GEMINI_API_KEY: 'GEMINI_TEST_KEY',
    });

    const sent = JSON.parse(String(fx.external.calls[0].init.body));
    const contexte = sent.contents[sent.contents.length - 1].parts[0].text;
    expect(contexte).toContain('<contexte_client');
    expect(contexte).toContain('QUESTION DU VISITEUR');
    // Question qui ne recoupe rien ET qui n'est pas une question pratique :
    // aucune fiche du site ne part — le bot dit honnêtement qu'il ne sait pas.
    expect(contexte).toContain('aucun extrait de notre base');
    expect(contexte).not.toContain("JAWEBFLOW — l'essentiel");
  });

  it('base vide : le contexte le dit noir sur blanc (pas de prompt muet)', async () => {
    const { buildSiteChatContext } = await import('../functions/_shared/site-chat');
    const bloc = buildSiteChatContext('');
    expect(bloc).toContain('<contexte_client');
    expect(bloc).toContain('aucun extrait de notre base ne correspond');
    expect(buildSiteChatContext('   ')).toContain('aucun extrait');
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
    expect(config.widget.mode).toBe('voice'); // « le bot qui appelle » est permis
    expect(config.widget.voice.maxMinutes).toBe(5); // réglage d'appel par défaut
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
    expect(json.error).toContain('platform_settings');
    expect(json.error).toContain('n’existe pas');
    // …et surtout : la console dit OÙ exécuter le SQL (le cas n°1 des « j'ai
    // pourtant exécuté le SQL » = un SQL lancé dans un autre projet Supabase).
    expect(json.diag.sql).toContain('create table if not exists public.platform_settings');
    expect(json.diag.sqlEditorUrl).toContain('supabase.com/dashboard/project/');
    expect(json.detail).toContain('PGRST205');
  });
});

describe('l’appel après la mise à jour (réglages enregistrés AVANT que la voix existe)', () => {
  it('un ancien réglage sans clé « voice » laisse le téléphone visible', async () => {
    // Exactement ce que la production contenait avant ce chantier : le bouton
    // d'appel n'existait pas, donc « chat » ne pouvait pas vouloir dire
    // « surtout pas d'appel ». Sinon le téléphone resterait invisible pour
    // toujours après la mise à jour.
    fx.supabase.seed('platform_settings', [
      { id: 'site_chat', data: { enabled: true, widget: { primaryColor: '#9333ea', mode: 'chat' } } },
    ]);
    const json = (await (await get()).json()) as any;
    expect(json.widget.mode).toBe('both');
    expect(json.widget.voice.enabled).toBe(true);
    expect(json.widget.primaryColor).toBe('#9333ea'); // le reste est bien gardé
  });

  it('table existante mais à l’ANCIENNE forme (sans colonne « data ») : le message le dit', async () => {
    // Cas vécu : la table existait déjà, créée par une version précédente →
    // `create table if not exists` ne répare rien, et l'écriture échoue avec
    // PGRST204. Dire « la table n'existe pas » enverrait sur une fausse piste.
    fx.supabase.oldShape.add('platform_settings');

    const read = await get();
    expect(read.status).toBe(200); // le site continue de fonctionner sur les défauts

    const write = await adminPost({ config: { enabled: true } }, 'BEARER_ADMIN');
    const json = (await write.json()) as any;
    expect(write.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('ancienne forme');
    expect(json.error).toContain('colonne');
    expect(json.detail).toContain('PGRST204');
    // …et le SQL donné à copier RÉPARE au lieu de recréer.
    expect(json.diag.sql).toContain('add column if not exists data');
  });

  it('un réglage enregistré depuis la console (avec la voix) est respecté à la lettre', async () => {
    fx.supabase.seed('platform_settings', [
      { id: 'site_chat', data: { enabled: true, widget: { mode: 'chat', voice: { enabled: false } } } },
    ]);
    const json = (await (await get()).json()) as any;
    expect(json.widget.mode).toBe('chat');
    expect(json.widget.voice.enabled).toBe(false);
  });
});

describe('l’appel du site vitrine (« je veux que le bot puisse appeler »)', () => {
  const withKey = { ...ENV, GEMINI_API_KEY: 'GEMINI_TEST_KEY' } as any;

  const call = (body: Record<string, unknown> = {}, env: any = withKey, ip = '20.0.0.1') =>
    siteVoiceApi.onRequestPost({
      request: new Request('https://jawebflow.test/api/site-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body),
      }),
      env,
    });

  it('voix coupée dans la console : l’appel est refusé proprement (pas d’erreur technique)', async () => {
    fx.supabase.seed('platform_settings', [{ id: 'site_chat', data: { widget: { voice: { enabled: false } } } }]);
    const res = await call({}, withKey, '20.0.0.2');
    const json = (await res.json()) as any;
    expect(json.ok).toBe(false);
    expect(json.blocked).toBe(true);
    expect(json.error).toMatch(/pas activé|écrivez-nous/i);
  });

  it('sans clé Gemini : message clair, jamais de jeton', async () => {
    const res = await call({}, ENV, '20.0.0.3');
    const json = (await res.json()) as any;
    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(String(json.error)).toMatch(/clé Gemini|indisponible/i);
  });

  it('voix allumée : jeton éphémère à usage unique + réglages de l’appel', async () => {
    fx.external.handler = (url: URL, init: any) => {
      expect(url.pathname).toContain('/auth_tokens');
      const sent = JSON.parse(String(init.body));
      expect(sent.uses).toBe(1);
      // Le prompt de l'appel contient les règles du téléphone ET la consigne de
      // recherche — mais PLUS la base du site : elle est interrogée à la question.
      const instruction = sent.bidiGenerateContentSetup.systemInstruction.parts[0].text;
      expect(instruction).toContain('TU ES AU TÉLÉPHONE');
      expect(instruction).toContain('chercher_information');
      expect(instruction).not.toContain("JAWEBFLOW — l'essentiel");
      expect(instruction).not.toContain('Basic : 10 $/mois');
      expect(instruction.length).toBeLessThan(5_000);
      const tools = (sent.bidiGenerateContentSetup.tools?.[0]?.functionDeclarations || []).map((d: any) => d.name);
      expect(tools).toContain('chercher_information');
      return new Response(JSON.stringify({ name: 'auth_tokens/TOKEN_SITE', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });
    };

    const res = await call({ sessionId: 'site_test' }, withKey, '20.0.0.4');
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.wsUrl).toContain('TOKEN_SITE');
    expect(json.setup).toBeTruthy();
    expect(json.maxSeconds).toBe(300);
    expect(json.greeting).toContain('JawebFlow');
    expect(json.assistantId).toBe('jawebflow_site');
    // La clé Gemini ne sort jamais du serveur.
    expect(JSON.stringify(json)).not.toContain('GEMINI_TEST_KEY');
  });

  it('deuxième essai du navigateur (`fallback`) : jeton sur le couple historique', async () => {
    const seen: string[] = [];
    fx.external.handler = (url: URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ name: 'auth_tokens/TOKEN_SITE', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });
    };

    // Le widget du site a déjà été fermé une fois : il redemande un jeton en
    // précisant `fallback`. On lui donne la MÊME porte, sur l'autre version.
    const res = await call({ fallback: true }, withKey, '20.0.0.6');
    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/v1alpha/auth_tokens');
    // ⚠️ Jamais la porte sans « Constrained » : un jeton éphémère n'y a pas
    // d'identité (« Method doesn't allow unregistered callers »).
    expect(json.wsUrl).toContain('BidiGenerateContentConstrained');
    expect(json.wsUrl).toContain('.v1alpha.GenerativeService.');
    expect(json.setup.setup.model).toBe(`models/${json.model}`);
    expect(json.model).toBe('gemini-3.8-live');
  });

  it('anti-abus : 6 appels par IP et par 10 minutes, pas plus', async () => {
    fx.external.handler = () =>
      new Response(JSON.stringify({ name: 'auth_tokens/T', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });
    for (let i = 0; i < 6; i += 1) {
      const ok = await call({}, withKey, '20.0.0.5');
      expect(ok.status).toBe(200);
    }
    const blocked = await call({}, withKey, '20.0.0.5');
    expect(((await blocked.json()) as any).blocked).toBe(true);
  });

  it('le relevé d’un appel du site n’écrit aucun quota (il n’y a pas de marchand)', async () => {
    const res = await voiceReport.onRequestPost({
      request: new Request('https://jawebflow.test/api/voice/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '20.0.0.6' },
        body: JSON.stringify({ assistantId: 'jawebflow_site', seconds: 95, tokensIn: 4000, tokensOut: 3000 }),
      }),
      env: ENV,
    });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.site).toBe(true);
    expect(fx.supabase.rows('conversation_contexts').length).toBe(0);
  });
});

describe('les règles écrites du chatbot du site', () => {
  it('impose les langues du propriétaire et interdit les autres', async () => {
    const { STRICT_LANGUAGES_RULE, CARD_STYLE_RULE } = await import('../functions/_shared/site-chat');
    const { buildSiteChatPrompt, DEFAULT_SITE_CHAT } = await import('../functions/_shared/site-chat');
    const prompt = buildSiteChatPrompt(DEFAULT_SITE_CHAT);
    expect(prompt).toContain(STRICT_LANGUAGES_RULE);
    expect(prompt).toContain(CARD_STYLE_RULE);
    expect(STRICT_LANGUAGES_RULE).toMatch(/espagnol/i);
    expect(CARD_STYLE_RULE).toMatch(/CARTE/);
    expect(CARD_STYLE_RULE).toMatch(/3 à 5 puces/);
  });
});

describe('qui mène la conversation (réglage du propriétaire)', () => {
  it('par défaut, l’assistant guide le visiteur (comportement historique, explicite)', async () => {
    const { buildSiteChatPrompt, DEFAULT_SITE_CHAT } = await import('../functions/_shared/site-chat');
    const { BOT_LED_RULE } = await import('../functions/_shared/prompt');
    expect(DEFAULT_SITE_CHAT.ai.conversationMode).toBe('bot');
    const prompt = buildSiteChatPrompt(DEFAULT_SITE_CHAT);
    expect(prompt).toContain(BOT_LED_RULE);
    expect(BOT_LED_RULE).toMatch(/propose spontanément/);
    // L'invitation à créer son assistant fait partie du mode « il guide ».
    expect(prompt).toMatch(/invites naturellement/);
  });

  it('en mode « c’est le visiteur qui mène », il répond et s’arrête', async () => {
    const { buildSiteChatPrompt, DEFAULT_SITE_CHAT } = await import('../functions/_shared/site-chat');
    const { VISITOR_LED_RULE, BOT_LED_RULE } = await import('../functions/_shared/prompt');
    const config = { ...DEFAULT_SITE_CHAT, ai: { ...DEFAULT_SITE_CHAT.ai, conversationMode: 'visitor' as const } };
    const prompt = buildSiteChatPrompt(config);
    expect(prompt).toContain(VISITOR_LED_RULE);
    expect(VISITOR_LED_RULE).toMatch(/AUCUNE proposition non demandée/);
    expect(prompt).not.toContain(BOT_LED_RULE);
    expect(prompt).not.toMatch(/invites naturellement/);
    expect(prompt).toMatch(/C'est lui qui décide de la suite/);
  });

  it('une valeur inconnue retombe sur « il guide » (jamais de prompt cassé)', async () => {
    const { normalizeSiteChat, DEFAULT_SITE_CHAT } = await import('../functions/_shared/site-chat');
    const normalized = normalizeSiteChat({ ai: { conversationMode: 'n_importe_quoi' } } as any);
    expect(normalized.ai.conversationMode).toBe('bot');
    expect(normalized.ai.knowledge).toBe(DEFAULT_SITE_CHAT.ai.knowledge);
    const forced = normalizeSiteChat({ ai: { conversationMode: 'visitor' } } as any);
    expect(forced.ai.conversationMode).toBe('visitor');
  });
});

describe('les demandes notées pendant les appels du site (console)', () => {
  const postLead = (body: unknown) =>
    leadApi.onRequestPost({
      request: new Request('https://jawebflow.test/api/voice/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '20.0.0.9' },
        body: JSON.stringify(body),
      }),
      env: ENV,
    });

  it('une demande notée arrive dans la console, puis se marque « traitée »', async () => {
    const saved = await postLead({ site: true, sessionId: 'sv_1', args: { nom: 'Karim', telephone: '0555112233', besoin: 'un agent vocal', type_demande: 'rendez-vous', date: 'jeudi 14h' } });
    expect(((await saved.json()) as any).ok).toBe(true);

    const first = (await (await adminGet('BEARER_ADMIN')).json()) as any;
    expect(first.leadCount).toBe(1);
    expect(first.newLeadCount).toBe(1);
    expect(first.leads[0]).toMatchObject({ name: 'Karim', phone: '0555112233', status: 'nouveau', date: 'jeudi 14h' });

    const marked = await adminPost({ action: 'mark-lead', id: first.leads[0].id, status: 'traite' }, 'BEARER_ADMIN');
    expect(marked.status).toBe(200);
    const after = (await marked.json()) as any;
    expect(after.ok).toBe(true);
    expect(after.leads[0].status).toBe('traite');
  });

  it('un marchand connecté ne peut ni lire ni marquer ces demandes', async () => {
    const res = await adminGet('BEARER_CLIENT');
    expect(res.status).toBe(403);
    const mark = await adminPost({ action: 'mark-lead', id: 'lead_x', status: 'traite' }, 'BEARER_CLIENT');
    expect(mark.status).toBe(403);
  });
});
