export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function config(env: SupabaseEnv) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
  if (key.startsWith('sb_publishable_')) throw new Error('La clé Supabase configurée est publique. Utilisez la clé service_role uniquement dans Cloudflare.');
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
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_'));
}

/**
 * Vérifie un jeton Supabase Auth (`Authorization: Bearer <access_token>`)
 * envoyé par le frontend. Remplace `verifyFirebaseIdToken` (Firebase) pour
 * les routes déjà migrées vers Supabase Auth côté client.
 * Retourne { uid, email } si valide, sinon null.
 */
export async function verifySupabaseIdToken(
  env: SupabaseEnv,
  authHeader?: string | null
): Promise<{ uid: string; email?: string } | null> {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { url, key } = config(env);
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; email?: string };
    if (!data?.id) return null;
    return { uid: data.id, email: data.email };
  } catch (e) {
    console.error('[auth] Vérification du token Supabase échouée:', (e as Error)?.message || e);
    return null;
  }
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
  const mapped: Record<string, any> = { id: assistantId, updated_at: new Date().toISOString() };
  if ('userId' in configPatch) { mapped.user_id = configPatch.userId; delete configPatch.userId; }
  if ('businessName' in configPatch) { mapped.business_name = configPatch.businessName; delete configPatch.businessName; }
  if ('websiteUrl' in configPatch) { mapped.website_url = configPatch.websiteUrl; delete configPatch.websiteUrl; }
  const existing = await supabaseGetAssistant(env, assistantId);
  mapped.config = { ...(existing.data?.config || {}), ...configPatch };
  if (patch.knowledgeNotes !== undefined) { mapped.knowledge_notes = patch.knowledgeNotes; delete mapped.config.knowledgeNotes; }
  if (!existing.ok) mapped.created_at = new Date().toISOString();
  // Upsert : la ligne est créée si elle n'existe pas encore (assistant migré
  // depuis Firestore, jamais écrit côté Supabase jusqu'ici), sinon mise à jour.
  const res = await request(env, `assistants?on_conflict=id`, {
    method: 'POST', body: JSON.stringify(mapped), headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
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

// --- Prospects (table public.prospects : id, assistant_id, data jsonb, updated_at) ---

export async function supabaseUpsertProspect(
  env: SupabaseEnv,
  docId: string,
  assistantId: string,
  patch: Record<string, any>
) {
  // On fusionne avec les données déjà stockées pour ne jamais écraser un
  // champ (phone/email/messages) déjà capturé lors d'un appel précédent.
  const existingRes = await request(env, `prospects?id=eq.${encodeURIComponent(docId)}&select=data`);
  const existing = existingRes.ok ? ((await existingRes.json()) as any[])[0]?.data || {} : {};
  const row = {
    id: docId,
    assistant_id: assistantId,
    data: { ...existing, ...patch },
    updated_at: new Date().toISOString(),
  };
  const res = await request(env, 'prospects?on_conflict=id', {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  if (!res.ok) throw new Error(`Supabase prospect write ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function supabaseListProspects(env: SupabaseEnv, assistantId: string) {
  const res = await request(
    env,
    `prospects?assistant_id=eq.${encodeURIComponent(assistantId)}&select=id,data,updated_at&order=updated_at.desc&limit=200`
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ id: string; data: Record<string, any>; updated_at: string }>;
  return rows.map((r) => ({ id: r.id, updatedAt: r.updated_at, ...r.data }));
}

// --- Instagram integration (table public.instagram_integrations, colonnes dédiées
// définie dans supabase/schema_auth_migration.sql — user_id = auth.uid() Supabase) ---

const IG_CAMEL_TO_COL: Record<string, string> = {
  connected: 'connected',
  assistantId: 'assistant_id',
  instagramUserId: 'instagram_user_id',
  instagramUsername: 'instagram_username',
  pageId: 'page_id',
  pageName: 'page_name',
  profilePictureUrl: 'profile_picture_url',
  autoReplyEnabled: 'auto_reply_enabled',
  respondToStories: 'respond_to_stories',
  respondToComments: 'respond_to_comments',
  assistantTone: 'assistant_tone',
  customGreeting: 'custom_greeting',
  accessToken: 'access_token',
  lastConnectedAt: 'last_connected_at',
  webhookStatus: 'webhook_status',
  totalMessagesHandled: 'total_messages_handled',
  unresolvedCount: 'unresolved_count',
};
const IG_COL_TO_CAMEL: Record<string, string> = Object.fromEntries(
  Object.entries(IG_CAMEL_TO_COL).map(([camel, col]) => [col, camel])
);

function igRowToCamel(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [col, val] of Object.entries(row)) {
    if (col === 'user_id' || col === 'updated_at') continue;
    out[IG_COL_TO_CAMEL[col] || col] = val;
  }
  return out;
}

export async function supabaseGetInstagramIntegration(env: SupabaseEnv, userId: string) {
  const res = await request(env, `instagram_integrations?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  if (!rows[0]) return null;
  return igRowToCamel(rows[0]);
}

export async function supabaseUpsertInstagramIntegration(
  env: SupabaseEnv,
  userId: string,
  patch: Record<string, any>
) {
  const row: Record<string, any> = { user_id: userId, updated_at: new Date().toISOString() };
  for (const [camel, val] of Object.entries(patch)) {
    const col = IG_CAMEL_TO_COL[camel];
    if (col) row[col] = val;
  }
  const res = await request(env, 'instagram_integrations?on_conflict=user_id', {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  if (!res.ok) throw new Error(`Supabase instagram_integrations write ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const rows = (await res.json()) as any[];
  return igRowToCamel(rows[0] || row);
}

export async function supabaseListKnowledge(env: SupabaseEnv, assistantId: string) {
  const res = await request(env, `knowledge_documents?assistant_id=eq.${encodeURIComponent(assistantId)}&select=title,content,source_url&order=scanned_at.desc&limit=100`);
  if (!res.ok) return [];
  return await res.json() as Array<{ title?: string; content?: string; source_url?: string }>;
}

// Reconstruit un objet "config" au même format que celui utilisé partout
// ailleurs dans le code (chat.js, crawler/analyze.ts...) — colonnes dédiées +
// tout le reste rangé dans la colonne jsonb `config`.
export function supabaseAssistantRowToConfig(row: Record<string, any>): Record<string, any> {
  if (!row) return {};
  return {
    ...(row.config || {}),
    userId: row.user_id,
    businessName: row.business_name ?? row.config?.businessName,
    websiteUrl: row.website_url ?? row.config?.websiteUrl,
    knowledgeNotes: row.knowledge_notes ?? row.config?.knowledgeNotes ?? [],
  };
}
