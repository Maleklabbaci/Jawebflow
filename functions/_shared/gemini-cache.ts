/**
 * Gemini explicit context-cache helper.
 *
 * Only the stable system instruction is cached (seller playbook + assistant
 * profile/rules + — pour les gros comptes — la base de connaissance entière).
 * Les fiches choisies pour LA question, la mémoire, la commande en cours et le
 * message du client restent hors du cache : c'est le RAG (`rag.ts`) qui garde
 * cette partie minuscule et à jour.
 *
 * Les deux leviers d'économie, mesurés sur Gemini 3.1 Flash-Lite (tarifs
 * Google, oct. 2026) :
 *   • écriture du cache : 0,08333 $/M (une fois par entrée) ;
 *   • lecture du cache  : 0,025 $/M contre 0,25 $/M en entrée normale ⇒ **−90 %** ;
 *   • stockage          : 1,00 $/M de jetons **par heure**.
 *
 * ⚠️ C'est le stockage qui commande la durée de vie : garder un bloc de 5 000
 * jetons en cache 24 h coûte 0,12 $ de stockage par jour, soit plus que ce que
 * ce commerçant économise. On cache donc par PETITES TRANCHES (TTL court, 10
 * min par défaut) : une conversation active relit le même bloc à 10 % du prix,
 * puis le cache expire et ne coûte plus rien. `GEMINI_CONTEXT_CACHE_TTL_SECONDS`
 * permet d'allonger pour un compte très bavard.
 *
 * ⚠️ Google refuse la création en dessous d'un plancher (4 096 jetons pour la
 * famille Gemini 3, soit ~16 400 caractères) : en dessous, `cacheableChars()`
 * refuse AVANT l'appel réseau, sinon chaque message tenterait en vain une
 * création de cache (= latence + bruit dans les journaux).
 *
 * Le premier message n'est jamais retardé : il part normalement pendant que le
 * cache se construit en arrière-plan (`waitUntil`).
 */

import { CACHE_MIN_CHARS, CACHE_MIN_TOKENS, cacheDiagnostic, estimateTokens } from './rag.ts';

type CacheEntry = { name: string; expiresAt: number };

type CacheEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_CONTEXT_CACHE_ENABLED?: string;
  GEMINI_CONTEXT_CACHE_TTL_SECONDS?: string | number;
};

/** En dessous de ce plancher, Google refuse la création : on ne tente rien. */
const MIN_STABLE_PROMPT_CHARS = CACHE_MIN_CHARS;
const DEFAULT_TTL_SECONDS = 600; // 10 min : une conversation, pas une journée
const MAX_LOCAL_ENTRIES = 80;
const entries = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<void>>();
const blockedUntil = new Map<string, number>();
const stats = { created: 0, reused: 0, skippedSmall: 0, failed: 0 };

function isEnabled(env: CacheEnv): boolean {
  return !['0', 'false', 'off', 'no'].includes(String(env.GEMINI_CONTEXT_CACHE_ENABLED || 'true').trim().toLowerCase());
}

function ttlSeconds(env: CacheEnv): number {
  const parsed = Number(env.GEMINI_CONTEXT_CACHE_TTL_SECONDS);
  return Number.isFinite(parsed) ? Math.max(120, Math.min(86_400, Math.floor(parsed))) : DEFAULT_TTL_SECONDS;
}

function keyFor(model: string, instruction: string): string {
  // La consigne elle-même est la clé : aucune collision de hash ne peut
  // réutiliser le cache d'une autre entreprise ou d'un autre profil.
  return `${model}\u0000${instruction}`;
}

function remember(key: string, entry: CacheEntry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_LOCAL_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function blockCache(key: string, until: number) {
  blockedUntil.delete(key);
  blockedUntil.set(key, until);
  while (blockedUntil.size > MAX_LOCAL_ENTRIES) {
    const oldest = blockedUntil.keys().next().value;
    if (oldest === undefined) break;
    blockedUntil.delete(oldest);
  }
}

async function createCache(env: CacheEnv, model: string, instruction: string, key: string): Promise<void> {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return;
  const ttl = ttlSeconds(env);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.startsWith('models/') ? model : `models/${model}`,
        systemInstruction: { parts: [{ text: instruction }] },
        displayName: 'jawebflow-static-sales-prompt-v3',
        ttl: `${ttl}s`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({})) as any;
    const name = typeof payload?.name === 'string' ? payload.name : '';
    if (response.ok && name.startsWith('cachedContents/')) {
      const expiry = payload?.expireTime ? Date.parse(payload.expireTime) : Date.now() + ttl * 1000;
      remember(key, { name, expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + ttl * 1000 });
      stats.created += 1;
      console.info(
        `[gemini-cache] cache système prêt (${model}, ${Number(payload?.usageMetadata?.totalTokenCount || 0)} jetons, TTL ${ttl}s, ~${estimateTokens(instruction.length)} jetons envoyés à chaque message)`,
      );
      return;
    }

    const reason = String(payload?.error?.message || payload?.message || `HTTP ${response.status}`).slice(0, 180);
    stats.failed += 1;
    // Les petites consignes ou modèles qui ne supportent pas le cache ne
    // doivent pas déclencher un appel de création à chaque message.
    const cooldown = /too small|minimum token|not supported|unsupported|invalid.argument/i.test(reason) ? 6 * 60 * 60_000 : 60_000;
    blockCache(key, Date.now() + cooldown);
    console.info(`[gemini-cache] cache ignoré (${model}): ${reason}`);
  } catch (error: any) {
    stats.failed += 1;
    blockCache(key, Date.now() + 30_000);
    console.info(`[gemini-cache] indisponible, le bot continue sans cache (${error?.message || error})`);
  }
}

/** Renvoie immédiatement le cache local s'il est prêt, et sinon le préchauffe sans attendre. */
export function getGeminiContextCache(
  env: CacheEnv,
  model: string,
  systemInstruction: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): string | null {
  if (!isEnabled(env) || !env.GEMINI_API_KEY) return null;
  if (systemInstruction.length < MIN_STABLE_PROMPT_CHARS) {
    // Sous le plancher Google, aucune chance d'aboutir : on ne dépense rien.
    stats.skippedSmall += 1;
    return null;
  }
  const key = keyFor(model, systemInstruction);
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now() + 30_000) {
    stats.reused += 1;
    return existing.name;
  }
  if (existing) entries.delete(key);
  const blocked = blockedUntil.get(key) || 0;
  if (blocked > Date.now() || pending.has(key)) return null;

  const work = createCache(env, model, systemInstruction, key).finally(() => pending.delete(key));
  pending.set(key, work);
  if (typeof waitUntil === 'function') {
    try { waitUntil(work); } catch { void work.catch(() => {}); }
  } else {
    // En développement Node, laisser la promesse se terminer sans créer de rejet non géré.
    void work.catch(() => {});
  }
  return null;
}

/** Ligne lisible pour les diagnostics client : cache actif ou base envoyée entière. */
export function geminiCacheDiagnostic(systemInstruction: string, cachedContent: string | null): string {
  return cacheDiagnostic(estimateTokens(systemInstruction.length), !!cachedContent);
}

/** Ce qui s'est vraiment passé depuis le démarrage de l'isolate (journaux/tests). */
export function geminiContextCacheStats(): { created: number; reused: number; skippedSmall: number; failed: number; minChars: number; minTokens: number } {
  return { ...stats, minChars: MIN_STABLE_PROMPT_CHARS, minTokens: CACHE_MIN_TOKENS };
}

/** Réservé aux tests unitaires pour isoler les ressources de cache entre scénarios. */
export function resetGeminiContextCacheForTests(): void {
  entries.clear();
  pending.clear();
  blockedUntil.clear();
  stats.created = 0;
  stats.reused = 0;
  stats.skippedSmall = 0;
  stats.failed = 0;
}
