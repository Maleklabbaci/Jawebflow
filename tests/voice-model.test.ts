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
  LEGACY_LIVE_FALLBACK,
} from '../functions/_shared/voice/live';

const tokenOk = () =>
  new Response(JSON.stringify({ name: 'auth_tokens/TOKEN_ABC', expireTime: '2026-01-01T00:00:00Z' }), { status: 200 });

describe('modèle temps réel des appels', () => {
  it('par défaut : Gemini 3.8 Live, en v1beta', () => {
    expect(DEFAULT_LIVE_MODEL).toBe('gemini-3.8-live');
    expect(DEFAULT_LIVE_API_VERSION).toBe('v1beta');
  });

  it('la clé reste dans l’en-tête, le modèle dans le jeton', async () => {
    let vu: any = null;
    const fetchImpl = (async (url: any, init: any) => {
      vu = { url: String(url), apiKey: new Headers(init.headers).get('x-goog-api-key'), body: JSON.parse(String(init.body)) };
      return tokenOk();
    }) as any;

    const res = await createLiveToken({ GEMINI_API_KEY: 'CLE_SECRETE' }, { systemInstruction: 'Tu es Nour.', fetchImpl });

    expect(res.ok).toBe(true);
    expect(res.wsUrl).toContain('TOKEN_ABC');
    // ⚠️ Un JETON ÉPHÉMÈRE n'entre que par la porte `BidiGenerateContentConstrained` :
    // avec l'autre porte, Google ouvre la socket puis la referme aussitôt.
    expect(res.wsUrl).toContain('BidiGenerateContentConstrained');
    expect(res.wsUrl).toContain('v1beta');
    expect(vu.url).not.toContain('CLE_SECRETE');
    expect(vu.apiKey).toBe('CLE_SECRETE');
    expect(vu.body.bidiGenerateContentSetup.model).toContain('gemini-3.8-live');
    expect(JSON.stringify(vu.body)).toContain('Tu es Nour.');
  });

  it('modèle refusé par Google : on retente une fois avec le couple historique', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: any) => {
      urls.push(String(url));
      if (urls.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'models/gemini-3.8-live is not found' } }), { status: 404 });
      }
      return tokenOk();
    }) as any;

    const res = await createLiveToken({ GEMINI_API_KEY: 'K' }, { systemInstruction: 'T', fetchImpl });

    expect(res.ok).toBe(true);
    expect(res.model).toBe(LEGACY_LIVE_FALLBACK.model);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/v1beta/auth_tokens');
    expect(urls[1]).toContain('/v1alpha/auth_tokens');
    expect(String(res.detail)).toContain('repli');
    // Le repli passe par l'autre porte : l'ancien modèle n'accepte pas (encore)
    // le nom de méthode « Constrained ».
    expect(res.wsUrl).not.toContain('Constrained');
    expect(res.wsUrl).toContain('BidiGenerateContent?');
  });

  it('`legacy: true` : on va droit au couple historique, sans brûler un essai', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: any) => {
      urls.push(String(url));
      return tokenOk();
    }) as any;

    // Le navigateur a déjà été fermé une fois : inutile de lui redonner le
    // même couple, il échouerait pareil.
    const res = await createLiveToken(
      { GEMINI_API_KEY: 'K' },
      { systemInstruction: 'T', fetchImpl, legacy: true },
    );

    expect(res.ok).toBe(true);
    expect(res.model).toBe(LEGACY_LIVE_FALLBACK.model);
    expect(res.apiVersion).toBe(LEGACY_LIVE_FALLBACK.apiVersion);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/v1alpha/auth_tokens');
    expect(res.wsUrl).not.toContain('Constrained');
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
    expect(appels).toBe(1);
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
