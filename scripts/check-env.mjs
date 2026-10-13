/**
 * JAWEBFLOW — GARDE-FOU DE CONSTRUCTION
 * ============================================================================
 * Pourquoi ce fichier existe
 * ----------------------------------------------------------------------------
 * Vite **fige** les variables `VITE_*` DANS le JavaScript au moment de la
 * construction (`npm run build`). Elles n'existent pas à l'exécution : une fois
 * le bundle construit, il est trop tard.
 *
 * Conséquence vécue : le site se construit sans `VITE_SUPABASE_URL`, se déploie
 * sans broncher, et affiche une **page blanche** (« supabaseUrl is required »)
 * parce que le navigateur ne peut joindre aucune base.
 *
 * Ce script transforme donc cette panne silencieuse en **erreur de construction
 * explicite**, avec la marche à suivre. Mieux vaut un déploiement refusé qu'un
 * site cassé devant un client.
 *
 * Échappatoire (déploiement volontairement sans base) :
 *     SKIP_ENV_CHECK=1 npm run build:pages
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Variables sans lesquelles le site ne peut pas démarrer. */
export const REQUIRED_CLIENT_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

/**
 * Fichiers lus par Vite, du moins prioritaire au plus prioritaire (le mode de
 * construction est « production »). `process.env` reste prioritaire sur tout.
 */
export const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];

/** Analyse un contenu de fichier .env (mêmes règles simples que Vite). */
export function parseEnvFile(content) {
  const out = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    // Guillemets facultatifs (comme Vite).
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Valeurs des fichiers .env d'un dossier (les suivants écrasent les précédents). */
export function readEnvFiles(dir = process.cwd()) {
  const values = {};
  for (const file of ENV_FILES) {
    const full = path.join(dir, file);
    if (!existsSync(full)) continue;
    Object.assign(values, parseEnvFile(readFileSync(full, 'utf8')));
  }
  return values;
}

/** Clés manquantes ou vides parmi celles exigées. */
export function missingClientKeys(values = {}) {
  return REQUIRED_CLIENT_KEYS.filter((key) => !String(values[key] ?? '').trim());
}

/**
 * Verdict complet. `process.env` gagne (c'est ce que fait Vite : les variables
 * déjà présentes dans l'environnement ne sont jamais écrasées par les .env).
 */
export function checkBuildEnv({ env = process.env, dir = process.cwd() } = {}) {
  const files = readEnvFiles(dir);
  const values = { ...files, ...env };
  const missing = missingClientKeys(values);
  return {
    ok: missing.length === 0,
    missing,
    /** D'où vient la configuration : utile pour comprendre un déploiement raté. */
    source: missing.length === 0 ? (REQUIRED_CLIENT_KEYS.some((k) => String(env[k] ?? '').trim()) ? 'environnement' : 'fichier .env') : 'aucune',
  };
}

/** L'échappatoire est-elle demandée ? (1, true, yes, oui…) */
export function skipRequested(env = process.env) {
  return /^(1|true|yes|oui|on)$/i.test(String(env.SKIP_ENV_CHECK ?? '').trim());
}

/** Le message affiché quand la construction est arrêtée. */
export function failureMessage(missing, dir = process.cwd()) {
  return [
    '',
    '  ┌───────────────────────────────────────────────────────────────────────┐',
    '  │  CONSTRUCTION ARRÊTÉE : configuration manquante pour le site          │',
    '  └───────────────────────────────────────────────────────────────────────┘',
    '',
    `  Manquant : ${missing.join(', ')}`,
    `  Cherché dans : ${ENV_FILES.join(', ')} (dossier ${dir})`,
    '',
    '  ⚠️  Ces deux valeurs sont INJECTÉES DANS LE JAVASCRIPT à la construction.',
    '      Les définir dans Cloudflare ne suffit PAS si la construction se fait',
    '      sur ta machine (Vite ne les lit qu\'à ce moment-là).',
    '',
    '  Deux façons de corriger :',
    '',
    '  1. Tu construis sur ta machine → crée un fichier .env',
    '     (copie de .env.example) contenant :',
    '         VITE_SUPABASE_URL=https://xxxxx.supabase.co',
    '         VITE_SUPABASE_ANON_KEY=eyJ...',
    '     Les deux valeurs sont dans Supabase → Project Settings → API',
    '     (URL du projet + clé « anon » / « publishable »).',
    '',
    '  2. La construction est faite par Cloudflare → mets ces deux variables',
    '     dans Pages → Settings → Environment variables (Production ET Preview),',
    '     puis relance un déploiement (une variable ajoutée ne s\'applique',
    '     qu\'à la construction suivante).',
    '',
    '  Pour construire malgré tout (site volontairement sans base) :',
    '      SKIP_ENV_CHECK=1 npm run build:pages      (macOS / Linux)',
    '      set SKIP_ENV_CHECK=1 && npm run build:pages   (Windows)',
    '',
    '  Sans cette configuration, le site se déploierait… et n\'afficherait',
    '  qu\'une page blanche devant tes clients.',
    '',
  ].join('\n');
}

/** Point d'entrée CLI. Renvoie le code de sortie (0 = on continue). */
export function run({ env = process.env, dir = process.cwd(), log = console.log } = {}) {
  if (skipRequested(env)) {
    log('  ⓘ Contrôle de configuration ignoré (SKIP_ENV_CHECK).');
    return 0;
  }
  const { ok, missing, source } = checkBuildEnv({ env, dir });
  if (!ok) {
    log(failureMessage(missing, dir));
    return 1;
  }
  log(`  ✓ Configuration du site trouvée (${source}) : ${REQUIRED_CLIENT_KEYS.join(', ')}`);
  return 0;
}

// Exécution directe : `node scripts/check-env.mjs`
if (process.argv[1] && process.argv[1].endsWith('check-env.mjs')) {
  process.exit(run());
}
