// Abonne le compte Instagram Business connecté aux notifications de Meta :
//   • messages              → les messages privés reçus
//   • messaging_postbacks   → les clics sur les boutons (ex. « ✅ C'est fait »)
//   • comments              → les commentaires sous les publications (automatisations)
// Sans cet appel, Meta ne délivre JAMAIS rien au webhook, même si l'URL est
// vérifiée et que le jeton est valide.
// Doc Meta : POST https://graph.instagram.com/{version}/me/subscribed_apps?subscribed_fields=...
//
// Si Meta refuse la liste complète (ex. « commentaires » pas encore activés
// dans l'application Meta), on retombe sur une liste plus courte : la
// réception des messages privés n'est jamais cassée par cette évolution.

import { subscribeAccount } from "../../_shared/ig-api.ts";
import { verifySupabaseIdToken } from "../../_shared/supabase.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function subscribeToInstagramMessages(accessToken: string, igUserId?: string) {
  const r = await subscribeAccount(accessToken, igUserId);
  return {
    success: r.success,
    status: r.status,
    fields: r.fields,
    data: r.data && typeof r.data === "object" && r.data.error ? r.data : r.error ? { error: { message: r.error.raw } } : r.data,
  };
}

export async function onRequestPost(context: { request: Request; env?: any }) {
  try {
    // Réservé aux marchands connectés : ce point d'entrée appelle Meta avec le
    // jeton fourni, il ne doit pas servir de relais anonyme.
    const caller = await verifySupabaseIdToken(context.env || {}, context.request.headers.get("Authorization"));
    if (!caller) return json({ success: false, error: "Connexion requise." }, 401);

    const body = await context.request.json().catch(() => ({})) as { accessToken?: string; instagramUserId?: string };
    const accessToken = String(body.accessToken || "").trim();

    if (!accessToken) {
      return json({ success: false, error: "accessToken manquant." }, 400);
    }

    const result = await subscribeToInstagramMessages(accessToken, body.instagramUserId);

    if (!result.success) {
      return json({
        success: false,
        error: result.data?.error?.message || `Meta a refusé l'abonnement au webhook (HTTP ${result.status}).`,
        details: result.data
      }, 400);
    }

    return json({ success: true, fields: result.fields });
  } catch (error: any) {
    return json({ success: false, error: error?.message || "Erreur interne pendant l'abonnement au webhook." }, 500);
  }
}

export default { onRequestPost, onRequestOptions };
