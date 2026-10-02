/**
 * JAWEBFLOW — « Parler à mon IA » : le chat où le marchand donne des ordres à SON IA.
 *
 *   POST /api/copilot { assistantId, messages: [{role:'user'|'assistant', text}] }
 *        → { reply, actions: [...], state: {...} }
 *        L'IA lit l'état de l'entreprise, répond, et EXÉCUTE vraiment les ordres
 *        (fiches, comportement, réponses automatiques Instagram…).
 *
 *   POST /api/copilot { assistantId, op: {...} }
 *        → { ok, message, state }
 *        Opération directe, sans IA : « Annuler » une action, « Activer » une automatisation.
 *
 * Réservé au propriétaire de l'assistant (jeton Supabase). Le serveur ne garde
 * aucune conversation : le navigateur renvoie les derniers messages à chaque fois.
 * Ces échanges ne comptent PAS dans les conversations des clients de l'entreprise.
 */
import { supabaseConfigured, supabaseGetAssistant } from '../_shared/supabase.ts';
import { json, requireUser } from '../_shared/ig-http.ts';
import { COPILOT_LIMITS, TOOL_DECLARATIONS, buildSystemPrompt, cleanText } from '../_shared/copilot-core.ts';
import type { CopilotMessage } from '../_shared/copilot-core.ts';
import { CopilotRunner, applyOp, loadState } from '../_shared/copilot-tools.ts';
import { runToolLoop } from '../_shared/gemini-tools.ts';
import { addUsage, dailyMax, dayKey, readUsage } from '../_shared/copilot-usage.ts';

type Ctx = { request: Request; env: any; waitUntil?: (p: Promise<unknown>) => void };

// ─────────────────────────────────────────────────────────────────────────────
// Garde-fou : pas plus de N messages par fenêtre de temps et par marchand
// (mémoire de l'instance : suffisant pour couper les abus, sans base de données).
// ─────────────────────────────────────────────────────────────────────────────
const WINDOW_MS = 10 * 60 * 1000;
const CHAT_MAX = 40;
const OP_MAX = 120;
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

// Modèles essayés dans l'ordre. Un modèle introuvable (404) est mis de côté pour la suite.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const deadModels = new Set<string>();

/** Remet la mémoire de l'instance à zéro (utile aux tests). */
export function resetCopilotMemory(): void {
  hits.clear();
  deadModels.clear();
}

function pickModels(env: any): string[] {
  const wanted = [env.COPILOT_MODEL, ...DEFAULT_MODELS, env.GEMINI_MODEL].map((m) => String(m || '').trim()).filter(Boolean);
  const list = Array.from(new Set(wanted)).filter((m) => !deadModels.has(m));
  return list.length ? list : Array.from(new Set(wanted));
}

function learnDeadModels(diagnostics: string[]) {
  for (const d of diagnostics) {
    const m = /^(.+?): HTTP 404/.exec(d);
    if (m) deadModels.add(m[1]);
  }
}

export function cleanMessages(raw: unknown): CopilotMessage[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: CopilotMessage[] = [];
  for (const m of list.slice(-COPILOT_LIMITS.maxHistory)) {
    const role = m?.role === 'user' ? 'user' : m?.role === 'assistant' || m?.role === 'bot' || m?.role === 'model' ? 'assistant' : null;
    const text = cleanText(m?.text ?? m?.content, COPILOT_LIMITS.maxMessageChars);
    if (role && text) out.push({ role, text });
  }
  return out;
}

async function readBody(request: Request): Promise<any> {
  try { return await request.json(); } catch { return {}; }
}

export async function onRequestPost(context: Ctx) {
  const { request, env } = context;
  if (!supabaseConfigured(env)) return json({ error: 'La base de données n’est pas configurée.' }, 501);

  const user = await requireUser(context);
  if (user instanceof Response) return user;

  const body = await readBody(request);
  const assistantId = String(body?.assistantId || '').trim().slice(0, 100);
  if (!assistantId) return json({ error: 'Assistant manquant : enregistre d’abord ton assistant.' }, 400);

  const found = await supabaseGetAssistant(env, assistantId);
  if (!found.ok || !found.data) return json({ error: 'Assistant introuvable.' }, 404);
  if (String(found.data.user_id || '') !== user.uid) return json({ error: 'Cet assistant n’est pas le tien.' }, 403);

  // ── Opération directe (annuler / activer) ─────────────────────────────────
  if (body?.op) {
    if (rateLimited(`op:${user.uid}`, OP_MAX)) return json({ error: 'Trop d’actions d’un coup : attends quelques minutes.' }, 429);
    const done = await applyOp(env, user.uid, assistantId, found.data, body.op);
    if (done.ok === false) return json({ error: done.error }, done.status);
    return json({ ok: true, message: done.message, state: done.patch });
  }

  // ── Discussion avec l'IA ──────────────────────────────────────────────────
  const messages = cleanMessages(body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Écris-moi un message pour commencer.' }, 400);
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'Mon IA n’est pas encore disponible sur ce compte (activation en cours). Réessaie un peu plus tard.', kind: 'not_configured' }, 503);
  }
  if (rateLimited(`chat:${user.uid}`, CHAT_MAX)) {
    return json({ error: 'Tu m’as beaucoup écrit en peu de temps : fais une petite pause de quelques minutes, puis reviens.', kind: 'rate_limited' }, 429);
  }

  // Plafond du jour (durable) : seulement si la table du compteur existe.
  const day = dayKey();
  const max = dailyMax(env);
  const usage = await readUsage(env, user.uid, day);
  if (usage && usage.messages >= max) {
    return json({ error: `Tu as atteint la limite de ${max} messages par jour avec ton IA. Elle sera de nouveau disponible demain 🙂`, kind: 'daily_limit' }, 429);
  }

  const startedAt = Date.now();
  const state = await loadState(env, user.uid, found.data);
  const runner = new CopilotRunner({ env, uid: user.uid, assistantId, state });

  const loop = await runToolLoop({
    apiKey: env.GEMINI_API_KEY,
    baseUrl: env.GEMINI_API_BASE || undefined,
    models: pickModels(env),
    system: buildSystemPrompt(state.snapshot),
    history: messages.map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('model' as const), text: m.text })),
    tools: TOOL_DECLARATIONS,
    execute: (name, args) => runner.execute(name, args),
    maxRounds: COPILOT_LIMITS.maxRounds,
  });
  learnDeadModels(loop.diagnostics);

  // Journal sans AUCUN contenu du marchand : seulement ce qu'il faut pour surveiller le coût et les pannes.
  console.log('[copilot]', JSON.stringify({
    model: loop.model,
    rounds: loop.rounds,
    tools: loop.toolCalls.map((t) => t.name),
    actions: runner.actions.length,
    error: loop.error?.kind || null,
    tokensIn: loop.usage.promptTokens,
    tokensOut: loop.usage.outputTokens,
    ms: Date.now() - startedAt,
  }));
  if (loop.error) console.warn('[copilot] diagnostic:', loop.diagnostics.join(' | ').slice(0, 600));

  // Un message compte seulement si l'IA a réellement travaillé (une panne ne consomme pas la limite du marchand).
  if (usage && (!loop.error || loop.model)) {
    const saving = addUsage(env, user.uid, day, usage, { messages: 1, tokensIn: loop.usage.promptTokens, tokensOut: loop.usage.outputTokens });
    if (context.waitUntil) context.waitUntil(saving);
    else await saving;
  }

  const actions = runner.actions;
  if (loop.error && !actions.length) {
    const map = {
      quota: [429, 'Mon IA a beaucoup travaillé : réessaie dans une minute.'],
      timeout: [504, 'Ça prend plus de temps que prévu. Réessaie dans un instant.'],
      no_key: [503, 'Mon IA n’est pas encore disponible sur ce compte (activation en cours).'],
      unavailable: [502, 'Mon IA est momentanément indisponible. Réessaie dans un instant.'],
      empty: [502, 'Je n’ai pas réussi à répondre. Réessaie en reformulant.'],
    } as const;
    const [status, error] = map[loop.error.kind] || map.unavailable;
    return json({ error, kind: loop.error.kind }, status);
  }

  let reply = loop.text;
  if (loop.error) {
    // Des actions ont déjà été faites : on le dit honnêtement plutôt que de tout perdre.
    reply = `${reply ? `${reply}\n\n` : ''}J’ai bien fait ce qui est indiqué ci-dessous, mais je n’ai pas pu terminer ma réponse.`;
  }
  if (!reply) reply = actions.length ? 'C’est fait ✅' : 'Je n’ai pas bien compris : tu peux reformuler ?';

  return json({ reply, actions, state: runner.patch });
}
