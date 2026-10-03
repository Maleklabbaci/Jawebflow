/**
 * JAWEBFLOW — Pages du site scannées (table knowledge_documents), côté tableau de bord.
 * GET    ?assistantId=...        -> liste légère (id, titre, extrait, url)
 * DELETE ?assistantId=...&id=... -> supprime une page scannée
 * Le marchand ne voyait pas ces fiches alors que le bot les lit : elles apparaissent maintenant.
 */
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
  supabaseRequest,
  verifySupabaseIdToken,
} from "../../_shared/supabase.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function authorize(request: Request, env: any, assistantId: string) {
  if (!supabaseConfigured(env)) return { error: json({ error: "Base de données non configurée." }, 501) };
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: json({ error: "Non authentifié." }, 401) };
  const caller = await verifySupabaseIdToken(env, token);
  if (!caller?.uid) return { error: json({ error: "Non authentifié." }, 401) };
  if (!assistantId) return { error: json({ error: "assistantId requis." }, 400) };
  const sb = await supabaseGetAssistant(env, assistantId);
  if (!sb.ok || !sb.data) return { error: json({ error: "Assistant introuvable." }, 404) };
  const config = supabaseAssistantRowToConfig(sb.data);
  if (config.userId && config.userId !== caller.uid) return { error: json({ error: "Accès refusé." }, 403) };
  return { error: null };
}

export async function onRequestGet(context: { request: Request; env: any }) {
  const { request, env } = context;
  const assistantId = new URL(request.url).searchParams.get("assistantId") || "";
  const auth = await authorize(request, env, assistantId);
  if (auth.error) return auth.error;

  const res = await supabaseRequest(
    env,
    `knowledge_documents?assistant_id=eq.${encodeURIComponent(assistantId)}&select=id,title,content,source_url,scanned_at&order=scanned_at.desc&limit=200`,
  );
  if (!res.ok) return json({ documents: [] });
  const rows = (await res.json()) as Array<{ id: string; title?: string; content?: string; source_url?: string; scanned_at?: string }>;
  return json({
    documents: rows.map((r) => ({
      id: r.id,
      title: r.title || "Page du site",
      excerpt: String(r.content || "").slice(0, 240),
      sourceUrl: r.source_url || "",
      scannedAt: r.scanned_at || "",
    })),
  });
}

export async function onRequestDelete(context: { request: Request; env: any }) {
  const { request, env } = context;
  const params = new URL(request.url).searchParams;
  const assistantId = params.get("assistantId") || "";
  const id = params.get("id") || "";
  const auth = await authorize(request, env, assistantId);
  if (auth.error) return auth.error;
  if (!id) return json({ error: "id requis." }, 400);

  const res = await supabaseRequest(
    env,
    `knowledge_documents?id=eq.${encodeURIComponent(id)}&assistant_id=eq.${encodeURIComponent(assistantId)}`,
    { method: "DELETE" },
  );
  return json({ ok: res.ok }, res.ok ? 200 : 500);
}
