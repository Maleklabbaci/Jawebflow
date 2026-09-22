/**
 * JAWEBFLOW — Config de connexion Instagram par utilisateur.
 * Remplace le doc Firestore `instagram_integrations/{uid}` : la table
 * table protège la colonne `access_token` (Meta) : ce endpoint
 * centralise la lecture/écriture pour ne jamais l'exposer via un accès
 * client direct, comme le recommande le schéma SQL.
 */
import {
  verifySupabaseIdToken,
  supabaseGetInstagramIntegration,
  supabaseUpsertInstagramIntegration,
} from "../../_shared/supabase.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export async function onRequestGet(context: any) {
  try {
    const env = context.env;
    const caller = await verifySupabaseIdToken(env, context.request.headers.get("Authorization"));
    if (!caller) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: cors });
    }
    const data = await supabaseGetInstagramIntegration(env, caller.uid);
    return new Response(JSON.stringify({ data: data || null }), { status: 200, headers: cors });
  } catch (err: any) {
    console.error("[instagram/integration] erreur GET", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env;
    const caller = await verifySupabaseIdToken(env, context.request.headers.get("Authorization"));
    if (!caller) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: cors });
    }
    const patch = await context.request.json();
    const data = await supabaseUpsertInstagramIntegration(env, caller.uid, patch);
    return new Response(JSON.stringify({ data }), { status: 200, headers: cors });
  } catch (err: any) {
    console.error("[instagram/integration] erreur POST", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
