/**
 * 🧮 Preuve bout en bout des deux leviers d'économie sur l'APPEL Gemini :
 *   1. RAG — seules les fiches utiles partent dans le contexte du tour ;
 *   2. CACHE — consignes + base complète sont mises en cache et relues à 10 %
 *      du prix quand elles dépassent le plancher de Google (4 096 jetons).
 *
 * Le test appelle la VRAIE route `/api/chat` (Supabase, quota et Gemini simulés)
 * pour vérifier ce qui part réellement chez Google, message par message.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/chat.js';
import { FakeGemini, modelReply, textPart } from './helpers/fake-gemini';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';
import { buildCacheKnowledgeBlock, buildSalesSystemPrompt } from '../functions/_shared/prompt';
import { cacheableText, estimateTokens } from '../functions/_shared/rag';
import { resetGeminiContextCacheForTests } from '../functions/_shared/gemini-cache';

let fx: ReturnType<typeof installFakes>;

const notes = (count: number, core = 3) => Array.from({ length: count }, (_, i) => ({
  title: `Article ${i + 1}`,
  content: `Fiche de l'article ${i + 1} : prix ${1_000 + i} DA, coton, tailles S à XL, livraison 48 h. `.repeat(5),
  category: i < core ? 'livraison' : 'produit',
  enabled: true,
  approvalStatus: 'active',
}));

/** Le compte de test reçoit la base demandée (le reste du marchand ne change pas). */
function setKnowledge(count: number, core = 3) {
  const row = fx.supabase.rows('assistants')[0];
  row.config = { ...row.config, knowledgeNotes: notes(count, core) };
  return row.config as any;
}

async function send(message: string, messageId: string, session: string) {
  return onRequestPost({
    env: { ...ENV, GEMINI_API_KEY: 'gemini-test-key' },
    request: new Request('https://jawebflow.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: 'asst1', sessionId: session, messageId, message, history: [] }),
    }),
  } as any);
}

beforeEach(() => {
  resetGeminiContextCacheForTests();
  fx = installFakes();
  seedMerchant(fx.supabase);
});

afterEach(() => fx.restore());

describe('/api/chat — mise en cache du contexte (gros compte)', () => {
  it('met consignes + base complète en cache, puis ne renvoie plus la base dans le tour', async () => {
    const config = setKnowledge(60);
    const block = buildCacheKnowledgeBlock(config.knowledgeNotes);
    // Le décor du test est réaliste : consignes + base dépassent bien le plancher.
    expect(cacheableText(buildSalesSystemPrompt(config), block)).toBe(true);
    expect(estimateTokens(block.length)).toBeGreaterThan(4_096);

    const gemini = new FakeGemini();
    gemini.next(
      modelReply(textPart('Bienvenue chez Boutique Nour.')),
      modelReply(textPart('L’article 42 est à 1 042 DA.')),
    );
    const cacheCalls: any[] = [];
    fx.external.handler = async (url, init) => {
      if (url.pathname.includes('cachedContents')) {
        cacheCalls.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({
          name: 'cachedContents/kb-60',
          expireTime: new Date(Date.now() + 600_000).toISOString(),
          usageMetadata: { totalTokenCount: 5_200 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return gemini.handler(url, init);
    };

    // 1er message : le cache se construit en arrière-plan, le message part normalement.
    const first = await send('vous livrez à Blida ?', 'msg-cache-1', 'session-cache');
    expect(first.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cacheCalls).toHaveLength(1);
    const cachedInstruction = cacheCalls[0].systemInstruction.parts[0].text;
    expect(cachedInstruction).toContain('BASE DE CONNAISSANCE COMPLÈTE');
    expect(cachedInstruction).toContain('Article 35');       // la base entière (bornée) est en cache…
    expect(cacheCalls[0].ttl).toBe('600s');                  // …avec un TTL court (stockage facturé à l'heure)
    expect(gemini.calls[0].body.cachedContent).toBeUndefined();
    expect(gemini.calls[0].body.systemInstruction.parts[0].text).toContain('Vendre avec tact');
    // 1er message (plein tarif) : la base passe par le contexte du tour, en RAG.
    expect(JSON.stringify(gemini.calls[0].body.contents)).toContain('[livraison]');

    // 2e message : relecture du cache (10 % du prix), base absente du contexte du tour.
    const second = await send('et l’article 42 ?', 'msg-cache-2', 'session-cache');
    expect(second.status).toBe(200);
    const payload = gemini.calls[1].body;
    expect(payload.cachedContent).toBe('cachedContents/kb-60');
    expect(payload.systemInstruction).toBeUndefined();
    const contents = JSON.stringify(payload.contents);
    expect(contents).toContain('article 42');                // la question du client, elle, est bien là
    expect(contents).not.toContain('[produit]');             // mais aucune fiche (aucun doublon facturé)
    expect(contents).not.toContain('[livraison]');
    expect(contents).not.toContain('BASE DE CONNAISSANCE');
    const body = await second.json() as any;
    expect(body.diagnostics.join(' | ')).toMatch(/cache Gemini réutilisé/);
    expect(body.usage.cachedTokens).toBe(0);                 // (le faux Gemini n'annonce pas de jetons cachés)
  });
});

describe('/api/chat — RAG par tour (compte normal)', () => {
  it('ne tente aucun cache et n’envoie que les fiches utiles', async () => {
    const config = setKnowledge(8, 1);
    expect(cacheableText(buildSalesSystemPrompt(config), buildCacheKnowledgeBlock(config.knowledgeNotes))).toBe(false);

    const gemini = new FakeGemini();
    gemini.next(modelReply(textPart('L’article 1 est à 1 000 DA.')));
    let cacheAttempts = 0;
    fx.external.handler = async (url, init) => {
      if (url.pathname.includes('cachedContents')) {
        cacheAttempts += 1;
        return new Response(JSON.stringify({ error: { message: 'minimum token count not met' } }), { status: 400 });
      }
      return gemini.handler(url, init);
    };

    const res = await send('prix de l’article 2 ?', 'msg-rag-1', 'session-rag');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(cacheAttempts).toBe(0);                            // jamais de tentative inutile
    const payload = gemini.calls[0].body;
    expect(payload.cachedContent).toBeUndefined();
    const contents = JSON.stringify(payload.contents);
    expect(contents).toContain('Article 2');                 // la fiche utile est bien envoyée
    expect(contents).toContain('livraison');                 // ainsi que l'information vitale
    expect(contents).not.toContain('Article 8');             // mais pas tout le catalogue
    expect(body.diagnostics.join(' | ')).toMatch(/RAG par tour/);
  });
});
