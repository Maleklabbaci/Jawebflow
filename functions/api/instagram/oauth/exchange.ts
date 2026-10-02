import { subscribeToInstagramMessages } from "../subscribe";
import { supabaseConfigured, supabaseRequest, verifySupabaseIdToken } from "../../../_shared/supabase.ts";
import { registerNotifyAccount, getNotifyConfig } from "../../../_shared/merchant-notify.ts";

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
    console.log("[instagram][exchange] ========== START REQUEST ==========");
    console.log("[instagram][exchange] Method:", context.request.method);
    console.log("[instagram][exchange] URL:", context.request.url);

    // Parse request body
    let body: any = {};
    try {
      const rawBody = await context.request.clone().text();
      console.log("[instagram][exchange] Raw body:", rawBody.slice(0, 200));
      body = JSON.parse(rawBody);
    } catch (parseErr: any) {
      console.error("[instagram][exchange] Body parse error:", parseErr?.message);
      return json({ 
        error: "Corps de la requête invalide (JSON non valide).",
        details: parseErr?.message 
      }, 400);
    }

    console.log("[instagram][exchange] Parsed body keys:", Object.keys(body));
    console.log("[instagram][exchange] code:", body.code ? `${body.code.slice(0, 20)}...` : "MISSING");
    console.log("[instagram][exchange] userId:", body.userId ? `${body.userId.slice(0, 20)}...` : "MISSING");
    console.log("[instagram][exchange] assistantId:", body.assistantId ? `${body.assistantId.slice(0, 20)}...` : "MISSING");

    // 1. Nettoyage du code OAuth
    const code = String(body.code || "").split("#")[0].replace(/_$/, "").trim();
    console.log("[instagram][exchange] Cleaned code:", code ? `${code.slice(0, 20)}...` : "EMPTY");
    
    const appId = context.env.INSTAGRAM_APP_ID;
    const appSecret = context.env.INSTAGRAM_APP_SECRET;
    
    console.log("[instagram][exchange] Config check:");
    console.log("  - INSTAGRAM_APP_ID:", appId ? `${appId.slice(0, 10)}...` : "MISSING");
    console.log("  - INSTAGRAM_APP_SECRET:", appSecret ? "SET" : "MISSING");
    
    // 2. Alignement exact du redirectUri
    let redirectUri = body.redirectUri || context.env.INSTAGRAM_REDIRECT_URI || "https://jawebflow.pages.dev/";
    if (redirectUri === "https://jawebflow.pages.dev") {
      redirectUri = "https://jawebflow.pages.dev/";
    }
    console.log("[instagram][exchange] Redirect URI:", redirectUri);

    // Validation checks
    if (!code) {
      console.error("[instagram][exchange] FAIL: Code d'autorisation manquant");
      return json({ error: "Code d'autorisation Instagram manquant." }, 400);
    }
    
    if (!appId || !appSecret) {
      console.error("[instagram][exchange] FAIL: Configuration OAuth incomplète");
      console.error("  - appId:", appId ? "OK" : "MISSING");
      console.error("  - appSecret:", appSecret ? "OK" : "MISSING");
      return json({ 
        error: "Configuration OAuth incomplète sur Cloudflare : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET sont requis.",
        configCheck: { appId: !!appId, appSecret: !!appSecret }
      }, 503);
    }

    // 3. Échange du code - Token Exchange
    console.log("[instagram][exchange] === STEP 1: Token Exchange ===");
    
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code
    });

    console.log("[instagram][exchange] Form data prepared:", {
      client_id: `${appId.slice(0, 10)}...`,
      client_secret: `${appSecret.slice(0, 10)}...`,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: `${code.slice(0, 10)}...`
    });

    // Try endpoint 1
    console.log("[instagram][exchange] Attempting endpoint 1: api.instagram.com/oauth/access_token");
    let tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    let tokenData = await tokenResponse.json().catch(() => ({})) as any;

    console.log("[instagram][exchange] Endpoint 1 response:", {
      status: tokenResponse.status,
      ok: tokenResponse.ok,
      hasAccessToken: !!tokenData.access_token,
      error: tokenData.error ? JSON.stringify(tokenData.error).slice(0, 100) : null
    });

    const tokenError = (data: any) => data?.error_message || data?.error?.message || "";

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.warn("[instagram][exchange] Endpoint 1 failed, trying endpoint 2...");
      const form2 = new URLSearchParams(form);
      
      console.log("[instagram][exchange] Attempting endpoint 2: graph.instagram.com/v21.0/oauth/access_token");
      tokenResponse = await fetch("https://graph.instagram.com/v21.0/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form2.toString()
      });
      tokenData = await tokenResponse.json().catch(() => ({})) as any;

      console.log("[instagram][exchange] Endpoint 2 response:", {
        status: tokenResponse.status,
        ok: tokenResponse.ok,
        hasAccessToken: !!tokenData.access_token,
        error: tokenData.error ? JSON.stringify(tokenData.error).slice(0, 100) : null
      });
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[instagram][exchange] FAIL: Token exchange failed on both endpoints");
      console.error("[instagram][exchange] Final response:", JSON.stringify(tokenData).slice(0, 500));
      return json({
        error: `Meta a refusé l'échange du code [étape token] : ${tokenError(tokenData) || `HTTP ${tokenResponse.status}`}`,
        step: "token",
        details: tokenData,
        debugging: {
          responseStatus: tokenResponse.status,
          responseUrl: tokenResponse.url,
          tokenDataKeys: Object.keys(tokenData)
        }
      }, 400);
    }

    console.log("[instagram][exchange] ✅ Token exchange SUCCESS");
    console.log("[instagram][exchange] Token endpoint used:", tokenResponse.url.includes("api.instagram.com") ? "api.instagram.com" : "graph.instagram.com");

    const tokenUserId = String(tokenData.user_id || "").trim();
    if (tokenUserId) {
      console.log("[instagram][exchange] user_id from token:", tokenUserId.slice(0, 12) + "…");
    }

    let accessToken = String(tokenData.access_token);
    console.log("[instagram][exchange] access_token obtained:", accessToken.slice(0, 20) + "…");

    const grantedPermissions = String(tokenData.permissions ?? tokenData.data?.[0]?.permissions ?? "")
      .split(",").map((p: string) => p.trim()).filter(Boolean);
    console.log("[instagram][exchange] Permissions:", grantedPermissions);

    // 4. Long-lived token exchange
    console.log("[instagram][exchange] === STEP 2: Long-lived Token ===");
    
    let longLivedOk = false;
    try {
      const llForm = new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: accessToken
      });

      const llCandidates = [
        "https://graph.instagram.com/v21.0/access_token",
        "https://graph.instagram.com/access_token",
      ];

      for (const llUrl of llCandidates) {
        try {
          console.log("[instagram][exchange] Attempting long-lived endpoint:", llUrl);
          
          const longLivedResponse = await fetch(llUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: llForm.toString()
          });
          const longLivedData = await longLivedResponse.json().catch(() => ({})) as any;
          
          console.log("[instagram][exchange] Long-lived response:", {
            url: llUrl,
            status: longLivedResponse.status,
            ok: longLivedResponse.ok,
            hasAccessToken: !!longLivedData.access_token,
            error: longLivedData.error ? JSON.stringify(longLivedData.error).slice(0, 100) : null
          });

          if (longLivedResponse.ok && longLivedData.access_token) {
            accessToken = String(longLivedData.access_token);
            longLivedOk = true;
            console.log("[instagram][exchange] ✅ Long-lived token obtained from:", llUrl);
            break;
          }
        } catch (llFetchErr: any) {
          console.error("[instagram][exchange] Long-lived fetch error:", llFetchErr?.message);
        }
      }
    } catch (llErr: any) {
      console.error("[instagram][exchange] Long-lived block error:", llErr?.message);
    }

    console.log("[instagram][exchange] Token type:", longLivedOk ? "LONG-LIVED (60 days)" : "SHORT-LIVED (1 hour)");

    // 5. Profile fetching
    console.log("[instagram][exchange] === STEP 3: Profile Fetching ===");
    
    const profileFields = "user_id,username,name,profile_picture_url";
    
    interface ProfileCandidate {
      url: string;
      method: "GET" | "POST";
      body?: URLSearchParams;
    }
    
    const profileCandidates: ProfileCandidate[] = [
      {
        url: `https://graph.instagram.com/v21.0/me?fields=${profileFields}&access_token=${encodeURIComponent(accessToken)}`,
        method: "GET"
      },
      {
        url: `https://graph.instagram.com/me?fields=${profileFields}&access_token=${encodeURIComponent(accessToken)}`,
        method: "GET"
      },
      {
        url: `https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`,
        method: "GET"
      },
      {
        url: "https://graph.instagram.com/v21.0/me",
        method: "POST",
        body: new URLSearchParams({
          fields: profileFields,
          access_token: accessToken
        })
      },
      {
        url: "https://graph.instagram.com/me",
        method: "POST",
        body: new URLSearchParams({
          fields: profileFields,
          access_token: accessToken
        })
      }
    ];

    let profile: any = null;
    const profileErrors: string[] = [];
    
    for (const candidate of profileCandidates) {
      try {
        console.log(`[instagram][exchange] Attempting profile (${candidate.method}):`, candidate.url.split("?")[0]);
        
        const fetchOptions: RequestInit = {
          method: candidate.method
        };
        
        if (candidate.method === "POST" && candidate.body) {
          fetchOptions.headers = { "Content-Type": "application/x-www-form-urlencoded" };
          fetchOptions.body = candidate.body.toString();
        }
        
        const profileResponse = await fetch(candidate.url, fetchOptions);
        const pData = await profileResponse.json().catch(() => ({})) as any;
        
        console.log("[instagram][exchange] Profile response:", {
          method: candidate.method,
          status: profileResponse.status,
          ok: profileResponse.ok,
          hasData: !!(pData.id || pData.user_id),
          error: pData.error ? JSON.stringify(pData.error).slice(0, 100) : null
        });

        if (profileResponse.ok && (pData.id || pData.user_id)) {
          profile = pData;
          console.log("[instagram][exchange] ✅ Profile obtained successfully");
          break;
        }
        
        const pErr = pData?.error?.message || `HTTP ${profileResponse.status}`;
        profileErrors.push(pErr);
      } catch (pFetchErr: any) {
        const pErr = pFetchErr?.message || "Network error";
        profileErrors.push(pErr);
        console.error("[instagram][exchange] Profile fetch error:", pErr);
      }
    }

    const igProfessionalId = String(profile?.user_id || profile?.id || tokenUserId || "").trim();
    const igUsername = String(profile?.username || "").trim();
    
    console.log("[instagram][exchange] Identity resolved:", {
      igProfessionalId: igProfessionalId ? `${igProfessionalId.slice(0, 12)}…` : "MISSING",
      igUsername: igUsername || "MISSING",
      fromProfile: !!profile,
      fromToken: !!tokenUserId
    });

    // 🏢 MODE NOTIFICATEUR
    if (String(body.mode || "") === "notificator") {
      console.log("[instagram][exchange] === MODE: NOTIFICATOR ===");
      
      const me = await verifySupabaseIdToken(context.env as any, context.request.headers.get("Authorization"));
      if (!me?.uid) {
        console.error("[instagram][exchange] FAIL: Not authenticated");
        return json({ error: "Non authentifié." }, 401);
      }

      const rRes = await supabaseRequest(context.env as any, `users?id=eq.${encodeURIComponent(me.uid)}&select=role`);
      const role = rRes.ok ? ((await rRes.json().catch(() => [])) || [])[0]?.role : null;
      
      if (role !== "admin" && role !== "superadmin") {
        console.error("[instagram][exchange] FAIL: Insufficient permissions, role:", role);
        return json({ error: "Réservé à l'équipe JawebFlow." }, 403);
      }

      if (!igProfessionalId) {
        console.error("[instagram][exchange] FAIL: No Instagram ID found");
        return json({ 
          error: "Identifiant du compte introuvable dans la réponse Meta [étape identité].", 
          step: "identity", 
          details: { attempts: profileErrors } 
        }, 400);
      }

      const cfgNow = await getNotifyConfig(context.env as any);
      const handle = igUsername || String(body.handle || "") || cfgNow.handle || "jawebflow";
      
      await registerNotifyAccount(context.env as any, handle, accessToken, igProfessionalId);

      let subscribed = false;
      let subscribeError: string | undefined;
      try {
        const subResult = await subscribeToInstagramMessages(accessToken);
        subscribed = subResult.success;
        if (!subscribed) subscribeError = subResult.data?.error?.message || `HTTP ${subResult.status}`;
      } catch (e: any) {
        subscribeError = e?.message || String(e);
      }

      console.log("[instagram][exchange] ✅ NOTIFICATOR MODE SUCCESS");
      return json({ 
        ok: true, 
        mode: "notificator", 
        handle, 
        subscribed, 
        subscribeError, 
        profileWarn: profile ? undefined : "Profil Meta illisible (non bloquant) — compte enregistré via l'identifiant du jeton." 
      });
    }

    // ── FLUX MARCHAND
    console.log("[instagram][exchange] === MODE: MERCHANT ===");
    
    if (!profile || (!profile.id && !profile.user_id)) {
      console.error("[instagram][exchange] FAIL: Profile required for merchant mode");
      console.error("[instagram][exchange] Profile errors:", profileErrors);
      return json({ 
        error: `Meta a refusé la récupération du profil [étape profil] : ${profileErrors[0] || "réponse vide"}`,
        step: "profile",
        details: { attempts: profileErrors }
      }, 400);
    }

    console.log("[instagram][exchange] ✅ Profile validation passed");

    // 6. Webhook subscription
    console.log("[instagram][exchange] === STEP 4: Webhook Subscription ===");
    
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

    console.log("[instagram][exchange] Webhook subscription:", { subscribed, subscribeError });

    // 7. Server save
    console.log("[instagram][exchange] === STEP 5: Server Save ===");
    
    let serverSaved = false;
    let saveError: string | undefined;
    const uid = String(body.userId || "").trim();
    
    console.log("[instagram][exchange] uid validation:", {
      provided: uid ? "yes" : "no",
      isValid: /^[0-9a-fA-F-]{36}$/.test(uid) ? "yes" : "no",
      supabaseConfigured: supabaseConfigured(context.env as any)
    });

    if (supabaseConfigured(context.env as any)) {
      if (/^[0-9a-fA-F-]{36}$/.test(uid)) {
        try {
          console.log("[instagram][exchange] Saving to Supabase...");
          const saveRes = await supabaseRequest(context.env as any, "instagram_integrations?on_conflict=user_id", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
            body: JSON.stringify({
              user_id: uid,
              connected: true,
              ...(String(body.assistantId || "").trim()
                ? { assistant_id: String(body.assistantId).trim().slice(0, 120) }
                : {}),
              instagram_user_id: igProfessionalId || String(profile.user_id || profile.id),
              instagram_username: profile.username || null,
              page_name: profile.name || profile.username || null,
              profile_picture_url: profile.profile_picture_url || null,
              access_token: accessToken,
              last_connected_at: new Date().toISOString(),
              webhook_status: subscribed ? "active" : "error",
              updated_at: new Date().toISOString(),
            }),
          });
          
          serverSaved = saveRes.ok;
          if (!saveRes.ok) {
            const responseText = await saveRes.text();
            saveError = `HTTP ${saveRes.status}: ${responseText.slice(0, 200)}`;
            console.error("[instagram][exchange] Supabase save failed:", saveError);
          } else {
            console.log("[instagram][exchange] ✅ Supabase save successful");
          }
        } catch (e: any) {
          saveError = e?.message || String(e);
          console.error("[instagram][exchange] Supabase save error:", saveError);
        }
      } else {
        saveError = "userId absent/invalide (session non chargée ?)";
        console.error("[instagram][exchange] Invalid userId format:", uid);
      }
    }

    // 8. Success response
    console.log("[instagram][exchange] ========== SUCCESS RESPONSE ==========");
    return json({
      success: true,
      instagramUserId: igProfessionalId || String(profile.id),
      permissions: grantedPermissions,
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
    console.error("[instagram][exchange] ========== FATAL ERROR ==========");
    console.error("[instagram][exchange] Error:", error?.message);
    console.error("[instagram][exchange] Stack:", error?.stack?.slice(0, 500));
    
    return json({ 
      error: error?.message || "Erreur interne pendant l'échange OAuth.",
      debugging: {
        errorType: error?.constructor?.name,
        errorMessage: error?.message
      }
    }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Cette route accepte uniquement les requêtes POST." }, 405);
}

export default { onRequestPost, onRequestGet, onRequestOptions };
