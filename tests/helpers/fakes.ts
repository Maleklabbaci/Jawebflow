/**
 * Faux Supabase (REST « PostgREST ») + faux Instagram (graph.instagram.com) en mémoire.
 * Permet de tester le webhook et le moteur de bout en bout, SANS réseau.
 */
import { vi } from 'vitest';

export const SUPABASE_URL = 'https://fake.supabase.test';
export const IG_ID = '17841400000000001';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const ENV = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key' } as any;

type Row = Record<string, any>;

const UNIQUE: Record<string, string[]> = {
  ig_automation_events: ['automation_id', 'source_id'],
  instagram_threads: ['integration_id', 'customer_id'],
  ig_automation_state: ['user_id'],
  instagram_integrations: ['user_id'],
  bot_mutes: ['assistant_id', 'session_id'],
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

    if (method === 'GET') {
      const all = this.filter(table, url.searchParams, false);
      const limit = Number(url.searchParams.get('limit'));
      const rows = limit ? all.slice(0, limit) : all;
      const res = j(this.project(rows, url.searchParams.get('select')));
      // Comme PostgREST : le nombre TOTAL de lignes (avant la limite) dans « Content-Range ».
      if (prefer.includes('count=exact')) res.headers.set('Content-Range', rows.length ? `0-${rows.length - 1}/${all.length}` : `*/${all.length}`);
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

/** Remplace fetch : Supabase et Meta sont simulés, tout autre appel réseau fait échouer le test. */
export function installFakes() {
  const supabase = new FakeSupabase();
  const meta = new FakeMeta();
  const other: string[] = [];
  const external: { handler: ((url: URL, init: any) => Response | Promise<Response>) | null; calls: Array<{ url: string; init: any }> } = { handler: null, calls: [] };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    if (url.origin === SUPABASE_URL) return supabase.handle(url, init);
    if (url.host === 'graph.instagram.com') return meta.handle(url, init);
    if (external.handler) {
      external.calls.push({ url: url.toString(), init });
      return external.handler(url, init);
    }
    other.push(url.toString());
    return new Response(JSON.stringify({ error: 'réseau non simulé' }), { status: 599 });
  });
  return { supabase, meta, other, external, restore: () => spy.mockRestore() };
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
