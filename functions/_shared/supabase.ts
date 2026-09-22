export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function config(env: SupabaseEnv) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
  return { url, key };
}

async function request(env: SupabaseEnv, path: string, init: RequestInit = {}) {
  const { url, key } = config(env);
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Prefer', headers.get('Prefer') || 'return=representation');
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

export function supabaseConfigured(env: SupabaseEnv) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function supabaseGetAssistant(env: SupabaseEnv, assistantId: string) {
  const res = await request(env, `assistants?id=eq.${encodeURIComponent(assistantId)}&select=*`);
  if (res.status === 404) return { ok: false, status: 404, data: null };
  if (!res.ok) return { ok: false, status: res.status, data: null, error: await res.text() };
  const rows = await res.json() as any[];
  if (!rows.length) return { ok: false, status: 404, data: null, error: 'document introuvable' };
  return { ok: true, status: 200, data: rows[0] };
}

export async function supabasePatchAssistant(env: SupabaseEnv, assistantId: string, patch: Record<string, any>) {
  const configPatch = { ...patch };
  const mapped: Record<string, any> = { updated_at: new Date().toISOString() };
  if ('userId' in configPatch) { mapped.user_id = configPatch.userId; delete configPatch.userId; }
  if ('businessName' in configPatch) { mapped.business_name = configPatch.businessName; delete configPatch.businessName; }
  if ('websiteUrl' in configPatch) { mapped.website_url = configPatch.websiteUrl; delete configPatch.websiteUrl; }
  const existing = await supabaseGetAssistant(env, assistantId);
  mapped.config = { ...(existing.data?.config || {}), ...configPatch };
  if (patch.knowledgeNotes !== undefined) { mapped.knowledge_notes = patch.knowledgeNotes; delete mapped.config.knowledgeNotes; }
  const res = await request(env, `assistants?id=eq.${encodeURIComponent(assistantId)}`, {
    method: 'PATCH', body: JSON.stringify(mapped), headers: { Prefer: 'return=representation' }
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  return { ok: true, status: 200 };
}

export async function supabaseUpsertKnowledge(env: SupabaseEnv, assistantId: string, documentId: string, data: Record<string, any>) {
  const row = {
    id: documentId,
    assistant_id: assistantId,
    source_url: data.url || documentId,
    title: data.title || '',
    content: data.content || '',
    metadata: { ...data, embedding: undefined },
    ...(Array.isArray(data.embedding) ? { embedding: `[${data.embedding.join(',')}]` } : {}),
    scanned_at: data.scannedAt || new Date().toISOString(),
  };
  const res = await request(env, 'knowledge_documents', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  if (!res.ok) throw new Error(`Supabase knowledge write ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function supabaseListKnowledge(env: SupabaseEnv, assistantId: string) {
  const res = await request(env, `knowledge_documents?assistant_id=eq.${encodeURIComponent(assistantId)}&select=title,content,source_url&order=scanned_at.desc&limit=100`);
  if (!res.ok) return [];
  return await res.json() as Array<{ title?: string; content?: string; source_url?: string }>;
}
