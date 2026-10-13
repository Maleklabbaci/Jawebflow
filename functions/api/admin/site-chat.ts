/**
 * JAWEBFLOW — RÉGLAGES DU CHATBOT DU SITE (console admin)
 * ============================================================================
 * GET  /api/admin/site-chat   (Authorization: Bearer <jeton ADMIN>)
 *   → les réglages complets, y compris la base de connaissance et les
 *     valeurs par défaut si rien n'a encore été enregistré.
 *
 * POST /api/admin/site-chat   { config: {...} }
 *   → enregistre les réglages. Tout est nettoyé et borné côté serveur
 *     (`normalizeSiteChat`) : le navigateur ne peut pas écrire n'importe quoi.
 *
 * Sécurité : jeton Supabase exigé + rôle `admin`/`superadmin` vérifié en base.
 * Un marchand — même connecté — obtient 403 et ne voit RIEN de ces réglages.
 *
 * Sans la table `platform_settings` (migration pas encore passée), la lecture
 * renvoie les valeurs par défaut et l'écriture explique quoi faire : la console
 * reste utilisable et le message est clair.
 */
import { verifySupabaseIdToken, supabaseRequest } from '../../_shared/supabase.ts';
import {
  readSiteChatConfig,
  saveSiteChatConfig,
  siteChatDiag,
  readSiteLeads,
  markSiteLead,
} from '../../_shared/site-chat.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/** Vérifie le jeton puis le rôle : renvoie null si la porte est fermée. */
async function requireAdmin(env: any, request: Request) {
  const caller = await verifySupabaseIdToken(env, request.headers.get('Authorization'));
  if (!caller) return { error: json({ ok: false, error: 'non authentifié' }, 401) };
  const res = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(caller.uid)}&select=role`);
  const role = res.ok ? ((await res.json().catch(() => [])) || [])[0]?.role : null;
  if (role !== 'admin' && role !== 'superadmin') {
    return { error: json({ ok: false, error: "réservé à l'admin" }, 403) };
  }
  return { caller, role };
}

export async function onRequestGet(context: any) {
  const env = context.env || {};
  const gate = await requireAdmin(env, context.request);
  if (gate.error) return gate.error;

  const { config, stored, available, error } = await readSiteChatConfig(env);
  // `error` + `diag` : quand la table est injoignable, la console doit pouvoir
  // dire OÙ (quel projet Supabase) et QUOI FAIRE — le cas n°1 des « j'ai
  // pourtant exécuté le SQL » est un SQL exécuté dans un autre projet.
  // 🎯 Les demandes que l'assistant a NOTÉES pendant les appels du site :
  // elles s'affichent dans la console, et l'admin les marque « traité ».
  const leads = await readSiteLeads(env);
  return json({
    ok: true,
    stored,
    available,
    error,
    diag: siteChatDiag(env),
    config,
    leads: leads.slice(0, 50),
    leadCount: leads.length,
    newLeadCount: leads.filter((l) => l.status !== 'traite').length,
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  const gate = await requireAdmin(env, context.request);
  if (gate.error) return gate.error;

  const body = await context.request.json().catch(() => ({} as any));

  // Marquer une demande du site comme traitée (ou la remettre en « nouveau »).
  if (body?.action === 'mark-lead') {
    const id = String(body?.id || '').trim().slice(0, 120);
    const status = body?.status === 'nouveau' ? 'nouveau' : 'traite';
    if (!id) return json({ ok: false, error: 'id requis' }, 400);
    const marked = await markSiteLead(env, id, status);
    if (!marked.ok) return json({ ok: false, error: marked.error || 'Marquage impossible.' }, 502);
    const leads = await readSiteLeads(env);
    return json({ ok: true, leads: leads.slice(0, 50), leadCount: leads.length });
  }

  // On accepte { config } (forme normale) ou l'objet direct : plus tolérant
  // pour les scripts, sans jamais faire confiance au contenu.
  const raw = body && typeof body === 'object' && body.config && typeof body.config === 'object' ? body.config : body;

  const result = await saveSiteChatConfig(env, raw);
  if (!result.ok) {
    return json(
      { ok: false, error: result.error || 'Enregistrement impossible.', detail: result.detail || '', diag: siteChatDiag(env) },
      502,
    );
  }

  const { config } = await readSiteChatConfig(env);
  return json({ ok: true, stored: true, config });
}
