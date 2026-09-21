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

    // Nettoyage du code d'autorisation transmis par Instagram
    const code = String(body.code || "").split("#")[0].replace(/_$/, "").trim();
    
    const appId = context.env.INSTAGRAM_APP_ID;
    const appSecret = context.env.INSTAGRAM_APP_SECRET;
    
    // Le redirect_uri doit être EXACTEMENT celui envoyé lors de l'ouverture du pop-up/redirection
    const redirectUri = body.redirectUri || context.env.INSTAGRAM_REDIRECT_URI;

    if (!code) {
      return json({ error: "Code d'autorisation Instagram manquant dans la requête." }, 400);
    }
    if (!redirectUri) {
      return json({ error: "redirectUri manquant." }, 400);
    }
    if (!appId || !appSecret) {
      return json({ error: "INSTAGRAM_APP_ID ou INSTAGRAM_APP_SECRET non configuré dans Cloudflare." }, 503);
    }

    // 1. ÉCHANGE DU CODE CONTRE UN TOKEN DE COURTE DURÉE
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
        error: tokenData.error_message || tokenData.error?.message || `Meta a refusé le code OAuth (HTTP ${tokenResponse.status}).`,
        details: tokenData
      }, 400);
    }

    let accessToken = String(tokenData.access_token);

    // 2. ÉCHANGE CONTRE UN TOKEN DE LONGUE DURÉE (Valide 60 jours)
    try {
      const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(accessToken)}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json().catch(() => ({})) as any;

      if (longLivedResponse.ok && longLivedData.access_token) {
        accessToken = String(longLivedData.access_token);
      }
    } catch (_) {
      // Si l'échange échoue, on garde le token court
    }

    // 3. RÉCUPÉRATION DU PROFIL UTILISATEUR (API v21.0 - Champs valides uniquement)
    // NOTE: On utilise les champs supportés par 'instagram_business_basic': id, username, name, profile_picture_url
    const profileUrl = `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
    
    const profileResponse = await fetch(profileUrl, { method: "GET" });
    const profile = await profileResponse.json().catch(() => ({})) as any;

    if (!profileResponse.ok || !profile.id) {
      return json({ 
        error: profile.error?.message || "Meta a délivré un token mais le profil Instagram est inaccessible.",
        details: profile 
      }, 400);
    }

    // 4. RETOUR SUCCÈS
    return json({
      success: true,
      instagramUserId: String(profile.id),
      instagramUsername: profile.username ? `@${profile.username}` : "@compte_instagram",
      accountName: profile.name || profile.username || "Compte Instagram",
      profilePictureUrl: profile.profile_picture_url || "",
      accessToken: accessToken
    });

  } catch (error: any) {
    return json({ error: error?.message || "Erreur interne pendant l'échange OAuth Instagram." }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Cette route OAuth accepte uniquement POST." }, 405);
}

export default { onRequestPost, onRequestGet, onRequestOptions };
