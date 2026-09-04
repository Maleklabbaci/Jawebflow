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
    };
    const code = String(body.code || "").split("#")[0].replace(/_$/, "").trim();
    const appId = context.env.INSTAGRAM_APP_ID;
    const appSecret = context.env.INSTAGRAM_APP_SECRET;
    const redirectUri = body.redirectUri || context.env.INSTAGRAM_REDIRECT_URI || new URL(context.request.url).origin + "/";

    if (!code) return json({ error: "Code d'autorisation Instagram manquant." }, 400);
    if (!appId || !appSecret) {
      return json({ error: "OAuth Instagram non configuré dans Cloudflare : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET sont requis." }, 503);
    }

    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    });
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    const tokenData = await tokenResponse.json().catch(() => ({})) as any;
    if (!tokenResponse.ok || !tokenData.access_token) {
      return json({
        error: tokenData.error_message || tokenData.error?.message || `Meta a refusé le code OAuth (HTTP ${tokenResponse.status}).`
      }, 400);
    }

    let accessToken = String(tokenData.access_token);
    try {
      const longLivedResponse = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(accessToken)}`
      );
      const longLivedData = await longLivedResponse.json().catch(() => ({})) as any;
      if (longLivedResponse.ok && longLivedData.access_token) accessToken = longLivedData.access_token;
    } catch (_) {
      // Le token court reste utilisable si Meta ne permet pas encore l'échange long.
    }

    const profileResponse = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
    );
    const profile = await profileResponse.json().catch(() => ({})) as any;
    if (!profileResponse.ok || !profile.id) {
      return json({ error: profile.error?.message || "Meta a délivré un token mais le profil Instagram est inaccessible." }, 400);
    }

    return json({
      success: true,
      instagramUserId: String(profile.id),
      instagramUsername: profile.username ? `@${profile.username}` : "@compte_instagram",
      accountName: profile.name || profile.username || "Compte Instagram",
      profilePictureUrl: profile.profile_picture_url || "",
      accessToken
    });
  } catch (error: any) {
    return json({ error: error?.message || "Erreur interne pendant l'échange OAuth Instagram." }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Cette route OAuth accepte uniquement POST." }, 405);
}

export default { onRequestPost, onRequestGet, onRequestOptions };
