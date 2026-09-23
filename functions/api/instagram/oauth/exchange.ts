import { subscribeToInstagramMessages } from "../subscribe";
import { supabaseConfigured, supabaseRequest, verifySupabaseIdToken } from "../../../_shared/supabase.ts";
import { registerNotifyAccount } from "../../../_shared/merchant-notify.ts";

interface Env {
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_REDIRECT_URI?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({})) as {
      code?: string;
      redirectUri?: string;
      userId?: string;
      assistantId?: string;
      mode?: string;
    };

    // 1. Nettoyage du code OAuth
    const code = String(body.code || "").split("#")[0].replace(/_$/, "").trim();
    
    const appId = context.env.INSTAGRAM_APP_ID;
    const appSecret = context.env.INSTAGRAM_APP_SECRET;
    
    // 2. Alignement exact du redirectUri avec votre configuration Meta (https://jawebflow.pages.dev/)
    let redirectUri = body.redirectUri || context.env.INSTAGRAM_REDIRECT_URI || "https://jawebflow.pages.dev/";
    if (redirectUri === "https://jawebflow.pages.dev") {
      redirectUri = "https://jawebflow.pages.dev/";
    }

    if (!code) {
      return json({ error: "Code d'autorisation Instagram manquant." }, 400);
    }
    if (!appId || !appSecret) {
      return json({ 
        error: "Configuration OAuth incomplète sur Cloudflare : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET sont requis." 
      }, 503);
    }

    // 3. Échange du code temporaire contre un jeton d'accès court terme
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code
    });

    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });

    const tokenData = await tokenResponse.json().catch(() => ({})) as any;

    if (!tokenResponse.ok || !tokenData.access_token) {
      return json({
        error: tokenData.error_message || tokenData.error?.message || `Meta a refusé l'échange du code (HTTP ${tokenResponse.status}).`,
        details: tokenData
      }, 400);
    }

    let accessToken = String(tokenData.access_token);

    // 4. Échange contre un jeton d'accès LONGUE DURÉE (Valide 60 jours)
    try {
      const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(accessToken)}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json().catch(() => ({})) as any;

      if (longLivedResponse.ok && longLivedData.access_token) {
        accessToken = String(longLivedData.access_token);
      }
    } catch (_) {
      // Si l'échange échoue, on conserve le token court
    }

    // 5. Récupération des informations du profil (Sans /v21.0/ pour graph.instagram.com)
    // IMPORTANT : Meta expose DEUX identifiants pour le même compte :
    //  - « id »      : ID applicatif renvoyé par le flux de connexion
    //  - « user_id » : l'ID PROFESSIONNEL utilisé par la messagerie/webhooks
    // (les DM entrants arrivent avec recipient = user_id). Sans ce champ,
    // le webhook ne retrouve jamais la connexion (IDs différents).
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
    );
    const profile = await profileResponse.json().catch(() => ({})) as any;

    if (!profileResponse.ok || !profile.id) {
      return json({ 
        error: profile.error?.message || "Token généré mais impossible de récupérer le profil Instagram.",
        details: profile 
      }, 400);
    }

    // 🏢 MODE NOTIFICATEUR : ce code OAuth concerne le compte officiel
    // JawebFlow (celui qui envoie les alertes aux marchands). Réservé à
    // l'équipe (role admin) — un clic suffit, zéro copier-coller.
    if (String(body.mode || "") === "notificator") {
      const me = await verifySupabaseIdToken(context.env as any, context.request.headers.get("Authorization"));
      if (!me?.uid) return json({ error: "Non authentifié." }, 401);
      const rRes = await supabaseRequest(context.env as any, `users?id=eq.${encodeURIComponent(me.uid)}&select=role`);
      const role = rRes.ok ? ((await rRes.json().catch(() => [])) || [])[0]?.role : null;
      if (role !== "admin" && role !== "superadmin") return json({ error: "Réservé à l'équipe JawebFlow." }, 403);
      await registerNotifyAccount(context.env as any, String(profile.username || ""), accessToken, String(profile.user_id || profile.id));
      return json({ ok: true, mode: "notificator", handle: profile.username || null });
    }

    // 6. Abonnement obligatoire aux événements "messages" du webhook.
    // Sans cette étape, Meta ne renverra JAMAIS les DM entrants au callback,
    // même si le token est valide et le webhook vérifié.
    let subscribed = false;
    let subscribeError: string | undefined;
    try {
      const subResult = await subscribeToInstagramMessages(accessToken);
      subscribed = subResult.success;
      if (!subscribed) {
        subscribeError = subResult.data?.error?.message || `Échec de l'abonnement webhook (HTTP ${subResult.status}).`;
      }
    } catch (subErr: any) {
      subscribeError = subErr?.message || "Erreur réseau pendant l'abonnement webhook.";
    }

    // 7. SAUVEGARDE SERVEUR IMMÉDIATE : le webhook lit la table Supabase
    // instagram_integrations — on enregistre la connexion ICI (service role),
    // sans dépendre du navigateur (qui peut fermer avant, ou échouer en
    // silence comme c'était le cas : le dashboard affichait « connecté »
    // alors que la table restait vide -> robot muet).
    let serverSaved = false;
    let saveError: string | undefined;
    const uid = String(body.userId || "").trim();
    if (supabaseConfigured(context.env as any)) {
      if (/^[0-9a-fA-F-]{36}$/.test(uid)) {
        try {
          const saveRes = await supabaseRequest(context.env as any, "instagram_integrations?on_conflict=user_id", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
            body: JSON.stringify({
              user_id: uid,
              connected: true,
              // Rattache l'assistant en cours de configuration : SANS ce lien,
              // le webhook trouve la connexion mais ne charge NI la base de
              // connaissances NI les informations officielles (réponses vides).
              ...(String(body.assistantId || "").trim()
                ? { assistant_id: String(body.assistantId).trim().slice(0, 120) }
                : {}),
              instagram_user_id: String(profile.user_id || profile.id),
              instagram_username: profile.username || null,
              page_name: profile.name || profile.username || null,
              profile_picture_url: profile.profile_picture_url || null,
              access_token: accessToken,
              auto_reply_enabled: true,
              last_connected_at: new Date().toISOString(),
              webhook_status: subscribed ? "active" : "error",
              updated_at: new Date().toISOString(),
            }),
          });
          serverSaved = saveRes.ok;
          if (!saveRes.ok) saveError = `HTTP ${saveRes.status}: ${(await saveRes.text()).slice(0, 200)}`;
        } catch (e: any) {
          saveError = e?.message || String(e);
        }
        if (!serverSaved) console.error("[instagram][exchange] sauvegarde serveur échouée:", saveError);
      } else {
        saveError = "userId absent/invalide (session non chargée ?)";
      }
    }

    // 8. Succès
    return json({
      success: true,
      instagramUserId: String(profile.id),
      instagramUsername: profile.username ? `@${profile.username}` : "@compte_instagram",
      accountName: profile.name || profile.username || "Compte Instagram",
      profilePictureUrl: profile.profile_picture_url || "",
      accessToken: accessToken,
      subscribed,
      subscribeError,
      serverSaved,
      saveError
    });

  } catch (error: any) {
    return json({ error: error?.message || "Erreur interne pendant l'échange OAuth." }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Cette route accepte uniquement les requêtes POST." }, 405);
}

export default { onRequestPost, onRequestGet, onRequestOptions };
