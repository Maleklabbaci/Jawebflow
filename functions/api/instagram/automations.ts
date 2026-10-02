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
import { LIMITS, rowToAutomation, sanitizeAutomationInput } from '../../_shared/ig-automation-core.ts';
import { isMissingTable, json, requireUser } from '../../_shared/ig-http.ts';

const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  const res = await supabaseRequest(
    context.env,
    `ig_automations?user_id=eq.${enc(user.uid)}&select=*&order=created_at.desc&limit=${LIMITS.maxAutomations + 10}`,
  );
  if (!res.ok) {
    const t = await res.text();
    if (isMissingTable(res.status, t)) return json(SETUP_REQUIRED);
    return json({ error: 'Impossible de lire tes automatisations pour le moment.' }, 502);
  }
  const rows = (await res.json()) as any[];
  return json({ setupRequired: false, automations: rows.map(rowToAutomation), limits: LIMITS });
}

async function countOwned(env: any, uid: string): Promise<number | 'missing' | 'error'> {
  const res = await supabaseRequest(env, `ig_automations?user_id=eq.${enc(uid)}&select=id&limit=${LIMITS.maxAutomations + 1}`);
  if (!res.ok) return isMissingTable(res.status, await res.text()) ? 'missing' : 'error';
  return ((await res.json()) as any[]).length;
}

export async function onRequestPost(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const env = context.env;
  const body = await readBody(context.request);

  const owned = await countOwned(env, user.uid);
  if (owned === 'missing') return json({ ...SETUP_REQUIRED, error: 'La base n’est pas encore prête : exécute d’abord la mise à jour SQL.' }, 409);
  if (owned === 'error') return json({ error: 'Impossible d’enregistrer pour le moment.' }, 502);
  if (owned >= LIMITS.maxAutomations) return json({ error: `Tu as atteint la limite de ${LIMITS.maxAutomations} automatisations. Supprime-en une avant d’en créer une autre.` }, 409);

  let row: Record<string, any>;
  if (body?.duplicateOf) {
    const id = String(body.duplicateOf);
    if (!UUID.test(id)) return json({ error: 'Automatisation inconnue.' }, 400);
    const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(user.uid)}&select=*`);
    const src = res.ok ? ((await res.json()) as any[])[0] : null;
    if (!src) return json({ error: 'Automatisation introuvable.' }, 404);
    row = {
      user_id: user.uid,
      name: `${String(src.name || 'Automatisation').slice(0, LIMITS.maxName - 9)} (copie)`,
      trigger_type: src.trigger_type,
      enabled: false, // une copie démarre toujours éteinte : on relit avant d'activer
      config: src.config || {},
    };
  } else {
    const checked = sanitizeAutomationInput(body?.automation);
    if (!checked.ok) return json({ error: checked.errors[0], errors: checked.errors }, 422);
    const v = checked.value!;
    row = { user_id: user.uid, name: v.name, trigger_type: v.triggerType, enabled: v.enabled === true, config: v.config };
  }

  const res = await supabaseRequest(env, 'ig_automations', { method: 'POST', body: JSON.stringify(row) });
  if (!res.ok) {
    console.error('[automations] création refusée:', res.status, (await res.text()).slice(0, 200));
    return json({ error: 'Impossible d’enregistrer pour le moment.' }, 502);
  }
  const created = ((await res.json()) as any[])[0];
  return json({ automation: rowToAutomation(created) }, 201);
}

export async function onRequestPatch(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const env = context.env;
  const body = await readBody(context.request);
  const id = String(body?.id || '');
  if (!UUID.test(id)) return json({ error: 'Automatisation inconnue.' }, 400);

  const cur = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(user.uid)}&select=*`);
  const existing = cur.ok ? ((await cur.json()) as any[])[0] : null;
  if (!existing) return json({ error: 'Automatisation introuvable.' }, 404);

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body?.automation) {
    // Le type de déclencheur ne change jamais après la création.
    const checked = sanitizeAutomationInput({ ...body.automation, triggerType: existing.trigger_type });
    if (!checked.ok) return json({ error: checked.errors[0], errors: checked.errors }, 422);
    patch.name = checked.value!.name;
    patch.config = checked.value!.config;
    if (typeof checked.value!.enabled === 'boolean') patch.enabled = checked.value!.enabled;
  }

  if (typeof body?.enabled === 'boolean') {
    if (body.enabled) {
      // On n'allume qu'une automatisation complète (message vide, mots-clés absents…).
      const candidate = patch.config
        ? { name: patch.name, triggerType: existing.trigger_type, config: patch.config }
        : { name: existing.name, triggerType: existing.trigger_type, config: existing.config };
      const checked = sanitizeAutomationInput(candidate);
      if (!checked.ok) return json({ error: `Impossible d’activer : ${checked.errors[0]}`, errors: checked.errors }, 422);
    }
    patch.enabled = body.enabled;
  }

  const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(user.uid)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) {
    console.error('[automations] mise à jour refusée:', res.status, (await res.text()).slice(0, 200));
    return json({ error: 'Impossible d’enregistrer pour le moment.' }, 502);
  }
  const updated = ((await res.json()) as any[])[0];
  return json({ automation: rowToAutomation(updated) });
}

export async function onRequestDelete(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return json({ error: 'Automatisation inconnue.' }, 400);
  const res = await supabaseRequest(context.env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(user.uid)}`, { method: 'DELETE' });
  if (!res.ok) return json({ error: 'Impossible de supprimer pour le moment.' }, 502);
  const rows = (await res.json().catch(() => [])) as any[];
  if (!rows.length) return json({ error: 'Automatisation introuvable.' }, 404);
  return json({ ok: true });
}
