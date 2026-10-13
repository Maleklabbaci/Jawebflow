/**
 * 🎙️ /api/voice/session + /api/voice/report — tests
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. la clé Gemini ne sort JAMAIS vers le navigateur (elle reste dans l'en-tête
 *      de l'appel serveur→Google ; l'URL ne contient qu'un jeton éphémère) ;
 *   2. les consignes du marchand voyagent dans le jeton, pas dans la réponse :
 *      un visiteur ne peut ni les lire, ni changer le comportement ;
 *   3. on ne fabrique pas de jeton quand ce n'est pas autorisé (voix éteinte,
 *      forfait gratuit, quota atteint, plafond de coût atteint) ;
 *   4. la durée et les tokens remontent dans la table du forfait, bornés —
 *      la voix ne doit pas être un coût invisible pour le marchand.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as session from '../functions/api/voice/session';
import * as report from '../functions/api/voice/report';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
let geminiCalls: Array<{ url: string; body: any; apiKey?: string }> = [];
let geminiMode: 'ok' | 'refus' | 'vide' = 'ok';

const ENV_LIVE = {
  ...ENV,
  GEMINI_API_KEY: 'GEMINI_TEST_KEY',
  GEMINI_LIVE_MODEL: 'gemini-test-live',
};

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
  geminiCalls = [];
  geminiMode = 'ok';

  // On intercepte les appels à Google : le faux Supabase garde tout le reste.
  const lower = globalThis.fetch as typeof fetch;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (String(url).includes('generativelanguage.googleapis.com')) {
      geminiCalls.push({
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : null,
        apiKey: new Headers(init.headers).get('x-goog-api-key') || undefined,
      });
      if (geminiMode === 'refus') {
        return new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 });
      }
      if (geminiMode === 'vide') return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ name: 'auth_tokens/TOKEN_ABC', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });
    }
    return lower(input, init);
  }) as any;
});

afterEach(() => {
  fx.restore();
});

/** Règle la fiche du marchand (plan + réglages de voix) comme le ferait le tableau de bord. */
function configure(partial: Record<string, any> = {}) {
  const row = fx.supabase.rows('assistants')[0];
  row.config = {
    businessName: 'Boutique Nour',
    plan: 'pro',
    ...partial,
  };
  return row;
}

const VOICE_ON = { widgetConfig: { voice: { enabled: true, voice: 'Kore', greeting: 'Salam, bienvenue chez Nour !', maxMinutes: 10 } } };

async function openCall(body: any = { assistantId: 'asst1' }, opts: { env?: any; ip?: string } = {}) {
  let ip = opts.ip;
  if (!ip) {
    ipCounter += 1;
    ip = `10.0.0.${ipCounter}`;
  }
  const request = new Request('https://jawebflow.test/api/voice/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
  const res = await session.onRequestPost({ request, env: opts.env || ENV_LIVE });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
let ipCounter = 0;

async function sendReport(body: any) {
  ipCounter += 1;
  const request = new Request('https://jawebflow.test/api/voice/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.1.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
  const res = await report.onRequestPost({ request, env: ENV_LIVE });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

describe('ouvrir un appel vocal', () => {
  it('sans clé Gemini côté serveur : rien ne s’ouvre, et on le dit en français', async () => {
    configure(VOICE_ON);
    const { status, json } = await openCall({ assistantId: 'asst1' }, { env: ENV });
    expect(status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("n'est pas encore activé");
    expect(geminiCalls).toEqual([]);
  });

  it('voix éteinte (réglage par défaut) : aucun jeton n’est fabriqué', async () => {
    configure({}); // plan pro, mais le marchand n'a jamais activé la voix
    const { status, json } = await openCall();
    expect(status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.voiceDisabled).toBe(true);
    expect(json.error).toContain('écrivez-nous');
    expect(geminiCalls).toEqual([]);
  });

  it('forfait gratuit : le visiteur reçoit le message « assistant non activé »', async () => {
    configure({ ...VOICE_ON, plan: 'free' });
    const { json } = await openCall();
    expect(json.ok).toBe(false);
    expect(json.limitReached).toBe(true);
    expect(json.error).toContain('plan');
    expect(geminiCalls).toEqual([]);
  });

  it('deuxième essai du widget (`fallback`) : jeton sur le couple historique', async () => {
    configure(VOICE_ON);
    const { status, json } = await openCall({ assistantId: 'asst1', fallback: true });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.model).not.toBe('gemini-test-live');
    expect(json.apiVersion).toBe('v1alpha');
    expect(json.wsUrl).not.toContain('Constrained');
    // Un seul aller-retour chez Google : on ne rejoue pas ce qui vient d'échouer.
    expect(geminiCalls).toHaveLength(1);
    expect(json.setup.setup.model).toBe(`models/${json.model}`);
  });

  it('assistant inconnu : 404, sans rien demander à Google', async () => {
    const { status } = await openCall({ assistantId: 'asst_inconnu' });
    expect(status).toBe(404);
    expect(geminiCalls).toEqual([]);
  });

  it('appel autorisé : jeton éphémère, modèle et voix imposés par le serveur', async () => {
    configure(VOICE_ON);
    const { status, json } = await openCall();

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.wsUrl).toContain('wss://generativelanguage.googleapis.com/ws/');
    expect(json.wsUrl).toContain('access_token=TOKEN_ABC');
    // La porte des jetons éphémères. Sans « Constrained », Google accepte la
    // socket puis la referme juste après : l'appel « tourne puis raccroche ».
    expect(json.wsUrl).toContain('BidiGenerateContentConstrained');
    expect(json.model).toBe('gemini-test-live');
    expect(json.voice).toBe('Kore');
    expect(json.maxSeconds).toBe(600);
    expect(json.setup.setup.model).toBe('models/gemini-test-live');

    // La clé part dans l'EN-TÊTE de l'appel serveur→Google, jamais dans l'URL,
    // et jamais dans la réponse envoyée au navigateur.
    expect(geminiCalls).toHaveLength(1);
    expect(geminiCalls[0].apiKey).toBe('GEMINI_TEST_KEY');
    expect(geminiCalls[0].url).not.toContain('GEMINI_TEST_KEY');
    expect(JSON.stringify(json)).not.toContain('GEMINI_TEST_KEY');

    // Un seul usage, et une fenêtre de démarrage courte.
    const body = geminiCalls[0].body;
    expect(body.uses).toBe(1);
    expect(typeof body.expireTime).toBe('string');
    expect(body.bidiGenerateContentSetup.model).toBe('models/gemini-test-live');
    expect(body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
    expect(body.bidiGenerateContentSetup.generationConfig.responseModalities).toEqual(['AUDIO']);

    // Les consignes du marchand sont DANS le jeton (donc invisibles côté client)…
    const instructions = body.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    expect(instructions).toContain('Boutique Nour');
    expect(instructions).toContain('AU TÉLÉPHONE');
    expect(instructions).toContain('Salam, bienvenue chez Nour !');
    // …et ne fuitent pas dans la réponse.
    expect(JSON.stringify(json)).not.toContain('AU TÉLÉPHONE');
  });

  it('l’agent vocal ne sait QUE la base de connaissance du compte', async () => {
    configure(VOICE_ON);
    fx.supabase.seed('knowledge_entries', [
      { id: 'k-livraison', assistant_id: 'asst1', title: 'Livraison', content: 'Livraison 400 DA sur Alger en 48 heures.', category: 'livraison', status: 'active', enabled: true },
      { id: 'k-secret', assistant_id: 'asst1', title: 'Interne', content: 'Ne doit jamais sortir.', category: 'interne', status: 'rejected', enabled: true },
    ]);
    const { json } = await openCall();
    expect(json.ok).toBe(true);

    const instructions = geminiCalls[0].body.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    // Ses fiches voyage dans le jeton (donc côté serveur, invisible du visiteur)…
    expect(instructions).toContain('Livraison 400 DA sur Alger en 48 heures.');
    // …la fiche refusée ne part pas…
    expect(instructions).not.toContain('Ne doit jamais sortir.');
    // …et le prompt reste MINUSCULE : plus de prompt commercial complet.
    expect(instructions.length).toBeLessThan(9_000);
    expect(instructions).toMatch(/QU'AVEC les informations/i);
    // Rien de tout ça ne fuit dans la réponse au navigateur.
    expect(JSON.stringify(json)).not.toContain('Livraison 400 DA');
  });

  it('base de connaissance vide : l’agent dit qu’il ne sait pas, à chaque question', async () => {
    configure(VOICE_ON);
    const { json } = await openCall();
    expect(json.ok).toBe(true);
    const instructions = geminiCalls[0].body.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    expect(instructions).toContain('VIDE');
    expect(instructions).toMatch(/ne sais RIEN/i);
    expect(instructions).toMatch(/je ne sais pas/i);
    expect(instructions.length).toBeLessThan(5_000);
  });

  it('voix inconnue au catalogue : repli sur Puck, l’appel reste possible', async () => {
    configure({ widgetConfig: { voice: { enabled: true, voice: 'VoixQuiNExistePas', maxMinutes: 2 } } });
    const { json } = await openCall();
    expect(json.ok).toBe(true);
    expect(json.voice).toBe('Puck');
    expect(json.maxSeconds).toBe(120);
  });

  it('anti-abus : la 7ᵉ tentative de la même IP est refusée', async () => {
    configure(VOICE_ON);
    const ip = '203.0.113.7';
    for (let i = 0; i < 6; i += 1) {
      const { json } = await openCall({ assistantId: 'asst1' }, { ip });
      expect(json.ok).toBe(true);
    }
    const { json } = await openCall({ assistantId: 'asst1' }, { ip });
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/Trop d.appels/);
    expect(geminiCalls).toHaveLength(6); // le 7ᵉ n'a pas coûté un centime
  });

  it('Google refuse : message clair au visiteur, détail technique gardé côté serveur', async () => {
    configure(VOICE_ON);
    geminiMode = 'refus';
    const { status, json } = await openCall();
    expect(status).toBe(502);
    expect(json.error).toContain("n'est pas encore activé");
    expect(JSON.stringify(json)).not.toContain('API key not valid');
  });

  it('réponse de Google inattendue : on ne rend pas un jeton vide', async () => {
    configure(VOICE_ON);
    geminiMode = 'vide';
    const { status, json } = await openCall();
    expect(status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.wsUrl).toBeUndefined();
  });
});

describe('relevé de fin d’appel', () => {
  it('range la durée et les tokens dans la table du forfait, valeurs bornées', async () => {
    configure({});
    const { status, json } = await sendReport({
      assistantId: 'asst1',
      sessionId: 'v_visiteur',
      seconds: 99999,     // absurde : borné au plafond serveur
      tokensIn: 999999,   // absurde : borné
      tokensOut: 512,
      transcript: 'Client : vous êtes ouverts ?\nAssistant : oui, jusqu’à 18h.',
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, seconds: 900, minutes: 15 });

    const rows = fx.supabase.rows('conversation_contexts');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assistant_id: 'asst1',
      channel: 'voice',
      session_id: 'v_visiteur',
      // 15 minutes × 10 unités = 150 unités, soit 150 conversations.
      weight: 150,
      tokens_in: 400000,
      tokens_out: 512,
    });
    expect(String(rows[0].user_message)).toContain('Appel vocal');
    expect(String(rows[0].assistant_response)).toContain('18h');
  });

  it('assistant inconnu : rien n’est écrit', async () => {
    const { status } = await sendReport({ assistantId: 'asst_inconnu', seconds: 30 });
    expect(status).toBe(404);
    expect(fx.supabase.rows('conversation_contexts')).toHaveLength(0);
  });

  it('sans identifiant d’assistant : refusé', async () => {
    const { status, json } = await sendReport({ seconds: 30 });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
