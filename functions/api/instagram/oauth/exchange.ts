import { subscribeToInstagramMessages } from "../subscribe";
import { supabaseConfigured, supabaseRequest, verifySupabaseIdToken } from "../../../_shared/supabase.ts";
import { registerNotifyAccount, getNotifyConfig } from "../../../_shared/merchant-notify.ts";
import { IG_GRAPH_VERSION } from "../../../_shared/ig-api.ts";

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

    const body = await context.request.json().catch(() => ({})) as {
      code?: string;
      redirectUri?: string;
      userId?: string;
      assistantId?: string;
      mode?: string;
      handle?: string;
    };

    console.log("[instagram][exchange] Request body:", {
      code: body.code ? `${body.code.slice(0, 20)}...` : "MISSING",
      userId: body.userId ? "present" : "MISSING",
      assistantId: body.assistantId ? "present" : "MISSING"
    });

    const code = String(body.code || "").split("#")[0].replace(/_$/, "").trim();
    const appId = context.env.INSTAGRAM_APP_ID;
    const appSecret = context.env.INSTAGRAM_APP_SECRET;
    
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

    // 3. Token Exchange
    console.log("[instagram][exchange] === STEP 1: Token Exchange ===");
    
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code
    });

    const tokenError = (data: any) => data?.error_message || data?.error?.message || "";
    let tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    let tokenData = await tokenResponse.json().catch(() => ({})) as any;

    console.log("[instagram][exchange] Endpoint 1 response:", {
      status: tokenResponse.status,
      ok: tokenResponse.ok,
      hasToken: !!tokenData.access_token
    });

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.warn("[instagram][exchange] Endpoint 1 failed, trying endpoint 2...");
      const form2 = new URLSearchParams(form);
      tokenResponse = await fetch(`https://graph.instagram.com/${IG_GRAPH_VERSION}/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form2.toString()
      });
      tokenData = await tokenResponse.json().catch(() => ({})) as any;

      console.log("[instagram][exchange] Endpoint 2 response:", {
        status: tokenResponse.status,
        ok: tokenResponse.ok,
        hasToken: !!tokenData.access_token
      });
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[instagram][exchange] FAIL: Both token endpoints failed");
      return json({
        error: `Meta a refusé l'échange du code [étape token] : ${tokenError(tokenData) || `HTTP ${tokenResponse.status}`}`,
        step: "token",
        details: tokenData
      }, 400);
    }

    console.log("[instagram][exchange] ✅ Token exchange SUCCESS");

    const tokenRecord = Array.isArray(tokenData.data) ? (tokenData.data[0] || {}) : tokenData;
    const tokenUserId = String(tokenRecord.user_id || tokenData.user_id || "").trim();
    let accessToken = String(tokenRecord.access_token || tokenData.access_token || "");
    const grantedPermissions = String(tokenRecord.permissions ?? tokenData.permissions ?? "")
      .split(",").map((p: string) => p.trim()).filter(Boolean);

    console.log("[instagram][exchange] Permissions:", grantedPermissions);

    // 4. Long-lived Token Exchange
    // ✅ FIXED: Use query parameters in URL, not POST body
    console.log("[instagram][exchange] === STEP 2: Long-lived Token ===");
    
    let longLivedOk = false;
    try {
      // Build URL with query parameters (NOT form body)
      const llParams = new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: accessToken
      });

      const llCandidates = [
        `https://graph.instagram.com/access_token?${llParams.toString()}`,
      ];

      for (const llUrl of llCandidates) {
        try {
          console.log("[instagram][exchange] Attempting long-lived (GET with params):", llUrl.split("?")[0]);
          
          // ✅ Use GET with query parameters, not POST
          const longLivedResponse = await fetch(llUrl, {
            method: "GET"  // ✅ MUST be GET
          });
          const longLivedData = await longLivedResponse.json().catch(() => ({})) as any;
          
          console.log("[instagram][exchange] Long-lived response:", {
            status: longLivedResponse.status,
            ok: longLivedResponse.ok,
            hasToken: !!longLivedData.access_token
          });

          if (longLivedResponse.ok && longLivedData.access_token) {
            accessToken = String(longLivedData.access_token);
            longLivedOk = true;
            console.log("[instagram][exchange] ✅ Long-lived token obtained");
            break;
          }
        } catch (llFetchErr: any) {
          console.warn("[instagram][exchange] Long-lived fetch error:", llFetchErr?.message);
        }
      }
    } catch (llErr: any) {
      console.warn("[instagram][exchange] Long-lived block error:", llErr?.message);
    }

    console.log("[instagram][exchange] Token type:", longLivedOk ? "LONG-LIVED (60 days)" : "SHORT-LIVED (1 hour)");

    // 5. Profile Fetching
    // ✅ FIXED: Use GET with query parameters in URL
    console.log("[instagram][exchange] === STEP 3: Profile Fetching ===");
    
    const profileFields = "user_id,username,name,profile_picture_url";
    
    interface ProfileCandidate {
      url: string;
    }
    
    // ✅ Use GET with query parameters only
    const profileCandidates: ProfileCandidate[] = [
      {
        url: `https://graph.instagram.com/${IG_GRAPH_VERSION}/me?fields=${profileFields}&access_token=${encodeURIComponent(accessToken)}`
      },
      {
        url: `https://graph.instagram.com/${IG_GRAPH_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`
      }
    ];

    let profile: any = null;
    const profileErrors: string[] = [];
    
    for (const candidate of profileCandidates) {
      try {
        console.log("[instagram][exchange] Attempting profile (GET):", candidate.url.split("?")[0]);
        
        // ✅ Use GET only (no POST variants)
        const profileResponse = await fetch(candidate.url, {
          method: "GET"
        });
        const pData = await profileResponse.json().catch(() => ({})) as any;
        
        console.log("[instagram][exchange] Profile response:", {
          status: profileResponse.status,
          ok: profileResponse.ok,
          hasData: !!(pData.id || pData.user_id)
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
      }
    }

    if (!profile) {
      return json({
        error: "Meta n’a pas renvoyé le vrai compte Instagram. Vérifie que l’utilisateur est un compte professionnel, que les autorisations sont accordées et reconnecte-le.",
        step: "profile",
        details: { attempts: profileErrors, tokenUserId: tokenUserId || undefined },
      }, 400);
    }

    const igProfessionalId = String(profile.user_id || profile.id || "").trim();
    const igUsername = String(profile?.username || "").trim();
    
    console.log("[instagram][exchange] Identity resolved:", {
      igProfessionalId: igProfessionalId ? `${igProfessionalId.slice(0, 12)}…` : "MISSING",
      igUsername: igUsername || "MISSING"
    });

    // 🏢 MODE NOTIFICATEUR
    if (String(body.mode || "") === "notificator") {
      console.log("[instagram][exchange] === MODE: NOTIFICATOR ===");
      
      const me = await verifySupabaseIdToken(context.env as any, context.request.headers.get("Authorization"));
      if (!me?.uid) return json({ error: "Non authentifié." }, 401);

      const rRes = await supabaseRequest(context.env as any, `users?id=eq.${encodeURIComponent(me.uid)}&select=role`);
      const role = rRes.ok ? ((await rRes.json().catch(() => [])) || [])[0]?.role : null;
      
      if (role !== "admin" && role !== "superadmin") {
        return json({ error: "Réservé à l'équipe JawebFlow." }, 403);
      }

      if (!igProfessionalId) {
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
        const subResult = await subscribeToInstagramMessages(accessToken, igProfessionalId);
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
    
    // ✅ FIXED: For merchant mode, we don't strictly require profile data
    // because we have user_id from token. But if profile failed for all endpoints,
    // we should handle it gracefully.
    if (!igProfessionalId || !igUsername) {
      console.error("[instagram][exchange] FAIL: No identity data available");
      return json({ 
        error: "Impossible de récupérer l'identifiant du compte Instagram.",
        step: "profile",
        details: { attempts: profileErrors }
      }, 400);
    }

    // Accept profile best-effort: if we have igProfessionalId from token, we're good
    if (!profile) {
      console.warn("[instagram][exchange] Profile unavailable but continuing with token user_id");
    }

    console.log("[instagram][exchange] ✅ Identity validation passed");

    // 6. Webhook subscription
    console.log("[instagram][exchange] === STEP 4: Webhook Subscription ===");
    
    let subscribed = false;
    let subscribeError: string | undefined;
    try {
      const subResult = await subscribeToInstagramMessages(accessToken, igProfessionalId);
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
              instagram_user_id: igProfessionalId || String(profile?.user_id || profile?.id || ""),
              instagram_username: profile?.username || null,
              page_name: profile?.name || profile?.username || null,
              profile_picture_url: profile?.profile_picture_url || null,
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
          } else {
            console.log("[instagram][exchange] ✅ Supabase save successful");
          }
        } catch (e: any) {
          saveError = e?.message || String(e);
        }
      } else {
        saveError = "userId absent/invalide";
      }
    }

    // 8. Success response
    console.log("[instagram][exchange] ========== SUCCESS RESPONSE ==========");
    return json({
      success: true,
      instagramUserId: igProfessionalId || String(profile?.id || ""),
      permissions: grantedPermissions,
      instagramUsername: profile?.username ? `@${profile.username}` : "@compte_instagram",
      accountName: profile?.name || profile?.username || "Compte Instagram",
      profilePictureUrl: profile?.profile_picture_url || "",
      accessToken: accessToken,
      subscribed,
      subscribeError,
      serverSaved,
      saveError
    });

  } catch (error: any) {
    console.error("[instagram][exchange] ========== FATAL ERROR ==========");
    console.error("[instagram][exchange] Error:", error?.message);
    
    return json({ 
      error: error?.message || "Erreur interne pendant l'échange OAuth.",
      step: "unknown"
    }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Cette route accepte uniquement les requêtes POST." }, 405);
}

export default { onRequestPost, onRequestGet, onRequestOptions };
