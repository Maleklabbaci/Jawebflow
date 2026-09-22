/**
 * JAWEBFLOW — Boucle d'apprentissage partagée (web + Instagram).
 * Après chaque réponse de l'IA : si l'info manquait, la question est
 * enregistrée dans `learning_questions` (onglet "Apprentissage IA" du
 * dashboard, où le commerçant y répond en un clic).
 */
import { supabaseLogLearningQuestion } from './supabase.ts';

/** Heuristique gratuite : la réponse propose de rappeler faute d'info. */
const FALLBACK_RE = /rappel(el|é)|laisse(z)?\s*(-?\s*(moi|nous))?\s*(ton|votre)\s*numéro|numéro de téléphone/i;

export async function runBackgroundLearning(
  env: any,
  opts: { assistantId: string; question: string; aiText: string; apiKey?: string; chatModel?: string }
): Promise<void> {
  try {
    const question = String(opts.question || '').trim();
    const aiText = String(opts.aiText || '');
    if (!question || question.length < 3 || !aiText) return;

    let logIt = FALLBACK_RE.test(aiText);
    let reason = 'no_info';

    // Auto-évaluation Gemini (mini appel, temperature 0) si pas de signal simple.
    if (!logIt && opts.apiKey) {
      try {
        const evalRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${opts.chatModel || 'gemini-3.1-flash-lite'}:generateContent?key=${opts.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: `Tu évalues si un assistant commercial AVAIT, dans sa base de connaissance, l'information nécessaire pour répondre à la question du client. Si la réponse esquive, est vague, ou propose d'être rappelé faute d'information, alors hadInfo=false. Réponds UNIQUEMENT avec ce JSON : {"hadInfo": true} ou {"hadInfo": false}.`
                }]
              },
              contents: [{ role: 'user', parts: [{ text: `Question du client : ${question}\nRéponse de l'assistant : ${aiText}` }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 50 },
            })
          }
        );
        if (evalRes.ok) {
          const evalText = (await evalRes.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (/"hadInfo"\s*:\s*false/.test(evalText)) {
            logIt = true;
            reason = 'eval_no_info';
          }
        }
      } catch (e) {
        console.error('[learning] auto-évaluation impossible:', (e as any)?.message || e);
      }
    }

    if (logIt) {
      await supabaseLogLearningQuestion(env, opts.assistantId, question, aiText, reason);
    }
  } catch (e) {
    console.error('[learning] erreur:', (e as any)?.message || e);
  }
}
