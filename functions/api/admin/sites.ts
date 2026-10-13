/**
 * JAWEBFLOW — 🌐 QUI EST BRANCHÉ SUR QUOI (console admin)
 * ============================================================================
 * GET /api/admin/sites   (Authorization: Bearer <jeton ADMIN>)
 *
 * Répond à une seule question, celle de Jimmy : « quels sites mes clients ont
 * connectés ? » — et, tant qu'on y est, quels réseaux tournent dessus.
 *
 * Pour chaque client :
 *   • ses assistants (= ses sites) : l'adresse du site, les domaines autorisés
 *     pour la bulle, la clé de widget, la voix, le style ;
 *   • les réseaux réellement branchés sur chaque assistant : Messenger,
 *     WhatsApp, Telegram, TikTok (table channel_integrations) + Instagram
 *     (table instagram_integrations), avec l'état et la dernière erreur ;
 *   • l'état du module Réseaux sociaux : verrouillé / ouvert, et la date de la
 *     dernière demande d'activation.
 *
 * Sécurité : jeton Supabase exigé + rôle `admin`/`superadmin` vérifié en base.
 * La lecture se fait avec la clé service (côté serveur) : aucune politique RLS
 * supplémentaire n'est nécessaire, et le marchand n'a accès à rien de tout ça.
 */

import { verifySupabaseIdToken, supabaseRequest } from '../../_shared/supabase.ts';

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/** Lit une table sans jamais faire échouer la réponse (table absente = liste vide). */
async function rows(env: any, path: string): Promise<any[]> {
  try {
    const res = await supabaseRequest(env, path);
    if (!res.ok) {
      console.warn('[admin/sites] lecture impossible:', path.split('?')[0], res.status);
      return [];
    }
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    console.warn('[admin/sites]', e?.message || e);
    return [];
  }
}

const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

/** Les domaines autorisés pour la bulle : tableau, ou texte séparé par , ou retour ligne. */
function domainList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => text(v, 200)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]+/).map((s) => text(s, 200)).filter(Boolean);
  return [];
}

const CHANNEL_LABELS: Record<string, string> = {
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export async function onRequestGet(context: any) {
  const env = context.env || {};
  try {
    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) return json({ ok: false, error: 'non authentifié' }, 401);

    const uRes = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(caller.uid)}&select=role`);
    const role = uRes.ok ? ((await uRes.json().catch(() => [])) || [])[0]?.role : null;
    if (role !== 'admin' && role !== 'superadmin') {
      return json({ ok: false, error: "réservé à l'admin" }, 403);
    }

    const [users, assistants, channels, instagram, requests] = await Promise.all([
      rows(env, 'users?select=id,email,display_name,company_name,phone_number,plan,social_enabled,created_at&order=created_at.desc&limit=500'),
      rows(env, 'assistants?select=id,user_id,business_name,website_url,config&limit=1000'),
      rows(env, 'channel_integrations?select=user_id,assistant_id,channel,account_id,display_name,phone_number,connected,last_error,updated_at&limit=2000'),
      rows(env, 'instagram_integrations?select=user_id,assistant_id,instagram_username,page_name,connected,last_connected_at&limit=1000'),
      rows(env, 'social_requests?select=user_id,created_at,status&status=eq.pending&limit=1000'),
    ]);

    const requested = new Map<string, string>();
    for (const r of requests) {
      const uid = text(r.user_id, 60);
      const at = text(r.created_at, 40);
      if (uid && at && !requested.has(uid)) requested.set(uid, at);
    }

    const clients = users.map((u) => {
      const uid = text(u.id, 60);
      const mine = assistants.filter((a) => text(a.user_id, 60) === uid);
      const sites = mine.map((a) => {
        const cfg = (a.config || {}) as Record<string, any>;
        const widget = (cfg.widgetConfig || {}) as Record<string, any>;
        const siteChannels = channels
          .filter((c) => text(c.assistant_id, 80) === text(a.id, 80))
          .map((c) => ({
            channel: text(c.channel, 20),
            label: CHANNEL_LABELS[text(c.channel, 20)] || text(c.channel, 20),
            accountId: text(c.account_id, 120),
            displayName: text(c.display_name, 120) || null,
            phoneNumber: text(c.phone_number, 40) || null,
            connected: c.connected !== false,
            lastError: text(c.last_error, 300) || null,
            updatedAt: text(c.updated_at, 40) || null,
          }));
        const ig = instagram.find((i) => text(i.assistant_id, 80) === text(a.id, 80));
        if (ig) {
          siteChannels.push({
            channel: 'instagram',
            label: 'Instagram',
            accountId: text(ig.instagram_username, 120),
            displayName: text(ig.page_name, 120) || text(ig.instagram_username, 120) || null,
            phoneNumber: null,
            connected: ig.connected !== false,
            lastError: null,
            updatedAt: text(ig.last_connected_at, 40) || null,
          });
        }
        return {
          assistantId: text(a.id, 80),
          businessName: text(a.business_name, 160) || '(sans nom)',
          websiteUrl: text(a.website_url, 300) || text(cfg.websiteUrl, 300) || null,
          allowedDomains: domainList(cfg.allowedDomains),
          widgetKeySet: Boolean(text(cfg.widgetKey, 200)),
          voiceEnabled: widget?.voice?.enabled === true,
          channels: siteChannels,
          channelsConnected: siteChannels.filter((c) => c.connected).length,
        };
      });
      const allChannels = sites.flatMap((s) => s.channels);
      return {
        uid,
        email: text(u.email, 160),
        name: text(u.display_name, 120),
        company: text(u.company_name, 160) || null,
        phone: text(u.phone_number, 40) || null,
        plan: text(u.plan, 40) || 'free',
        socialEnabled: u.social_enabled === true,
        socialRequestedAt: requested.get(uid) || null,
        sitesCount: sites.length,
        sites,
        channelsConnected: allChannels.filter((c) => c.connected).length,
        channelsCount: allChannels.length,
      };
    });

    // Les clients sans assistant peuvent avoir une demande en attente : on les
    // garde, mais on les met à la fin pour que l'écran reste utile.
    clients.sort((a, b) => b.sitesCount - a.sitesCount || a.email.localeCompare(b.email));

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      counts: {
        clients: clients.length,
        sites: clients.reduce((n, c) => n + c.sitesCount, 0),
        channels: clients.reduce((n, c) => n + c.channelsCount, 0),
        locked: clients.filter((c) => !c.socialEnabled).length,
        requested: clients.filter((c) => c.socialRequestedAt).length,
      },
      clients,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'erreur serveur' }, 500);
  }
}
