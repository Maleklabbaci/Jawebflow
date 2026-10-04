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

// Exporté pour les modules frères (limits.ts) : requête REST en service_role.
export async function supabaseRequest(env: SupabaseEnv, path: string, init: RequestInit = {}) {
  return request(env, path, init);
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
  // Les écritures partielles utilisent aussi un upsert. Préserver le
  // propriétaire existant est nécessaire car assistants.user_id est NOT NULL ;
  // sans lui, même une mise à jour de knowledge_notes est rejetée par Postgres.
  if (!mapped.user_id && existing.data?.user_id) mapped.user_id = existing.data.user_id;
  if (!mapped.user_id) {
    return { ok: false, status: existing.status || 400, error: existing.error || 'user_id de l’assistant introuvable' };
  }
  mapped.config = { ...(existing.data?.config || {}), ...configPatch };
  if (patch.knowledgeNotes !== undefined) { mapped.knowledge_notes = patch.knowledgeNotes; delete mapped.config.knowledgeNotes; }
  if (!existing.ok) mapped.created_at = new Date().toISOString();
  // Upsert : la ligne est créée si elle n'existe pas encore (assistant migré
  // depuis Firestore, jamais écrit côté Supabase jusqu'ici), sinon mise à jour.
  const res = await request(env, `assistants?on_conflict=id`, {
    method: 'POST', body: JSON.stringify(mapped), headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  if (Array.isArray(patch.knowledgeNotes)) {
    // Le JSONB historique reste un miroir pour les versions qui n'ont pas
    // encore basculé, tandis que la table normalisée devient la source durable.
    const synced = await supabaseSyncKnowledgeNotes(env, assistantId, patch.knowledgeNotes);
    if (!synced.ok) console.warn('[knowledge] miroir relationnel indisponible:', synced.error || synced.status);
  }
  return { ok: true, status: 200 };
}

function normalizeKnowledgeCategory(rawCategory: unknown, context = ''): string {
  const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const category = normalize(rawCategory);
  const text = normalize(`${String(rawCategory || '')} ${context}`);
  if (/prix|tarif|price|pricing|promo|promotion|discount|remise|solde/.test(category)) return 'tarifs';
  if (/livraison|shipping|paiement|payment|delivery|commande|expedition/.test(category)) return 'livraison';
  if (/contact|liens|links|adresse|horaire|pratique|info|social/.test(category)) return 'contact';
  if (/faq|garantie|warranty|politique|learned|appris|condition|retour|annulation/.test(category)) return 'faq';
  if (/produit|service|catalogue|catalog|offre|general|custom|immobili|voyage/.test(category)) return 'services';
  if (/prix|tarif|price|promo|promotion|remise|discount/.test(text)) return 'tarifs';
  if (/livraison|shipping|paiement|payment|expedition|commande/.test(text)) return 'livraison';
  if (/contact|adresse|horaire|telephone|whatsapp|email|lien|instagram/.test(text)) return 'contact';
  if (/faq|question|garantie|warranty|politique|condition|retour|remboursement|visa|annulation/.test(text)) return 'faq';
  return 'services';
}

function normalizeKnowledgeSource(note: Record<string, any>): string {
  const source = String(note.source || '').toLowerCase();
  if (/learn|appris|conversation|auto/.test(source) || String(note.category || '').toLowerCase() === 'learned') return 'learned';
  if (/quick/.test(source)) return 'quick_add';
  if (['scanned', 'scan', 'site'].includes(source)) return 'site';
  if (source === 'extracted') return String(note.id || '').startsWith('imported_') ? 'imported' : 'site';
  if (/import/.test(source)) return 'imported';
  return 'manual';
}

function normalizedKnowledgeEntry(assistantId: string, raw: Record<string, any>) {
  const source = normalizeKnowledgeSource(raw);
  const rawStatus = String(raw.approvalStatus || raw.status || '').toLowerCase();
  const isLearned = source === 'learned';
  const pending = rawStatus === 'pending_review' || rawStatus === 'pending' || (isLearned && !['approved', 'active'].includes(rawStatus));
  return {
    assistant_id: assistantId,
    id: String(raw.id || `knowledge_${crypto.randomUUID()}`),
    title: String(raw.title || 'Information').trim().slice(0, 180),
    content: String(raw.content || '').trim().slice(0, 12000),
    category: normalizeKnowledgeCategory(raw.category, `${raw.title || ''} ${raw.content || ''}`),
    source,
    source_url: raw.sourceUrl || raw.source_url || null,
    enabled: pending ? false : raw.enabled !== false,
    status: pending ? 'pending_review' : 'active',
    metadata: { ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}), legacySource: raw.source || null },
    created_at: raw.createdAt || raw.created_at || new Date().toISOString(),
    updated_at: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

/** Copie la liste de fiches de compatibilité vers la table relationnelle. */
export async function supabaseSyncKnowledgeNotes(env: SupabaseEnv, assistantId: string, rawNotes: unknown) {
  const notes = Array.isArray(rawNotes) ? rawNotes.filter((n: any) => n && typeof n === 'object' && String(n.content || '').trim()) : [];
  const entries = notes.map((n: Record<string, any>) => normalizedKnowledgeEntry(assistantId, n));
  const current = await request(env, `knowledge_entries?assistant_id=eq.${encodeURIComponent(assistantId)}&select=id`);
  if (!current.ok) return { ok: false, status: current.status, error: await current.text() };

  if (entries.length) {
    const write = await request(env, 'knowledge_entries?on_conflict=assistant_id,id', {
      method: 'POST',
      body: JSON.stringify(entries),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    if (!write.ok) return { ok: false, status: write.status, error: await write.text() };
  }

  const rows = await current.json() as Array<{ id: string }>;
  const keep = new Set(entries.map((entry) => entry.id));
  const removed = rows.map((row) => row.id).filter((id) => !keep.has(id));
  for (const id of removed) {
    const del = await request(env, `knowledge_entries?assistant_id=eq.${encodeURIComponent(assistantId)}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!del.ok) return { ok: false, status: del.status, error: await del.text() };
  }
  return { ok: true, status: 200, count: entries.length };
}

/** Lit les fiches normalisées (y compris les demandes en attente de revue). */
export async function supabaseListKnowledgeEntries(env: SupabaseEnv, assistantId: string) {
  const res = await request(env, `knowledge_entries?assistant_id=eq.${encodeURIComponent(assistantId)}&select=id,title,content,category,source,source_url,enabled,status,metadata,created_at,updated_at&order=updated_at.desc&limit=500`);
  if (!res.ok) return { available: false, entries: [] as Record<string, any>[], error: await res.text() };
  const rows = await res.json() as Array<Record<string, any>>;
  return {
    available: true,
    entries: rows.map((row) => ({
      id: row.id,
      title: row.title || 'Information',
      content: row.content || '',
      category: normalizeKnowledgeCategory(row.category, row.title || ''),
      source: row.source || 'manual',
      sourceUrl: row.source_url || undefined,
      enabled: row.enabled !== false,
      approvalStatus: row.status || 'active',
      status: row.status || 'active',
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
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
  // Les champs du patch écrasent les anciens (le client peut CORRIGER son
  // numéro/nom/ville), SAUF messages : on CONCATÈNE l'historique (20 derniers).
  const mergedMessages = Array.isArray(patch.messages) || Array.isArray(existing.messages)
    ? [...(Array.isArray(existing.messages) ? existing.messages : []), ...(Array.isArray(patch.messages) ? patch.messages : [])].slice(-20)
    : undefined;
  const mergedOrders = Array.isArray(patch.orders) || Array.isArray(existing.orders)
    ? Array.from(new Map([
        ...(Array.isArray(existing.orders) ? existing.orders : []),
        ...(Array.isArray(patch.orders) ? patch.orders : []),
      ].filter((order: any) => order && typeof order.id === 'string').map((order: any) => [order.id, order])).values()).slice(-50)
    : undefined;
  const data = { ...existing, ...patch };
  if (mergedMessages) data.messages = mergedMessages;
  if (mergedOrders) data.orders = mergedOrders;
  const row = {
    id: docId,
    assistant_id: assistantId,
    data,
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

// ----------------------------------------------------------------------
// Boucle d'apprentissage (questions sans réponse + feedback 👍/👎)
// ----------------------------------------------------------------------

export interface LearningQuestion {
  id: string;
  assistant_id: string;
  question: string;
  ai_answer?: string | null;
  reason: string;
  status: string;
  answer?: string | null;
  occurrences: number;
  created_at: string;
  resolved_at?: string | null;
}

/**
 * Enregistre une question à laquelle l'IA n'a pas su répondre. Si la même
 * question (insensible à la casse) est déjà ouverte, incrémente `occurrences`.
 * Appelé par functions/api/chat.js (waitUntil) et /api/feedback (👎).
 */
export async function supabaseLogLearningQuestion(
  env: SupabaseEnv,
  assistantId: string,
  question: string,
  aiAnswer: string,
  reason: string
): Promise<void> {
  const clean = String(question || '').trim();
  if (!clean || clean.length < 3) return;
  const norm = clean.toLowerCase();

  const findRes = await request(
    env,
    `learning_questions?assistant_id=eq.${encodeURIComponent(assistantId)}&status=eq.open&select=id,question,occurrences&limit=200`
  );
  if (findRes.ok) {
    const rows = (await findRes.json()) as Array<{ id: string; question: string; occurrences: number }>;
    const dup = rows.find((r) => String(r.question).trim().toLowerCase() === norm);
    if (dup) {
      await request(env, `learning_questions?id=eq.${encodeURIComponent(dup.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ occurrences: (dup.occurrences || 1) + 1, ai_answer: (aiAnswer || '').slice(0, 2000) || null }),
      });
      return;
    }
  }

  const res = await request(env, 'learning_questions', {
    method: 'POST',
    body: JSON.stringify({
      assistant_id: assistantId,
      question: clean.slice(0, 500),
      ai_answer: (aiAnswer || '').slice(0, 2000) || null,
      reason,
    }),
  });
  if (!res.ok) {
    console.error('[learning] écriture Supabase refusée:', (await res.text()).slice(0, 200));
  }
}

export async function supabaseListLearningQuestions(env: SupabaseEnv, assistantId: string): Promise<LearningQuestion[]> {
  const res = await request(
    env,
    `learning_questions?assistant_id=eq.${encodeURIComponent(assistantId)}&order=created_at.desc&limit=100`
  );
  if (!res.ok) return [];
  return (await res.json()) as LearningQuestion[];
}

export async function supabaseResolveLearningQuestion(env: SupabaseEnv, id: string, answer: string): Promise<boolean> {
  const res = await request(env, `learning_questions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved', answer, resolved_at: new Date().toISOString() }),
  });
  return res.ok;
}

/**
 * Ajoute une note de connaissance apprise depuis une conversation à
 * l'assistant (jsonb `knowledge_notes`), au même format que les notes
 * manuelles : chat.js l'injecte dans le prompt dès le message suivant.
 */
export async function supabaseAddKnowledgeNote(
  env: SupabaseEnv,
  assistantId: string,
  note: { title: string; content: string; status?: 'active' | 'pending_review'; source?: string; category?: string }
): Promise<boolean> {
  const readRes = await request(env, `assistants?id=eq.${encodeURIComponent(assistantId)}&select=knowledge_notes`);
  if (!readRes.ok) return false;
  const rows = (await readRes.json()) as Array<{ knowledge_notes: any[] }>;
  if (!rows[0]) return false;
  const notes = Array.isArray(rows[0].knowledge_notes) ? rows[0].knowledge_notes : [];
  const createdAt = new Date().toISOString();
  const pending = note.status === 'pending_review';
  notes.push({
    id: `learned_${crypto.randomUUID()}`,
    title: note.title.slice(0, 120),
    content: note.content.slice(0, 4000),
    category: note.category || 'faq',
    enabled: !pending,
    source: note.source || 'learned_conversation',
    approvalStatus: pending ? 'pending_review' : 'approved',
    status: pending ? 'pending_review' : 'active',
    createdAt,
    updatedAt: createdAt,
  });
  const res = await request(env, `assistants?id=eq.${encodeURIComponent(assistantId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ knowledge_notes: notes, updated_at: createdAt }),
  });
  if (!res.ok) return false;
  const synced = await supabaseSyncKnowledgeNotes(env, assistantId, notes);
  if (!synced.ok) console.warn('[knowledge] ajout appris stocké en JSON, table en attente:', synced.error || synced.status);
  return true;
}

export async function supabaseInsertFeedback(
  env: SupabaseEnv,
  row: { assistant_id: string; session_id?: string; rating: 'up' | 'down'; message_text?: string }
): Promise<boolean> {
  const res = await request(env, 'message_feedback', {
    method: 'POST',
    body: JSON.stringify({
      assistant_id: row.assistant_id,
      session_id: row.session_id || null,
      rating: row.rating,
      message_text: (row.message_text || '').slice(0, 2000) || null,
    }),
  });
  return res.ok;
}
