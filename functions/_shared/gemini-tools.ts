/**
 * JAWEBFLOW — Boucle « appel d'outils » avec Gemini (REST generateContent).
 *
 * Le modèle lit la demande, répond soit par du texte (fini), soit par une ou
 * plusieurs demandes d'outils. On les exécute, on lui renvoie les résultats, et
 * il continue — jusqu'à une réponse finale, ou une limite (nombre de tours, temps).
 *
 * Règles de l'API respectées (documentation « function calling » / « thought
 * signatures ») :
 *   • la réponse du modèle est renvoyée TELLE QUELLE dans l'historique (ses
 *     « signatures de réflexion » doivent revenir dans leur partie d'origine) ;
 *   • chaque résultat reprend l'`id` de la demande ;
 *   • le même modèle sert pour tous les tours d'une même demande.
 */
import type { ToolDeclaration } from './copilot-core.ts';

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export type LoopErrorKind = 'no_key' | 'quota' | 'unavailable' | 'timeout' | 'empty';

export interface ToolLoopResult {
  /** Réponse finale en texte (peut être vide si le modèle n'a rien dit après ses outils). */
  text: string;
  model: string | null;
  rounds: number;
  toolCalls: ToolCallRecord[];
  usage: { promptTokens: number; outputTokens: number };
  error?: { kind: LoopErrorKind; message: string };
  diagnostics: string[];
}

export interface ToolLoopOptions {
  apiKey: string;
  /** Modèles essayés dans l'ordre pour le PREMIER tour (repli si indisponible). */
  models: string[];
  system: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  tools: ToolDeclaration[];
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxRounds?: number;
  /** Adresse de l'API (par défaut celle de Google ; changeable pour un relais ou un essai local). */
  baseUrl?: string;
  /** Plafond pour UN appel au modèle. */
  callTimeoutMs?: number;
  /** Plafond pour toute la demande. */
  totalTimeoutMs?: number;
  maxOutputTokens?: number;
}

type Part = Record<string, any>;
type Content = { role: 'user' | 'model'; parts: Part[] };

/** Historique « texte seulement » → format Gemini (alternance user/model, commence par user). */
export function toContents(history: Array<{ role: 'user' | 'model'; text: string }>): Content[] {
  const out: Content[] = [];
  for (const m of history) {
    const text = String(m.text || '').trim();
    if (!text) continue;
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n\n${text}`;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function generationConfig(model: string, maxOutputTokens: number, withThinking: boolean): Record<string, unknown> {
  const cfg: Record<string, unknown> = { maxOutputTokens };
  if (/^gemini-3|latest$/.test(model)) {
    // Gemini 3 : on garde la température par défaut (recommandé) et une réflexion légère.
    if (withThinking) cfg.thinkingConfig = { thinkingLevel: 'low' };
  } else {
    cfg.temperature = 0.4;
    if (withThinking && /gemini-2\.5-flash/.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  }
  return cfg;
}

interface CallOk { ok: true; model: string; parts: Part[]; usage: { promptTokens: number; outputTokens: number } }
interface CallFail { ok: false; kind: LoopErrorKind }

async function callModel(
  opts: ToolLoopOptions,
  models: string[],
  contents: Content[],
  mode: 'AUTO' | 'NONE',
  timeoutMs: number,
  diagnostics: string[],
): Promise<CallOk | CallFail> {
  let sawTimeout = false;
  for (const model of models) {
    for (const withThinking of [true, false]) {
      try {
        const base = (opts.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
        const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents,
            tools: [{ functionDeclarations: opts.tools }],
            toolConfig: { functionCallingConfig: { mode } },
            generationConfig: generationConfig(model, opts.maxOutputTokens || 4096, withThinking),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 429) {
          diagnostics.push(`${model}: quota dépassé (429)`);
          return { ok: false, kind: 'quota' };
        }
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 300);
          // Réglage de réflexion refusé par ce modèle : on retente le MÊME modèle sans ce réglage.
          if (res.status === 400 && withThinking && /thinking/i.test(body)) {
            diagnostics.push(`${model}: réglage de réflexion refusé, nouvel essai sans`);
            continue;
          }
          diagnostics.push(`${model}: HTTP ${res.status} ${body}`);
          break; // autre modèle
        }

        const data: any = await res.json().catch(() => null);
        const cand = data?.candidates?.[0];
        const parts: Part[] = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
        if (!parts.length) {
          diagnostics.push(`${model}: réponse vide (${cand?.finishReason || data?.promptFeedback?.blockReason || 'inconnu'})`);
          break;
        }
        const um = data?.usageMetadata || {};
        return { ok: true, model, parts, usage: { promptTokens: Number(um.promptTokenCount) || 0, outputTokens: Number(um.candidatesTokenCount) || 0 } };
      } catch (e: any) {
        const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        if (timeout) sawTimeout = true;
        diagnostics.push(`${model}: ${timeout ? `délai dépassé (${timeoutMs} ms)` : e?.message || e}`);
        break;
      }
    }
  }
  return { ok: false, kind: sawTimeout ? 'timeout' : 'unavailable' };
}

const textOf = (parts: Part[]): string =>
  parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const diagnostics: string[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const usage = { promptTokens: 0, outputTokens: 0 };
  const result: ToolLoopResult = { text: '', model: null, rounds: 0, toolCalls, usage, diagnostics };

  if (!opts.apiKey) {
    result.error = { kind: 'no_key', message: 'Clé Gemini absente' };
    return result;
  }

  const maxRounds = Math.max(1, opts.maxRounds || 5);
  const startedAt = Date.now();
  const total = opts.totalTimeoutMs || 45000;
  const contents = toContents(opts.history);
  let model: string | null = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    const remaining = total - (Date.now() - startedAt);
    if (remaining < 1500) {
      result.error = { kind: 'timeout', message: 'Temps total dépassé' };
      return result;
    }
    // Dernier tour : on interdit les outils pour obtenir une vraie réponse écrite.
    const mode = round === maxRounds ? 'NONE' : 'AUTO';
    const call = await callModel(opts, model ? [model] : opts.models, contents, mode, Math.min(opts.callTimeoutMs || 20000, remaining), diagnostics);
    result.rounds = round;
    if (call.ok === false) {
      result.error = { kind: call.kind, message: `Gemini indisponible (${call.kind})` };
      return result;
    }
    model = call.model;
    result.model = model;
    usage.promptTokens += call.usage.promptTokens;
    usage.outputTokens += call.usage.outputTokens;

    const calls = call.parts.filter((p) => p.functionCall && typeof p.functionCall.name === 'string');
    if (!calls.length) {
      result.text = textOf(call.parts);
      return result;
    }

    contents.push({ role: 'model', parts: call.parts }); // verbatim (signatures de réflexion comprises)
    const responses: Part[] = [];
    for (const p of calls) {
      const fc = p.functionCall;
      const args = fc.args && typeof fc.args === 'object' ? (fc.args as Record<string, unknown>) : {};
      let res: Record<string, unknown>;
      try {
        res = await opts.execute(fc.name, args);
      } catch (e: any) {
        console.error('[gemini-tools] exécution en échec:', fc.name, e?.message || e);
        res = { ok: false, error: 'Une erreur est survenue pendant cette action.' };
      }
      toolCalls.push({ name: fc.name, args, result: res });
      responses.push({ functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: res } });
    }
    contents.push({ role: 'user', parts: responses });
  }

  // Normalement inatteignable (le dernier tour interdit les outils) : sécurité.
  result.error = { kind: 'empty', message: 'Pas de réponse finale' };
  return result;
}
