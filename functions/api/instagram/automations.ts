/**
 * JAWEBFLOW — Automatisations Instagram : créer, modifier, activer, dupliquer,
 * supprimer, consulter l'historique.
 *
 *   GET    /api/instagram/automations                       → la liste
 *   GET    /api/instagram/automations?view=events           → l'historique (+ &automationId=… &limit=…)
 *   POST   /api/instagram/automations {automation}          → créer
 *   POST   /api/instagram/automations {duplicateOf: id}     → dupliquer
 *   PATCH  /api/instagram/automations {id, enabled}         → activer / désactiver
 *   PATCH  /api/instagram/automations {id, automation}      → modifier
 *   DELETE /api/instagram/automations?id=…                  → supprimer
 *
 * Réservé au marchand connecté. Tout ce qui est enregistré est validé et
 * nettoyé par sanitizeAutomationInput (même code que l'interface).
 */
import { supabaseRequest } from '../../_shared/supabase.ts';
import { LIMITS } from '../../_shared/ig-automation-core.ts';
import {
  UUID_RE as UUID,
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  listAutomations,
  updateAutomation,
} from '../../_shared/ig-automation-store.ts';
import type { StoreFailure } from '../../_shared/ig-automation-store.ts';
import { isMissingTable, json, requireUser } from '../../_shared/ig-http.ts';

const enc = encodeURIComponent;
const SETUP_REQUIRED = { setupRequired: true, automations: [] as unknown[], events: [] as unknown[] };

type Ctx = { request: Request; env: any };

async function readBody(request: Request): Promise<any> {
  try { return await request.json(); } catch { return {}; }
}

export async function onRequestGet(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const url = new URL(context.request.url);

  if (url.searchParams.get('view') === 'events') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
    const automationId = url.searchParams.get('automationId') || '';
    if (automationId && !UUID.test(automationId)) return json({ error: 'Automatisation inconnue.' }, 400);
    const res = await supabaseRequest(
      context.env,
      `ig_automation_events?user_id=eq.${enc(user.uid)}${automationId ? `&automation_id=eq.${enc(automationId)}` : ''}` +
        `&select=id,automation_id,automation_name,trigger_type,contact_username,input_text,public_reply_text,public_reply_status,dm_text,dm_status,gate_state,outcome,error,note,created_at` +
        `&order=created_at.desc&limit=${limit}`,
    );
    if (!res.ok) {
      const t = await res.text();
      if (isMissingTable(res.status, t)) return json(SETUP_REQUIRED);
      return json({ error: 'Impossible de lire l’historique pour le moment.' }, 502);
    }
    const rows = (await res.json()) as any[];
    return json({
      events: rows.map((r) => ({
        id: r.id,
        automationId: r.automation_id,
        automationName: r.automation_name || '',
        triggerType: r.trigger_type,
        username: r.contact_username || '',
        inputText: r.input_text || '',
        publicReplyText: r.public_reply_text || '',
        publicReplyStatus: r.public_reply_status || null,
        dmText: r.dm_text || '',
        dmStatus: r.dm_status || null,
        gateState: r.gate_state || null,
        outcome: r.outcome || 'processing',
        error: r.error || '',
        note: r.note || '',
        createdAt: r.created_at,
      })),
    });
  }

  const listed = await listAutomations(context.env, user.uid);
  if (listed.ok === false) return listed.setupRequired ? json(SETUP_REQUIRED) : failure(listed);
  return json({ setupRequired: false, automations: listed.value, limits: LIMITS });
}

/** Réponse d'erreur : même forme qu'avant (message principal + liste complète si plusieurs). */
function failure(f: StoreFailure): Response {
  return json({ error: f.error, ...(f.errors ? { errors: f.errors } : {}), ...(f.setupRequired ? SETUP_REQUIRED : {}) }, f.status);
}

export async function onRequestPost(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const body = await readBody(context.request);

  const made = body?.duplicateOf
    ? await duplicateAutomation(context.env, user.uid, String(body.duplicateOf))
    : await createAutomation(context.env, user.uid, body?.automation);
  if (made.ok === false) return failure(made);
  return json({ automation: made.value }, 201);
}

export async function onRequestPatch(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const body = await readBody(context.request);
  const id = String(body?.id || '');

  const updated = await updateAutomation(context.env, user.uid, id, {
    automation: body?.automation || undefined,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
  });
  if (updated.ok === false) return failure(updated);
  return json({ automation: updated.value.automation });
}

export async function onRequestDelete(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const id = new URL(context.request.url).searchParams.get('id') || '';
  const removed = await deleteAutomation(context.env, user.uid, id);
  if (removed.ok === false) return failure(removed);
  return json({ ok: true });
}
