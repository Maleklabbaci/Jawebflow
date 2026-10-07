/**
 * Faux Supabase (REST « PostgREST ») + faux Instagram (graph.instagram.com) en mémoire.
 * Permet de tester le webhook et le moteur de bout en bout, SANS réseau.
 */
import { vi } from 'vitest';

export const SUPABASE_URL = 'https://fake.supabase.test';
export const IG_ID = '17841400000000001';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const ENV = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key' } as any;

// ── Constantes des plateformes simulées ──────────────────────────────────────
export const PAGE_ID = 'PAGE_778899';          // page Facebook (Messenger)
export const WA_PHONE_ID = 'PHONE_112233';     // numéro WhatsApp Business
export const WA_CUSTOMER = '213555000111';     // client WhatsApp
export const PSID = 'PSID_SARA';               // client Messenger
export const TG_TOKEN = 'TG_TOKEN_TEST';
export const TG_SECRET = 'TG_SECRET_TEST';
export const TT_BIZ_ID = 'TT_BIZ_1';

/** Environnement complet des 4 nouveaux canaux — prêt pour les tests. */
export const ENV_CHANNELS = {
  ...ENV,
  GEMINI_API_KEY: 'GEMINI_TEST_KEY',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',

  MESSENGER_PAGE_ACCESS_TOKEN: 'PAGE_TOKEN_1',
  MESSENGER_APP_SECRET: 'MESSENGER_SECRET',

  WHATSAPP_ACCESS_TOKEN: 'WA_TOKEN_1',
  WHATSAPP_PHONE_NUMBER_ID: WA_PHONE_ID,
  WHATSAPP_APP_SECRET: 'WHATSAPP_SECRET',

  TELEGRAM_BOT_TOKEN: TG_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: TG_SECRET,

  TIKTOK_ACCESS_TOKEN: 'TT_TOKEN_1',
  TIKTOK_BUSINESS_ID: TT_BIZ_ID,
  TIKTOK_APP_SECRET: 'TIKTOK_SECRET',

  META_VERIFY_TOKEN: 'VERIFY_1',
} as any;

type Row = Record<string, any>;

const UNIQUE: Record<string, string[]> = {
  ig_automation_events: ['automation_id', 'source_id'],
  instagram_threads: ['integration_id', 'customer_id'],
  ig_automation_state: ['user_id'],
  instagram_integrations: ['user_id'],
  bot_mutes: ['assistant_id', 'session_id'],
  channel_integrations: ['channel', 'account_id'],
  // Anti-doublon de la facturation : Meta renvoie plusieurs accusés (sent,
  // delivered, read) pour le MÊME message — une seule ligne doit être écrite.
  channel_messages: ['channel', 'message_id', 'direction'],
};

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function matchOp(value: any, expr: string): boolean {
  if (expr.startsWith('not.')) return !matchOp(value, expr.slice(4));
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const arg = expr.slice(dot + 1);
  const v = value === null || value === undefined ? null : String(value);
  switch (op) {
    case 'eq': return v === arg;
    case 'neq': return v !== arg;
    case 'is': return arg === 'null' ? v === null : v === arg;
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').includes(v as string);
    case 'gte': return v !== null && v >= arg;
    case 'lt': return v !== null && v < arg;
    default: throw new Error(`opérateur de test non géré : ${op}`);
  }
}

/** `phone` → la colonne ; `data->>phone` → le champ « phone » du JSON de la colonne « data » (comme PostgREST). */
function readColumn(row: Row, key: string): any {
  const arrow = key.indexOf('->>');
  if (arrow < 0) return row[key];
  const obj = row[key.slice(0, arrow)];
  const v = obj && typeof obj === 'object' ? obj[key.slice(arrow + 3)] : undefined;
  return v === undefined || v === null ? null : String(v);
}

function matchOr(row: Row, inner: string): boolean {
  return splitTop(inner.replace(/^\(|\)$/g, '')).some((cond) => {
    const dot = cond.indexOf('.');
    return matchOp(readColumn(row, cond.slice(0, dot)), cond.slice(dot + 1));
  });
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  missing = new Set<string>();
  users: Record<string, { id: string; email: string }> = {};
  calls: Array<{ method: string; path: string; body?: any }> = [];
  failTables = new Set<string>(); // renvoie une erreur 500 pour cette table
  private seq = 0;

  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] || []), ...rows.map((r) => ({ ...r }))];
  }
  rows(table: string): Row[] { return this.tables[table] || []; }
  addUser(token: string, id: string, email = `${id}@test.dz`) { this.users[token] = { id, email }; }

  private uuid(): string {
    this.seq += 1;
    const hex = this.seq.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  }

  private filter(table: string, params: URLSearchParams, applyLimit = true): Row[] {
    let rows = [...(this.tables[table] || [])];
    for (const [key, val] of params.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(key)) continue;
      if (key === 'or') rows = rows.filter((r) => matchOr(r, val));
      else rows = rows.filter((r) => matchOp(readColumn(r, key), val));
    }
    const order = params.get('order');
    if (order) {
      const [col, dir] = order.split('.');
      rows.sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    const limit = Number(params.get('limit'));
    if (applyLimit && limit) rows = rows.slice(0, limit);
    return rows;
  }

  private project(rows: Row[], select: string | null): Row[] {
    if (!select || select === '*') return rows.map((r) => ({ ...r }));
    const cols = select.split(',').map((c) => c.trim());
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }

  private conflict(table: string, row: Row, existing: Row[], onConflict?: string): Row | undefined {
    const cols = onConflict ? onConflict.split(',') : UNIQUE[table];
    if (!cols) return undefined;
    return existing.find((e) => cols.every((c) => row[c] !== null && row[c] !== undefined && e[c] === row[c]));
  }

  handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init.headers);
    const prefer = headers.get('Prefer') || '';
    const j = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.pathname === '/auth/v1/user') {
      const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const u = this.users[token];
      return u ? j(u) : j({ message: 'invalid JWT' }, 401);
    }

    const path = url.pathname.replace('/rest/v1/', '');
    this.calls.push({ method, path: path + url.search, body });

    if (path.startsWith('rpc/')) {
      if (path === 'rpc/ig_automation_bump') {
        if (this.missing.has('ig_automations')) return j({ code: 'PGRST202' }, 404);
        const a = this.rows('ig_automations').find((r) => r.id === body.p_id);
        if (a) {
          a.triggered_count = (a.triggered_count || 0) + (body.p_triggered || 0);
          a.public_reply_count = (a.public_reply_count || 0) + (body.p_public || 0);
          a.dm_count = (a.dm_count || 0) + (body.p_dm || 0);
          a.error_count = (a.error_count || 0) + (body.p_errors || 0);
          if (body.p_triggered > 0) a.last_triggered_at = new Date().toISOString();
        }
        return new Response(null, { status: 204 });
      }
      return j({ message: 'rpc inconnue' }, 404);
    }

    const table = path.split('?')[0];
    if (this.missing.has(table)) {
      return j({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }, 404);
    }
    if (this.failTables.has(table)) return j({ message: 'boom' }, 500);

    if (method === 'GET' || method === 'HEAD') {
      const all = this.filter(table, url.searchParams, false);
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset')) || 0;
      const rows = limit ? all.slice(offset, offset + limit) : all.slice(offset);
      const res = method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'Content-Type': 'application/json' } })
        : j(this.project(rows, url.searchParams.get('select')));
      // Comme PostgREST : le nombre TOTAL de lignes (avant la limite) dans « Content-Range ».
      if (prefer.includes('count=exact')) res.headers.set('Content-Range', rows.length ? `${offset}-${offset + rows.length - 1}/${all.length}` : `*/${all.length}`);
      return res;
    }

    if (method === 'POST') {
      const list: Row[] = Array.isArray(body) ? body : [body];
      const existing = (this.tables[table] ||= []);
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { ...raw };
        const dup = this.conflict(table, row, existing, url.searchParams.get('on_conflict') || undefined);
        if (dup) {
          if (prefer.includes('ignore-duplicates')) continue;
          if (prefer.includes('merge-duplicates')) { Object.assign(dup, row); out.push({ ...dup }); continue; }
          return j({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        }
        if (!row.id && ['ig_automations', 'ig_automation_events'].includes(table)) row.id = this.uuid();
        const now = new Date().toISOString();
        if (['ig_automations', 'ig_automation_events'].includes(table)) row.created_at ||= now;
        if (table === 'ig_automations') {
          row.triggered_count ??= 0; row.public_reply_count ??= 0; row.dm_count ??= 0; row.error_count ??= 0;
          row.enabled ??= false;
        }
        existing.push(row);
        out.push({ ...row });
      }
      if (prefer.includes('return=minimal')) return new Response(null, { status: 201 });
      return j(out, 201);
    }

    if (method === 'PATCH') {
      const rows = this.filter(table, url.searchParams);
      for (const r of rows) {
        const live = (this.tables[table] || []).find((x) => x === r || (x.id && x.id === r.id)) || r;
        Object.assign(live, body);
      }
      return prefer.includes('return=minimal') ? new Response(null, { status: 204 }) : j(rows.map((r) => ({ ...r, ...body })));
    }

    if (method === 'DELETE') {
      const rows = this.filter(table, url.searchParams);
      this.tables[table] = (this.tables[table] || []).filter((r) => !rows.includes(r));
      return j(rows);
    }
    return j({ message: 'méthode non gérée' }, 405);
  };
}

export interface MetaCall {
  method: string;
  path: string; // sans version, ex. /1789/replies
  query: Record<string, string>;
  body?: any;
  auth?: string;
}

type Rule = { match: (c: MetaCall) => boolean; respond: () => Response; times: number };

/** Faux graph.instagram.com : enregistre tous les appels, réponses réglables. */
export class FakeMeta {
  calls: MetaCall[] = [];
  profiles: Record<string, any> = {};
  media: any[] = [];
  subscribedFields: string[] = ['messages'];
  /** champs refusés à l'abonnement, ex. ['comments'] si l'application Meta ne l'autorise pas */
  rejectFields: string[] = [];
  commentsPermission = true;
  private rules: Rule[] = [];
  private seq = 0;

  /** Force la prochaine(s) réponse(s) d'un appel (ex. refuser les boutons, simuler un jeton expiré). */
  failWhen(match: (c: MetaCall) => boolean, status: number, error: any, times = 1) {
    this.rules.push({ match, times, respond: () => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } }) });
  }

  sent(kind: 'replies' | 'messages'): MetaCall[] {
    return this.calls.filter((c) => c.method === 'POST' && c.path.endsWith(`/${kind}`));
  }

  handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const path = url.pathname.replace(/^\/v\d+\.\d+/, '');
    const call: MetaCall = {
      method,
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('Authorization') || undefined,
    };
    this.calls.push(call);
    const j = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    const rule = this.rules.find((r) => r.times > 0 && r.match(call));
    if (rule) { rule.times -= 1; return rule.respond(); }

    if (path === '/refresh_access_token') return j({ access_token: 'REFRESHED_TOKEN', token_type: 'bearer', expires_in: 5184000 });
    if (path === '/access_token') return j({ access_token: 'LONG_LIVED_TOKEN', token_type: 'bearer', expires_in: 5184000 });
    if (method === 'GET' && path === '/me') {
      // « id » = identifiant applicatif ; « user_id » = identifiant PROFESSIONNEL (celui des webhooks)
      return j({ id: 'APP_SCOPED_99', user_id: IG_ID, username: 'boutique_nour', name: 'Boutique Nour', profile_picture_url: 'https://cdn/p.jpg' });
    }
    if (method === 'POST' && /\/replies$/.test(path)) return j({ id: `reply_${++this.seq}` });
    if (method === 'POST' && /\/messages$/.test(path)) {
      const recipient = call.body?.recipient || {};
      return j({ recipient_id: recipient.id || `igsid_of_${recipient.comment_id}`, message_id: `mid_${++this.seq}` });
    }
    if (method === 'GET' && /\/[^/]+\/subscribed_apps$/.test(path)) return j({ data: [{ id: 'app', subscribed_fields: this.subscribedFields }] });
    if (method === 'POST' && /\/[^/]+\/subscribed_apps$/.test(path)) {
      const asked = (call.query.subscribed_fields || '').split(',');
      const bad = asked.filter((f) => this.rejectFields.includes(f));
      if (bad.length) return j({ error: { message: `(#100) Invalid subscribed field: ${bad.join(',')}`, code: 100 } }, 400);
      this.subscribedFields = asked;
      return j({ success: true });
    }
    if (method === 'GET' && path === '/me/media') return j({ data: this.media, paging: this.media.length >= Number(call.query.limit || 25) ? { cursors: { after: 'CURSOR2' }, next: 'https://next' } : {} });
    if (method === 'GET' && /\/comments$/.test(path)) {
      return this.commentsPermission
        ? j({ data: [] })
        : j({ error: { message: '(#10) Application does not have permission for this action', code: 10 } }, 400);
    }
    if (method === 'GET' && /^\/[A-Za-z0-9_]+$/.test(path) && path !== '/me') {
      const p = this.profiles[path.slice(1)];
      return p ? j(p) : j({ error: { message: '(#230) User consent is required to access user profile', code: 230 } }, 400);
    }
    return j({ error: { message: `route non simulée ${method} ${path}`, code: 100 } }, 404);
  };
}

export interface PlatformCall {
  host: string;
  method: string;
  path: string; // sans préfixe de version
  query: Record<string, string>;
  body?: any;
  auth?: string;
}

type PlatformRule = { match: (c: PlatformCall) => boolean; respond: () => Response; times: number };

function platformCall(url: URL, init: RequestInit, strip: RegExp): PlatformCall {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  return {
    host: url.host,
    method,
    path: url.pathname.replace(strip, ''),
    query: Object.fromEntries(url.searchParams.entries()),
    body: init.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return String(init.body); } })() : undefined,
    auth: headers.get('Authorization') || headers.get('Access-Token') || undefined,
  };
}

function platformRules(rules: PlatformRule[], call: PlatformCall): Response | null {
  const rule = rules.find((r) => r.times > 0 && r.match(call));
  if (!rule) return null;
  rule.times -= 1;
  return rule.respond();
}

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Faux `graph.facebook.com` : sert Messenger (page) ET WhatsApp (numéro).
 * On distingue les deux par la route : Messenger envoie à `/me/messages`,
 * WhatsApp à `/{phone_number_id}/messages`.
 */
export class FakeGraph {
  calls: PlatformCall[] = [];
  private rules: PlatformRule[] = [];
  private seq = 0;

  /** Force les prochaines réponses (ex. erreur 131047 « fenêtre 24 h fermée »). */
  failWhen(match: (c: PlatformCall) => boolean, status: number, error: any, times = 1) {
    this.rules.push({ match, times, respond: () => j({ error }, status) });
  }

  sent(): PlatformCall[] {
    return this.calls.filter((c) => c.method === 'POST' && /\/messages$/.test(c.path));
  }

  handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const call = platformCall(url, init, /^\/v\d+\.\d+/);
    this.calls.push(call);

    const forced = platformRules(this.rules, call);
    if (forced) return forced;

    if (call.method === 'POST' && call.path === '/me/messages') {
      return j({ recipient_id: call.body?.recipient?.id || PSID, message_id: `mid_messenger_${++this.seq}` });
    }
    if (call.method === 'POST' && /^\/[^/]+\/messages$/.test(call.path)) {
      // WhatsApp Cloud API
      return j({
        messaging_product: 'whatsapp',
        contacts: [{ input: call.body?.to, wa_id: call.body?.to }],
        messages: [{ id: `wamid.${++this.seq}`, message_status: 'accepted' }],
      });
    }
    if (call.method === 'GET' && /^\/[^/]+$/.test(call.path)) {
      const id = call.path.slice(1);
      if (id === 'me') return j({ id: PAGE_ID, name: 'Boutique Nour' });
      return id.startsWith('PHONE')
        ? j({ id, display_phone_number: '+213 555 00 01 11', verified_name: 'Boutique Nour' })
        : j({ id, name: 'Boutique Nour', username: 'boutique_nour' });
    }
    return j({ error: { message: `route non simulée ${call.method} ${call.path}`, code: 100 } }, 404);
  };
}

/** Faux `api.telegram.org`. */
export class FakeTelegram {
  calls: PlatformCall[] = [];
  private seq = 0;

  sent(): PlatformCall[] {
    return this.calls.filter((c) => /\/sendMessage$/.test(c.path));
  }

  /** Le jeton est DANS le chemin (`/bot<JETON>/sendMessage`) : on le découpe. */
  tokenOf(call: PlatformCall): string {
    const m = /^\/bot([^/]+)\//.exec(call.path);
    return m ? m[1] : '';
  }

  handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const call = platformCall(url, init, /^$/);
    this.calls.push(call);
    if (/\/sendMessage$/.test(call.path)) {
      return j({ ok: true, result: { message_id: ++this.seq, chat: { id: call.body?.chat_id }, text: call.body?.text } });
    }
    if (/\/(getMe|setWebhook|deleteWebhook)$/.test(call.path)) return j({ ok: true, result: { id: 1, is_bot: true, username: 'jawebflow_test_bot' } });
    return j({ ok: false, error_code: 404, description: `route non simulée ${call.method} ${call.path}` }, 404);
  };
}

/** Faux `business-api.tiktok.com`. */
export class FakeTikTok {
  calls: PlatformCall[] = [];
  private seq = 0;

  sent(): PlatformCall[] {
    return this.calls.filter((c) => /\/business\/message\/send\/?$/.test(c.path));
  }

  handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const call = platformCall(url, init, /^\/open_api\/v\d+\.\d+/);
    this.calls.push(call);
    if (/\/business\/message\/send\/?$/.test(call.path)) {
      return j({ code: 0, message: 'OK', data: { message_id: `tt_${++this.seq}` } });
    }
    return j({ code: 40401, message: `route non simulée ${call.method} ${call.path}` });
  };
}

/** Remplace fetch : Supabase et Meta sont simulés, tout autre appel réseau fait échouer le test. */
export function installFakes() {
  const supabase = new FakeSupabase();
  const meta = new FakeMeta();
  const graph = new FakeGraph();       // graph.facebook.com → Messenger + WhatsApp
  const telegram = new FakeTelegram(); // api.telegram.org
  const tiktok = new FakeTikTok();     // business-api.tiktok.com
  const other: string[] = [];
  const external: { handler: ((url: URL, init: any) => Response | Promise<Response>) | null; calls: Array<{ url: string; init: any }> } = { handler: null, calls: [] };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    if (url.origin === SUPABASE_URL) return supabase.handle(url, init);
    if (url.host === 'graph.instagram.com') return meta.handle(url, init);
    if (url.host === 'graph.facebook.com') return graph.handle(url, init);
    if (url.host === 'api.telegram.org') return telegram.handle(url, init);
    if (url.host === 'business-api.tiktok.com') return tiktok.handle(url, init);
    if (external.handler) {
      external.calls.push({ url: url.toString(), init });
      return external.handler(url, init);
    }
    other.push(url.toString());
    return new Response(JSON.stringify({ error: 'réseau non simulé' }), { status: 599 });
  });
  return { supabase, meta, graph, telegram, tiktok, other, external, restore: () => spy.mockRestore() };
}


/** Un marchand connecté, prêt à recevoir des automatisations. */
export function seedMerchant(supabase: FakeSupabase, over: Row = {}) {
  supabase.seed('instagram_integrations', [{
    user_id: USER_ID,
    instagram_user_id: IG_ID,
    instagram_username: 'boutique_nour',
    access_token: 'TOKEN1',
    assistant_id: 'asst1',
    connected: true,
    auto_reply_enabled: true,
    respond_to_stories: true,
    last_connected_at: new Date().toISOString(),
    ...over,
  }]);
  supabase.seed('assistants', [{ id: 'asst1', user_id: USER_ID, business_name: 'Boutique Nour', config: {} }]);
  supabase.addUser('BEARER_U1', USER_ID);
}

export function seedAutomation(supabase: FakeSupabase, over: Row = {}) {
  const row = {
    id: over.id || `aaaaaaaa-0000-4000-8000-${String(supabase.rows('ig_automations').length + 1).padStart(12, '0')}`,
    user_id: USER_ID,
    name: 'Prix → DM',
    trigger_type: 'comment',
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    triggered_count: 0, public_reply_count: 0, dm_count: 0, error_count: 0,
    config: {
      media: { scope: 'any' },
      match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: true, variations: ['Merci {@pseudo} ! Regarde tes messages 📩'] },
      dm: { enabled: true, text: 'Salut {prenom} 👋 Voici nos prix.', buttons: [] },
      gate: { enabled: false },
      oncePerUser: true,
    },
    ...over,
  };
  supabase.seed('ig_automations', [row]);
  return row;
}

/** Charge utile « commentaire » telle que Meta l'envoie (Instagram Login). */
export function commentPayload(over: { id?: string; text?: string; fromId?: string; username?: string; mediaId?: string; parentId?: string; entryId?: string } = {}) {
  return {
    object: 'instagram',
    entry: [{
      id: over.entryId || IG_ID,
      time: 1760000000,
      changes: [{
        field: 'comments',
        value: {
          id: over.id || 'c1',
          from: { id: over.fromId || 'IGSID_SARA', username: over.username || 'sara_dz' },
          text: over.text ?? 'Prix svp ?',
          media: { id: over.mediaId || 'MEDIA_1', media_product_type: 'FEED' },
          ...(over.parentId ? { parent_id: over.parentId } : {}),
        },
      }],
    }],
  };
}

/**
 * Branche un canal sur l'assistant « asst1 » (à appeler après `seedMerchant`).
 * `account_id` = la clé de routage : page Facebook, numéro WhatsApp, clé d'URL
 * Telegram/TikTok.
 */
export function seedChannel(supabase: FakeSupabase, channel: string, over: Row = {}) {
  const defaults: Record<string, string> = {
    messenger: PAGE_ID,
    whatsapp: WA_PHONE_ID,
    telegram: 'TG_KEY_1',
    tiktok: TT_BIZ_ID,
  };
  const row = {
    id: `int_${channel}`,
    user_id: USER_ID,
    assistant_id: 'asst1',
    channel,
    account_id: over.account_id || defaults[channel],
    connected: true,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
  supabase.seed('channel_integrations', [row]);
  return row;
}

/** Passe l'assistant « asst1 » sur un plan donné (pro, enterprise…). */
export function seedPlan(supabase: FakeSupabase, plan: string) {
  const asst = supabase.rows('assistants').find((a) => a.id === 'asst1');
  if (asst) asst.plan = plan;
}

/** Charge utile « Messenger » telle que Meta l'envoie. */
export function messengerEvent(over: {
  text?: string; mid?: string; senderId?: string; pageId?: string;
  postback?: string; referral?: boolean; isEcho?: boolean;
} = {}) {
  const sender = { id: over.senderId || PSID };
  const recipient = { id: over.pageId || PAGE_ID };
  const messaging = over.postback
    ? {
        sender, recipient, timestamp: 1760000000000,
        postback: {
          title: over.postback,
          payload: over.postback.toUpperCase(),
          ...(over.referral ? { referral: { source: 'ADS', ref: 'pub1' } } : {}),
        },
      }
    : {
        sender, recipient, timestamp: 1760000000000,
        message: {
          mid: over.mid || 'mid_messenger_1',
          text: over.text ?? 'Bonjour, vos prix ?',
          ...(over.referral ? { referral: { source: 'ADS', ref: 'pub1' } } : {}),
          ...(over.isEcho ? { is_echo: true } : {}),
        },
      };
  return { object: 'page', entry: [{ id: over.pageId || PAGE_ID, time: 1760000000, messaging: [messaging] }] };
}

/** Accusé de livraison Messenger (mids + pricing). */
export function messengerDelivery(over: { mid?: string; pageId?: string; billable?: boolean; category?: string } = {}) {
  return {
    object: 'page',
    entry: [{
      id: over.pageId || PAGE_ID, time: 1760000000,
      messaging: [{
        sender: { id: over.pageId || PAGE_ID },
        recipient: { id: PSID },
        timestamp: 1760000000000,
        delivery: {
          mids: [over.mid || 'mid_messenger_1'],
          watermark: 1760000000000,
          ...(over.billable !== undefined ? { pricing: { billable: over.billable, category: over.category || 'service' } } : {}),
        },
      }],
    }],
  };
}

/** Charge utile « message WhatsApp » (Cloud API). */
export function whatsappMessage(over: {
  text?: string; id?: string; from?: string; name?: string;
  phoneNumberId?: string; referral?: boolean; kind?: 'text' | 'button' | 'interactive' | 'image';
} = {}) {
  const kind = over.kind || 'text';
  const base: any = {
    from: over.from || WA_CUSTOMER,
    id: over.id || 'wamid.IN_1',
    timestamp: '1760000000',
    type: kind,
    ...(over.referral ? { referral: { source_url: 'https://fb.me/ad', source_id: 'AD_1', source_type: 'ad' } } : {}),
  };
  if (kind === 'text') base.text = { body: over.text ?? 'Salam, bch' };
  if (kind === 'button') base.button = { text: over.text ?? 'Oui', payload: 'OUI' };
  if (kind === 'interactive') base.interactive = { type: 'button_reply', button_reply: { id: 'b1', title: over.text ?? 'Oui' } };
  if (kind === 'image') base.image = { id: 'MEDIA_1', mime_type: 'image/jpeg', ...(over.text ? { caption: over.text } : {}) };

  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '+213 555 00 01 11', phone_number_id: over.phoneNumberId || WA_PHONE_ID },
          contacts: [{ profile: { name: over.name || 'Sara' }, wa_id: over.from || WA_CUSTOMER }],
          messages: [base],
        },
      }],
    }],
  };
}

/** Accusé de livraison WhatsApp — c'est LUI qui porte `pricing.billable`. */
export function whatsappStatus(over: {
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  id?: string; phoneNumberId?: string;
  billable?: boolean; category?: string;
} = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '+213 555 00 01 11', phone_number_id: over.phoneNumberId || WA_PHONE_ID },
          statuses: [{
            id: over.id || 'wamid.OUT_1',
            status: over.status || 'delivered',
            timestamp: '1760000000',
            recipient_id: WA_CUSTOMER,
            ...(over.billable !== undefined ? { pricing: { billable: over.billable, category: over.category || 'service', pricing_model: 'PMP' } } : {}),
          }],
        },
      }],
    }],
  };
}

/** Charge utile « update Telegram ». */
export function telegramUpdate(over: {
  text?: string; updateId?: number; chatId?: string; firstName?: string;
  isBot?: boolean; chatType?: string; callback?: string; messageId?: number;
} = {}) {
  const chatId = over.chatId || '555111222';
  if (over.callback) {
    return {
      update_id: over.updateId || 1,
      callback_query: {
        id: 'cb1',
        from: { id: chatId, first_name: over.firstName || 'Sara' },
        message: { message_id: over.messageId || 10, chat: { id: chatId, type: 'private' }, text: 'Choisir' },
        data: over.callback,
      },
    };
  }
  return {
    update_id: over.updateId || 1,
    message: {
      message_id: over.messageId || 1,
      from: { id: chatId, first_name: over.firstName || 'Sara', ...(over.isBot ? { is_bot: true } : {}) },
      chat: { id: chatId, type: over.chatType || 'private' },
      date: 1760000000,
      text: over.text ?? 'Salam',
    },
  };
}

/** Charge utile « événement TikTok » (forme plausible, le parseur est tolérant). */
export function tiktokEvent(over: { text?: string; senderId?: string; messageId?: string; event?: string; nested?: boolean } = {}) {
  const event = {
    event: over.event || 'MESSAGE_RECEIVED',
    message_id: over.messageId || 'tt_msg_1',
    from_user_id: over.senderId || 'TT_USER_1',
    from_user_name: 'Sara',
    ...(over.nested ? { message: { text: over.text ?? 'Bonjour' } } : { text: over.text ?? 'Bonjour' }),
  };
  return { events: [event] };
}

export function dmEvent(over: { text?: string; mid?: string; senderId?: string; story?: boolean; mention?: boolean; echo?: boolean } = {}) {
  return {
    sender: { id: over.senderId || 'IGSID_SARA' },
    recipient: { id: IG_ID },
    timestamp: 1760000000000,
    message: {
      mid: over.mid || 'mid-1',
      ...(over.text !== undefined ? { text: over.text } : {}),
      ...(over.story ? { reply_to: { story: { id: 'STORY_1', url: 'https://cdn/story' } } } : {}),
      ...(over.mention ? { attachments: [{ type: 'story_mention', payload: { url: 'https://cdn/m' } }] } : {}),
      ...(over.echo ? { is_echo: true } : {}),
    },
  };
}
