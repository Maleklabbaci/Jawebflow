/**
 * JAWEBFLOW — Ajout éclair de connaissances (« discussion » du marchand).
 *
 * Le marchand écrit une phrase naturelle — « j'ai ajouté un produit spiderman
 * case iphone 13 14 15 16 à 1900 DA » ou « supprime la fiche jean noir » —
 * Gemini en extrait UNE fiche propre (produit / lien / livraison / contact…)
 * et on la fusionne directement dans la base de connaissance.
 *
 * 💸 Coût par ajout : 1 mini-appel gemini-3.1-flash-lite ≈ 0,0002 $ (~0,07 DA).
 * Aucun scan consommé (limite scans intacte).
 */
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabasePatchAssistant,
  supabaseAssistantRowToConfig,
  verifySupabaseIdToken,
} from "../../_shared/supabase.ts";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

type Note = { id?: string; title: string; category: string; content: string; updatedAt?: string; source?: string };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (!supabaseConfigured(env)) return json({ error: "Base de données non configurée." }, 501);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Non authentifié." }, 401);
  const caller = await verifySupabaseIdToken(env, token);
  if (!caller?.uid) return json({ error: "Non authentifié." }, 401);

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || "").trim().slice(0, 600);
  const assistantId = String(body?.assistantId || "");
  if (!message || !assistantId) return json({ error: "Message et assistantId requis." }, 400);

  const sb = await supabaseGetAssistant(env, assistantId);
  if (!sb.ok || !sb.data) return json({ error: "Assistant introuvable." }, 404);
  const config = supabaseAssistantRowToConfig(sb.data);
  if (config.userId && config.userId !== caller.uid) return json({ error: "Accès refusé." }, 403);

  const existing: Note[] = Array.isArray(config.knowledgeNotes) ? config.knowledgeNotes : [];
  const titles = existing.slice(0, 30).map((n) => n?.title).filter(Boolean);

  // 🧠 UN mini-appel flash-lite : extrait la fiche (add / update / delete)
  const prompt = `Tu es l'assistant du marchand. Il écrit une phrase naturelle sur SON business ; extrais-en UNE fiche de connaissance.

FICHES EXISTANTES (titres) : ${titles.length ? titles.join(" | ") : "(aucune)"}

Réponds UNIQUEMENT en JSON :
{"action":"add|update|delete","title":"...","category":"produits|liens|tarifs|livraison|contact|garanties|faq|services|general","content":"..."}

RÈGLES :
- Produit ajouté ou modifié → action "add" (nouveau) ou "update" (un titre existant désigne le même produit) ; content = "Nom — variantes — prix — URL" (URL recopiée EXACTEMENT si donnée, prix exact).
- « j'ai ajouté un produit spiderman case iphone 13 14 15 16 » → title "Spiderman Case (iPhone 13/14/15/16)", category "produits".
- Lien (site, réseau social, formulaire, collection) → category "liens", URL EXACTE dans content.
- « supprime la fiche X » / « enlève le produit X » → action "delete" + title exact.
- Livraison, contact, garanties, horaires, promo → la catégorie qui convient.
- N'invente RIEN qui n'est pas dans la phrase. Prix, variantes et quantités EXACTS.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt + `\n\nPHRASE DU MARCHAND : ${message}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) return json({ error: "IA momentanément indisponible, réessaie." }, 502);
  const raw = (await res.json().catch(() => null))?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return json({ error: "Réponse IA illisible — reformule la phrase." }, 502); }

  const action: "add" | "update" | "delete" = parsed?.action === "update" ? "update" : parsed?.action === "delete" ? "delete" : "add";
  const title = String(parsed?.title || "").slice(0, 120).trim();
  const category = String(parsed?.category || "general").toLowerCase();
  const content = String(parsed?.content || "").slice(0, 2000).trim();
  if (!title || (!content && action !== "delete")) return json({ error: "Fiche illisible — reformule la phrase." }, 422);

  const now = new Date().toISOString();
  let updated: Note[];
  if (action === "delete") {
    updated = existing.filter((n) => n?.title?.toLowerCase().trim() !== title.toLowerCase().trim());
  } else {
    const note: Note = { id: `qa_${Date.now().toString(36)}`, title, category, content, updatedAt: now, source: "quick-add" };
    const idx = action === "update" ? existing.findIndex((n) => n?.title?.toLowerCase().trim() === title.toLowerCase().trim()) : -1;
    updated = idx >= 0 ? existing.map((n, i) => (i === idx ? { ...n, ...note, id: n.id || note.id } : n)) : [...existing, note];
  }

  const write = await supabasePatchAssistant(env, assistantId, { userId: caller.uid, knowledgeNotes: updated });
  if (!write.ok) return json({ error: "Sauvegarde échouée, réessaie." }, 502);
  return json({ ok: true, action, note: { title, category, content }, notes: updated });
}
