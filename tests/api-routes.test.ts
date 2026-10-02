import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde-fou « tous les boutons marchent » : chaque adresse /api/... appelée par
 * l'interface doit correspondre à une vraie fonction serveur (functions/).
 * Un bouton qui appelle une adresse inexistante échoue en silence chez le client.
 */
const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, filter: (f: string) => boolean, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const routes = new Set(
  walk(path.join(ROOT, 'functions'), (f) => /\.(ts|js)$/.test(f) && !f.includes(`${path.sep}_shared${path.sep}`) && !/\[\[/.test(f))
    .map((f) => '/' + path.relative(path.join(ROOT, 'functions'), f).replace(/\\/g, '/').replace(/\.(ts|js)$/, '').replace(/\/index$/, '')),
);

const used = new Map<string, string>();
for (const file of walk(path.join(ROOT, 'src'), (f) => /\.(ts|tsx)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/fetch\(\s*[`'"](\/api\/[A-Za-z0-9_\/-]+)/g)) used.set(m[1], path.relative(ROOT, file));
}

/** Connu et volontairement laissé de côté (hors sujet automatisations). */
const KNOWN_MISSING = new Set(['/api/payment/checkout']);

describe('routes /api appelées par l’interface', () => {
  it('chaque appel a une fonction serveur (sauf exceptions connues)', () => {
    const missing = [...used.entries()].filter(([u]) => !routes.has(u) && !KNOWN_MISSING.has(u)).map(([u, f]) => `${u}  ← ${f}`);
    expect(missing).toEqual([]);
  });

  it('la liste des exceptions ne cache pas une route qui existe maintenant', () => {
    expect([...KNOWN_MISSING].filter((u) => routes.has(u))).toEqual([]);
  });

  it('les nouvelles routes sont bien présentes', () => {
    for (const r of ['/api/instagram/automations', '/api/instagram/media', '/api/instagram/diagnostics', '/api/webhook/test-ping']) {
      expect(routes.has(r), r).toBe(true);
    }
  });

  it('plus aucun appel vers les anciennes routes fantômes', () => {
    for (const ghost of ['/api/instagram/test-live-message', '/api/instagram/sync-token']) expect(used.has(ghost), ghost).toBe(false);
  });
});
