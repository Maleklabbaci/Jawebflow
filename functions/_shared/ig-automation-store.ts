/**
 * JAWEBFLOW — Automatisations Instagram : lire / créer / modifier / supprimer
 * dans la base. UNE seule implémentation, utilisée par :
 *   • /api/instagram/automations (l'écran « Automatisations »),
 *   • /api/copilot (le chat « Parler à mon IA »).
 * Ainsi, ce que fait le chat est EXACTEMENT ce que ferait l'écran :
 * mêmes contrôles, mêmes limites, mêmes messages en français.
 */
import { supabaseRequest } from './supabase.ts';
import { LIMITS, rowToAutomation, sanitizeAutomationInput } from './ig-automation-core.ts';
import type { Automation, AutomationConfig, AutomationInput, TriggerType } from './ig-automation-core.ts';
import { isMissingTable } from './ig-http.ts';

const enc = encodeURIComponent;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SETUP_MESSAGE = 'La base n’est pas encore prête : exécute d’abord la mise à jour SQL.';

export type StoreFailure = {
  ok: false;
  status: number;
  error: string;
  errors?: string[];
  /** La table n'existe pas encore (mise à jour SQL pas encore exécutée). */
  setupRequired?: boolean;
};
export type StoreResult<T> = { ok: true; value: T } | StoreFailure;

const fail = (status: number, error: string, extra: Partial<StoreFailure> = {}): StoreFailure => ({ ok: false, status, error, ...extra });

/** Toutes les automatisations du marchand (les plus récentes d'abord). */
export async function listAutomations(env: any, uid: string): Promise<StoreResult<Automation[]>> {
  const res = await supabaseRequest(
    env,
    `ig_automations?user_id=eq.${enc(uid)}&select=*&order=created_at.desc&limit=${LIMITS.maxAutomations + 10}`,
  );
  if (!res.ok) {
    const t = await res.text();
    if (isMissingTable(res.status, t)) return fail(409, SETUP_MESSAGE, { setupRequired: true });
    return fail(502, 'Impossible de lire tes automatisations pour le moment.');
  }
  return { ok: true, value: ((await res.json()) as any[]).map(rowToAutomation) };
}

async function countOwned(env: any, uid: string): Promise<number | 'missing' | 'error'> {
  const res = await supabaseRequest(env, `ig_automations?user_id=eq.${enc(uid)}&select=id&limit=${LIMITS.maxAutomations + 1}`);
  if (!res.ok) return isMissingTable(res.status, await res.text()) ? 'missing' : 'error';
  return ((await res.json()) as any[]).length;
}

/** Vérifie qu'on peut encore en créer une (table prête + limite). */
async function checkRoomForOne(env: any, uid: string): Promise<StoreFailure | null> {
  const owned = await countOwned(env, uid);
  if (owned === 'missing') return fail(409, SETUP_MESSAGE, { setupRequired: true });
  if (owned === 'error') return fail(502, 'Impossible d’enregistrer pour le moment.');
  if (owned >= LIMITS.maxAutomations) {
    return fail(409, `Tu as atteint la limite de ${LIMITS.maxAutomations} automatisations. Supprime-en une avant d’en créer une autre.`);
  }
  return null;
}

async function insertRow(env: any, row: Record<string, any>): Promise<StoreResult<Automation>> {
  const res = await supabaseRequest(env, 'ig_automations', { method: 'POST', body: JSON.stringify(row) });
  if (!res.ok) {
    console.error('[automations] création refusée:', res.status, (await res.text()).slice(0, 200));
    return fail(502, 'Impossible d’enregistrer pour le moment.');
  }
  const created = ((await res.json()) as any[])[0];
  return { ok: true, value: rowToAutomation(created) };
}

export async function createAutomation(env: any, uid: string, input: AutomationInput | any): Promise<StoreResult<Automation>> {
  const room = await checkRoomForOne(env, uid);
  if (room) return room;
  const checked = sanitizeAutomationInput(input);
  if (!checked.ok) return fail(422, checked.errors[0], { errors: checked.errors });
  const v = checked.value!;
  return insertRow(env, { user_id: uid, name: v.name, trigger_type: v.triggerType, enabled: v.enabled === true, config: v.config });
}

export async function duplicateAutomation(env: any, uid: string, sourceId: string): Promise<StoreResult<Automation>> {
  const room = await checkRoomForOne(env, uid);
  if (room) return room;
  if (!UUID_RE.test(sourceId)) return fail(400, 'Automatisation inconnue.');
  const src = await getRow(env, uid, sourceId);
  if (!src) return fail(404, 'Automatisation introuvable.');
  return insertRow(env, {
    user_id: uid,
    name: `${String(src.name || 'Automatisation').slice(0, LIMITS.maxName - 9)} (copie)`,
    trigger_type: src.trigger_type,
    enabled: false, // une copie démarre toujours éteinte : on relit avant d'activer
    config: src.config || {},
  });
}

async function getRow(env: any, uid: string, id: string): Promise<any | null> {
  const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(uid)}&select=*`);
  return res.ok ? ((await res.json()) as any[])[0] || null : null;
}

export async function getAutomation(env: any, uid: string, id: string): Promise<StoreResult<Automation>> {
  if (!UUID_RE.test(id)) return fail(400, 'Automatisation inconnue.');
  const row = await getRow(env, uid, id);
  return row ? { ok: true, value: rowToAutomation(row) } : fail(404, 'Automatisation introuvable.');
}

/**
 * Modifie une automatisation : `automation` (contenu complet, remplace) et/ou
 * `enabled` (marche / arrêt). Le type de déclencheur ne change jamais.
 */
export async function updateAutomation(
  env: any,
  uid: string,
  id: string,
  patchIn: { automation?: AutomationInput | any; enabled?: boolean },
): Promise<StoreResult<{ automation: Automation; before: Automation }>> {
  if (!UUID_RE.test(id)) return fail(400, 'Automatisation inconnue.');
  const existing = await getRow(env, uid, id);
  if (!existing) return fail(404, 'Automatisation introuvable.');

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (patchIn.automation) {
    const checked = sanitizeAutomationInput({ ...patchIn.automation, triggerType: existing.trigger_type });
    if (!checked.ok) return fail(422, checked.errors[0], { errors: checked.errors });
    patch.name = checked.value!.name;
    patch.config = checked.value!.config;
    if (typeof checked.value!.enabled === 'boolean') patch.enabled = checked.value!.enabled;
  }

  if (typeof patchIn.enabled === 'boolean') {
    if (patchIn.enabled) {
      // On n'allume qu'une automatisation complète (message vide, mots-clés absents…).
      const candidate = patch.config
        ? { name: patch.name, triggerType: existing.trigger_type, config: patch.config }
        : { name: existing.name, triggerType: existing.trigger_type, config: existing.config };
      const checked = sanitizeAutomationInput(candidate);
      if (!checked.ok) return fail(422, `Impossible d’activer : ${checked.errors[0]}`, { errors: checked.errors });
    }
    patch.enabled = patchIn.enabled;
  }

  const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(uid)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) {
    console.error('[automations] mise à jour refusée:', res.status, (await res.text()).slice(0, 200));
    return fail(502, 'Impossible d’enregistrer pour le moment.');
  }
  const updated = ((await res.json()) as any[])[0];
  return { ok: true, value: { automation: rowToAutomation(updated), before: rowToAutomation(existing) } };
}

export async function deleteAutomation(env: any, uid: string, id: string): Promise<StoreResult<{ deleted: Automation }>> {
  if (!UUID_RE.test(id)) return fail(400, 'Automatisation inconnue.');
  const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(uid)}`, { method: 'DELETE' });
  if (!res.ok) return fail(502, 'Impossible de supprimer pour le moment.');
  const rows = (await res.json().catch(() => [])) as any[];
  if (!rows.length) return fail(404, 'Automatisation introuvable.');
  return { ok: true, value: { deleted: rowToAutomation(rows[0]) } };
}

/**
 * Remet une automatisation telle qu'elle était (annulation d'une suppression),
 * avec le MÊME identifiant. Le contenu est re-validé comme n'importe quelle création.
 */
export async function reinsertAutomation(
  env: any,
  uid: string,
  snapshot: { id: string; name: string; triggerType: TriggerType; enabled: boolean; config: AutomationConfig | any },
): Promise<StoreResult<Automation>> {
  if (!UUID_RE.test(String(snapshot?.id || ''))) return fail(400, 'Automatisation inconnue.');
  const room = await checkRoomForOne(env, uid);
  if (room) return room;
  const checked = sanitizeAutomationInput({ name: snapshot.name, triggerType: snapshot.triggerType, config: snapshot.config });
  if (!checked.ok) return fail(422, checked.errors[0], { errors: checked.errors });
  const v = checked.value!;
  return insertRow(env, {
    id: snapshot.id,
    user_id: uid,
    name: v.name,
    trigger_type: v.triggerType,
    // Elle ne se rallume jamais toute seule : seulement si elle était déjà prête.
    enabled: snapshot.enabled === true,
    config: v.config,
  });
}
