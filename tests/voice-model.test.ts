/**
 * 🎙️ Le modèle des appels vocaux
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. le modèle par défaut est celui qu'on a décidé (3.8 Live, facturé 3 $/M
 *      en entrée audio et 12 $/M en sortie) ;
 *   2. la clé Gemini ne voyage que dans l'en-tête serveur→Google ;
 *   3. si Google refuse ce modèle, l'appel retombe UNE fois sur le couple
 *      historique — un visiteur ne doit jamais voir une erreur parce qu'un
 *      identifiant de modèle a changé côté Google ;
 *   4. un modèle forcé par le marchand n'est jamais silencieusement remplacé.
 */
import { describe, expect, it } from 'vitest';
import {
  createLiveToken,
  DEFAULT_LIVE_API_VERSION,
  DEFAULT_LIVE_MODEL,
  FALLBACK_LIVE_API_VERSION,
  TOKEN_API_VERSION,
} from '../functions/_shared/voice/live';

const tokenOk = () =>
  new Response(JSON.stringify({ name: 'auth_tokens/TOKEN_ABC', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });

describe('modèle temps réel des appels', () => {
  it('par défaut : Gemini 3.8 Live, porte des jetons en v1beta', () => {
    expect(DEFAULT_LIVE_MODEL).toBe('gemini-3.8-live');
    expect(DEFAULT_LIVE_API_VERSION).toBe('v1beta');
    expect(TOKEN_API_VERSION).toBe('v1alpha');
  });

  it('le jeton se demande sur v1alpha, la connexion passe par la porte Constrained', async () => {
    let vu: any = null;
    const fetchImpl = (async (url: any, init: any) => {
      vu = { url: String(url), apiKey: new Headers(init.headers).get('x-goog-api-key'), body: JSON.parse(String(init.body)) };
      return tokenOk();
    }) as any;

    const res = await createLiveToken({ GEMINI_API_KEY: 'CLE_SECRETE' }, { systemInstruction: 'Tu es Nour.', fetchImpl });

    expect(res.ok).toBe(true);
    expect(res.wsUrl).toContain('TOKEN_ABC');
    // Le SERVICE DES JETONS vit sur v1alpha (oublier ce détail, c'est envoyer le
    // visiteur sur une porte qui n'existe pas).
    expect(vu.url).toContain('/v1alpha/auth_tokens');
    // …et la CONNEXION sur la porte des jetons : les jetons n'ont d'identité
    // que là. Sur l'autre porte, Google répond « unregistered callers ».
    expect(res.wsUrl).toContain('v1beta.GenerativeService.BidiGenerateContentConstrained');
    expect(res.wsUrl).not.toContain('GenerativeService.BidiGenerateContent?');
    expect(res.method).toBe('BidiGenerateContentConstrained');
    expect(res.tokenApiVersion).toBe('v1alpha');
    expect(vu.url).not.toContain('CLE_SECRETE');
    expect(vu.apiKey).toBe('CLE_SECRETE');
    expect(vu.body.bidiGenerateContentSetup.model).toContain('gemini-3.8-live');
    expect(JSON.stringify(vu.body)).toContain('Tu es Nour.');
    // Un seul usage, et une fenêtre de démarrage courte.
    expect(vu.body.uses).toBe(1);
  });

  it('service des jetons fermé sur v1alpha : on le demande sur v1beta', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: any) => {
      urls.push(String(url));
      if (String(url).includes('/v1alpha/')) {
        return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
      }
      return tokenOk();
    }) as any;

    const res = await createLiveToken({ GEMINI_API_KEY: 'K' }, { systemInstruction: 'T', fetchImpl });

    expect(res.ok).toBe(true);
    expect(urls).toEqual([
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
    ]);
    expect(res.tokenApiVersion).toBe('v1beta');
    // La porte reste `Constrained` : c'est la seule qui accepte un jeton.
    expect(res.wsUrl).toContain('BidiGenerateContentConstrained');
  });

  it('jeton refusé partout : on remonte la VRAIE raison de Google', async () => {
    let appels = 0;
    const fetchImpl = (async () => {
      appels += 1;
      return new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 });
    }) as any;

    const res = await createLiveToken({ GEMINI_API_KEY: 'K' }, { systemInstruction: 'T', fetchImpl });

    expect(res.ok).toBe(false);
    expect(res.wsUrl).toBeUndefined();
    expect(appels).toBe(2); // v1alpha puis v1beta, puis on s'arrête
    expect(String(res.detail)).toContain('jeton');
    expect(String(res.error)).toContain("n'est pas encore activé");
  });

  it('`legacy: true` : la MÊME porte, sur l’autre version d’API', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: any) => {
      urls.push(String(url));
      return tokenOk();
    }) as any;

    // Le navigateur a déjà été refermé une fois : on lui donne la même porte
    // (Constrained), sur v1alpha — jamais la porte sans « Constrained », où un
    // jeton n'a aucune identité.
    const res = await createLiveToken(
      { GEMINI_API_KEY: 'K' },
      { systemInstruction: 'T', fetchImpl, legacy: true },
    );

    expect(res.ok).toBe(true);
    expect(res.apiVersion).toBe(FALLBACK_LIVE_API_VERSION);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/v1alpha/auth_tokens');
    expect(res.wsUrl).toContain('.v1alpha.GenerativeService.BidiGenerateContentConstrained');
    expect(res.model).toBe(DEFAULT_LIVE_MODEL);
  });

  it('modèle forcé par le marchand : aucun repli silencieux', async () => {
    let appels = 0;
    const fetchImpl = (async () => {
      appels += 1;
      return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 404 });
    }) as any;

    const res = await createLiveToken(
      { GEMINI_API_KEY: 'K', GEMINI_LIVE_MODEL: 'mon-modele-maison' },
      { systemInstruction: 'T', fetchImpl },
    );

    expect(res.ok).toBe(false);
    // Deux appels : les deux versions possibles du SERVICE DES JETONS (v1alpha
    // puis v1beta). Le modèle forcé, lui, n'est jamais remplacé.
    expect(appels).toBe(2);
    expect(String(res.error)).toMatch(/indisponible|pas disponible/);
  });

  it('sans clé Gemini : message en français, zéro appel réseau', async () => {
    let appels = 0;
    const fetchImpl = (async () => {
      appels += 1;
      return tokenOk();
    }) as any;

    const res = await createLiveToken({}, { systemInstruction: 'T', fetchImpl });

    expect(res.ok).toBe(false);
    expect(appels).toBe(0);
    expect(String(res.error)).toContain('pas encore activé');
  });
});
