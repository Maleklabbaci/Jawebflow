/**
 * JAWEBFLOW — AUTO-APPRENTISSAGE HEBDOMADAIRE (le bot s'améliore TOUT SEUL)
 * ------------------------------------------------------------
 * GET/POST /api/cron/learn?token=CRON_SECRET
 *
 * Appelé UNE FOIS PAR SEMAINE par cron-job.org. Pour chaque assistant ayant
 * eu assez de conversations : UN SEUL appel Gemini relit les échanges des
 * 14 derniers jours et extrait jusqu'à 3 informations DURABLES confirmées
 * par l'entreprise (prix, horaires, délais, conditions) qui ne figurent pas
 * déjà dans la base de connaissance. Elles sont ajoutées comme notes
 * « learned » : dès le message suivant, le bot répond mieux. Le commerçant
 * n'a RIEN à faire — et s'il part, il repart de zéro.
 *
 * Garde-fous : max 3 notes/assistant/run, jamais d'invention hors échanges,
 * doublons ignorés (titre similaire déjà présent).
 */

import { supabaseRequest, supabaseConfigured, supabaseAddKnowledgeNote, supabasePatchAssistant } from '../../_shared/supabase.ts';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

function titleSimilar(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9àâäéèêëïîôöùûüç\s]/gi, '').split(/\s+/).filter(w => w.length > 3);
  const wa = new Set(norm(a));
  const wb = norm(b);
  if (!wa.size || !wb.length) return false;
  const inter = wb.filter(w => wa.has(w)).length;
  return inter / Math.max(1, Math.min(wa.size, wb.length)) >= 0.6;
}

async function handle(context) {
  const env = context.env;
  const url = new URL(context.request.url);
  const token = url.searchParams.get('token') || (context.request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) return json({ ok: false, error: 'token invalide' }, 401);
  if (!supabaseConfigured(env)) return json({ ok: false, error: 'service non configuré' }, 500);
  if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'GEMINI_API_KEY manquante' }, 500);

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  // Assistant aux identifiants compatibles Firestore pour l'instant => on ne
  // traite que Supabase (les colonnes knowledge_notes existent ici).
  // Clients GRATUITS = zéro appel IA : leurs assistants sont ignorés.
  const freeIds = new Set();
  try {
    const fRes = await supabaseRequest(env, 'users?plan=eq.free&select=id');
    if (fRes.ok) for (const u of await fRes.json()) freeIds.add(u.id);
  } catch { /* en cas de pépin, on traite quand même (comportement précédent) */ }

  const aRes = await supabaseRequest(env, 'assistants?select=id,user_id,business_name,knowledge_notes,config&order=updated_at.desc&limit=30');
  if (!aRes.ok) return json({ ok: false, error: 'lecture assistants impossible' }, 500);
  const assistants = await aRes.json();

  let updated = 0, skipped = 0, failed = 0, calls = 0;

  for (const assistant of assistants || []) {
    try {
      if (freeIds.has(assistant.user_id)) { skipped++; continue; } // plan gratuit : zéro API
      if (calls >= 15) { skipped++; continue; } // budget : max 15 appels IA par passage

      // Conversations des 14 derniers jours
      const cRes = await supabaseRequest(
        env,
        `conversation_contexts?assistant_id=eq.${encodeURIComponent(assistant.id)}&created_at=gte.${since}&order=created_at.desc&limit=40&select=user_message,assistant_response`
      );
      const convs = cRes.ok ? await cRes.json() : [];
      if (!convs || convs.length < 6) { skipped++; continue; }

      const transcript = convs
        .map(c => `Client: ${String(c.user_message || '').slice(0, 200)}\nEntreprise: ${String(c.assistant_response || '').slice(0, 250)}`)
        .join('\n---\n');
      const existingTitles = (assistant.knowledge_notes || []).map(n => n?.title || '');

      const prompt = `Voici des échanges réels entre des clients et l'assistant de "${assistant.business_name || 'une entreprise'}".

TÂCHE : identifie jusqu'à 3 informations DURABLES que l'ENTREPRISE a confirmées dans ces échanges (prix précis, horaires, délais de livraison, zones, conditions, garanties) ET qui manquent probablement dans sa base de connaissance actuelle.

Base de connaissance actuelle (titres) : ${existingTitles.slice(0, 30).join(' | ') || '(vide)'}

RÈGLES STRICTES :
- UNIQUEMENT des faits réellement confirmés dans les échanges ci-dessous (jamais inventés)
- formulation neutre et factuelle, utilisable comme fiche de référence
- si rien de nouveau : liste vide

ET AUSSI (profil de la cible) : déduis des échanges QUI parle à ce bot (langue réellement utilisée, style, attentes) et comment l'assistant doit adapter son ton pour être plus performant avec CETTE cible.

RÉPONDS UNIQUEMENT en JSON : {"notes":[{"title":"Titre court","content":"Fait précis avec les chiffres/détails"}],"audience":{"langue":"fr | darija | mixte observé","style":"comment les clients parlent (tutoiement, jeunes, pressés...)","insights":"3 à 4 phrases maximum : qui est la cible et comment adapter le ton pour mieux vendre"}}

ÉCHANGES :
${transcript.slice(0, 12000)}`;

      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
        }),
      });
      calls++;
      if (!gRes.ok) { failed++; continue; }
      const gData = await gRes.json().catch(() => null);
      const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let parsed = null;
      try { parsed = JSON.parse(String(raw).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()); } catch { failed++; continue; }

      const notes = Array.isArray(parsed?.notes) ? parsed.notes.slice(0, 3) : [];
      let added = 0;
      for (const note of notes) {
        if (!note?.title || !note?.content) continue;
        if ((existingTitles || []).some(t => titleSimilar(t, note.title))) continue;
        const ok = await supabaseAddKnowledgeNote(env, assistant.id, {
          title: `Auto : ${String(note.title).slice(0, 100)}`,
          content: String(note.content),
        });
        if (ok) { added++; existingTitles.push(note.title); }
      }
      // 🎭 AUTO-DÉVELOPPEMENT : le bot affine SON STYLE avec SA cible,
      // chaque semaine, à partir des vraies conversations.
      const aud = parsed?.audience;
      if (aud && typeof aud.insights === 'string' && aud.insights.trim().length > 30) {
        const beh = (assistant.config && assistant.config.behavior) || {};
        await supabasePatchAssistant(env, assistant.id, {
          behavior: { ...beh, autoInsights: String(aud.insights).slice(0, 600) },
        });
        console.log(`[learn] ${assistant.business_name || assistant.id} : profil de cible mis à jour`);
      }
      if (added) { updated++; console.log(`[learn] ${assistant.business_name || assistant.id} : +${added} note(s) auto`); }
      else skipped++;
    } catch {
      failed++;
    }
  }

  console.log(`[cron] auto-apprentissage : ${updated} assistant(s) enrichi(s), ${skipped} ignoré(s), ${failed} échec(s)`);
  return json({ ok: true, updated, skipped, failed, geminiCalls: calls });
}

export async function onRequestGet(context) { return handle(context); }
export async function onRequestPost(context) { return handle(context); }
