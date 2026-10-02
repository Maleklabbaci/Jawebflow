/**
 * Relie l'INTERFACE aux VRAIS points d'entrée du serveur (functions/api/instagram/*),
 * eux-mêmes branchés sur le faux Supabase et le faux Instagram. Les tests d'interface
 * traversent donc toute la pile : bouton → fetch → fonction serveur → base → moteur.
 */
import { vi } from 'vitest';
import * as copilot from '../../functions/api/copilot';
import * as quickAdd from '../../functions/api/knowledge/quick-add';
import * as automations from '../../functions/api/instagram/automations';
import * as diagnostics from '../../functions/api/instagram/diagnostics';
import * as integration from '../../functions/api/instagram/integration';
import * as media from '../../functions/api/instagram/media';
import * as subscribe from '../../functions/api/instagram/subscribe';
import { ENV, installFakes } from './fakes';

type Handlers = Partial<Record<'GET' | 'POST' | 'PATCH' | 'DELETE', (ctx: any) => Promise<Response>>>;

const ROUTES: Record<string, Handlers> = {
  // « Parler à mon IA » : le vrai point d'entrée, avec une clé Gemini factice (le modèle lui-même est simulé dans chaque test).
  '/api/copilot': { POST: (ctx) => copilot.onRequestPost({ ...ctx, env: { ...ctx.env, GEMINI_API_KEY: 'test-gemini-key' } }) },
  // « Ajout éclair » de l'écran « Mes informations » (même clé Gemini factice).
  '/api/knowledge/quick-add': { POST: (ctx) => quickAdd.onRequestPost({ ...ctx, env: { ...ctx.env, GEMINI_API_KEY: 'test-gemini-key' } }) },
  '/api/instagram/automations': { GET: automations.onRequestGet, POST: automations.onRequestPost, PATCH: automations.onRequestPatch, DELETE: automations.onRequestDelete },
  '/api/instagram/media': { GET: media.onRequestGet },
  '/api/instagram/diagnostics': { GET: diagnostics.onRequestGet, POST: diagnostics.onRequestPost },
  '/api/instagram/integration': { GET: integration.onRequestGet, POST: integration.onRequestPost },
  '/api/instagram/subscribe': { POST: subscribe.onRequestPost },
};

export interface UiBackend extends ReturnType<typeof installFakes> {
  /** Appels reçus par nos points d'entrée (méthode + chemin), pour les vérifier dans les tests. */
  api: Array<{ method: string; url: string; body?: any }>;
  /** Réponses imposées pour un chemin d'API (ex. /api/chat). */
  stub: (path: string, handler: (init: RequestInit) => Response | Promise<Response>) => void;
}

export function installUiBackend(): UiBackend {
  const fx = installFakes();
  const lower = globalThis.fetch as typeof fetch; // fetch déjà branché sur Supabase/Meta simulés
  const api: UiBackend['api'] = [];
  const stubs = new Map<string, (init: RequestInit) => Response | Promise<Response>>();

  const routed = vi.fn(async (input: any, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || String(input);
    if (raw.startsWith('/')) {
      const url = new URL(raw, 'https://jawebflow.test');
      const method = (init.method || 'GET').toUpperCase();
      api.push({ method, url: url.pathname + url.search, body: init.body ? safeParse(String(init.body)) : undefined });
      const stub = stubs.get(url.pathname);
      if (stub) return stub(init);
      const handler = ROUTES[url.pathname]?.[method as 'GET'];
      if (!handler) return new Response(JSON.stringify({ error: `route non simulée ${method} ${url.pathname}` }), { status: 404 });
      const request = new Request(url.toString(), { method, headers: init.headers as any, body: init.body as any });
      return handler({ request, env: ENV });
    }
    return lower(input, init);
  });
  globalThis.fetch = routed as any;

  return {
    ...fx,
    api,
    stub: (path, handler) => { stubs.set(path, handler); },
    restore: () => fx.restore(),
  };
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}
