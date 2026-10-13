/**
 * GARDE-FOU DE CONSTRUCTION (scripts/check-env.mjs)
 * ============================================================================
 * Il existe à cause d'une panne vécue en production : le site se construisait
 * sans `VITE_SUPABASE_URL` (les définir dans Cloudflare ne suffit pas si la
 * construction a lieu ailleurs), se déployait sans broncher, et affichait une
 * page blanche.
 *
 * Ces tests verrouillent le comportement : refuser la construction, expliquer
 * en français, et laisser une échappatoire explicite.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ENV_FILES,
  REQUIRED_CLIENT_KEYS,
  checkBuildEnv,
  failureMessage,
  missingClientKeys,
  parseEnvFile,
  readEnvFiles,
  run,
  skipRequested,
} from '../scripts/check-env.mjs';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'jw-env-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const writeEnv = (name: string, content: string) => writeFileSync(path.join(dir, name), content);

describe('lecture des fichiers .env (mêmes règles que Vite)', () => {
  it('lit les valeurs, ignore les commentaires et les lignes vides', () => {
    expect(parseEnvFile([
      '# un commentaire',
      '',
      'VITE_SUPABASE_URL=https://x.supabase.co',
      '  VITE_SUPABASE_ANON_KEY = "eyJabc"  ',
      'export AUTRE=1',
    ].join('\n'))).toEqual({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJabc',
      AUTRE: '1',
    });
  });

  it('retire les guillemets (simples et doubles) comme Vite', () => {
    const parsed = parseEnvFile("A='valeur simple'\nB=\"autre\"");
    expect(parsed).toEqual({ A: 'valeur simple', B: 'autre' });
  });

  it('le fichier le plus prioritaire gagne (.env.production > .env)', () => {
    writeEnv('.env', 'VITE_SUPABASE_URL=https://du-fichier-base.supabase.co');
    writeEnv('.env.production', 'VITE_SUPABASE_URL=https://du-fichier-prod.supabase.co');
    expect(readEnvFiles(dir).VITE_SUPABASE_URL).toBe('https://du-fichier-prod.supabase.co');
  });

  it('un dossier sans .env ne renvoie rien (pas de plantage)', () => {
    expect(readEnvFiles(path.join(dir, 'inexistant'))).toEqual({});
  });
});

describe('verdict de construction', () => {
  it('sans rien : les deux clés manquent → construction REFUSÉE', () => {
    const verdict = checkBuildEnv({ env: {}, dir });
    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toEqual(REQUIRED_CLIENT_KEYS);
    expect(verdict.source).toBe('aucune');
  });

  it('une seule clé fournie ne suffit pas', () => {
    expect(missingClientKeys({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toEqual(['VITE_SUPABASE_ANON_KEY']);
  });

  it('une clé vide ou faite d\'espaces compte comme manquante', () => {
    expect(missingClientKeys({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: '' })).toEqual(REQUIRED_CLIENT_KEYS);
  });

  it('les deux clés dans .env : construction autorisée (source « fichier .env »)', () => {
    writeEnv('.env', 'VITE_SUPABASE_URL=https://x.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJabc');
    const verdict = checkBuildEnv({ env: {}, dir });
    expect(verdict).toMatchObject({ ok: true, missing: [], source: 'fichier .env' });
  });

  it('variables d\'environnement (Cloudflare, GitHub…) : elles gagnent sur le fichier', () => {
    writeEnv('.env', 'VITE_SUPABASE_URL=https://fichier.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJdu-fichier');
    const verdict = checkBuildEnv({
      env: { VITE_SUPABASE_URL: 'https://env.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJenv' },
      dir,
    });
    expect(verdict).toMatchObject({ ok: true, source: 'environnement' });
  });
});

describe('message d\'erreur', () => {
  it('nomme les variables manquantes et les deux corrections possibles', () => {
    const message = failureMessage(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'], dir);
    expect(message).toContain('VITE_SUPABASE_URL');
    expect(message).toContain('INJECTÉES DANS LE JAVASCRIPT');
    expect(message).toContain('.env');           // correction A
    expect(message).toContain('Environment variables'); // correction B
    expect(message).toContain('page blanche');
    expect(message).toContain('SKIP_ENV_CHECK'); // échappatoire
  });

  it('dit où il a cherché (utile quand la construction échoue sans raison apparente)', () => {
    const message = failureMessage(['VITE_SUPABASE_URL'], dir);
    for (const file of ENV_FILES) expect(message).toContain(file);
    expect(message).toContain(dir);
  });
});

describe('échappatoire volontaire', () => {
  it('SKIP_ENV_CHECK accepte 1/true/yes/oui (et pas n\'importe quoi)', () => {
    expect(skipRequested({ SKIP_ENV_CHECK: '1' })).toBe(true);
    expect(skipRequested({ SKIP_ENV_CHECK: 'true' })).toBe(true);
    expect(skipRequested({ SKIP_ENV_CHECK: 'OUI' })).toBe(true);
    expect(skipRequested({ SKIP_ENV_CHECK: '0' })).toBe(false);
    expect(skipRequested({ SKIP_ENV_CHECK: 'non' })).toBe(false);
    expect(skipRequested({})).toBe(false);
  });

  it('avec l\'échappatoire, la construction passe sans configuration', () => {
    const lines: string[] = [];
    const code = run({ env: { SKIP_ENV_CHECK: '1' }, dir, log: (l: string) => lines.push(l) });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('ignoré');
  });
});

describe('code de sortie du script', () => {
  it('refuse (1) sans configuration, accepte (0) avec', () => {
    const silence = () => undefined;
    expect(run({ env: {}, dir, log: silence })).toBe(1);

    writeEnv('.env', 'VITE_SUPABASE_URL=https://x.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJabc');
    const lines: string[] = [];
    expect(run({ env: {}, dir, log: (l: string) => lines.push(l) })).toBe(0);
    expect(lines.join('\n')).toContain('Configuration du site trouvée');
  });

  it('n\'affiche JAMAIS la valeur des clés (même si elles ne sont pas secrètes)', () => {
    writeEnv('.env', 'VITE_SUPABASE_URL=https://x.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJSECRETVALUE');
    const lines: string[] = [];
    run({ env: {}, dir, log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).not.toContain('eyJSECRETVALUE');
  });
});
