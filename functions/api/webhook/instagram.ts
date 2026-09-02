// Cloudflare Pages Function for Meta / Instagram Webhook Verification and Event Receiving

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get("hub.mode") || url.searchParams.get("mode");
  const token = url.searchParams.get("hub.verify_token") || url.searchParams.get("verify_token");
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge");

  console.log("🔍 Meta Webhook Verification (Cloudflare Pages):", { mode, token, challenge, pathname: url.pathname });

  // 1. When Meta sends the verification challenge (GET request)
  if (challenge) {
    console.log("✅ Returning challenge to Meta:", challenge);
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  // 2. Mode is subscribe without challenge
  if (mode === "subscribe") {
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  // 3. Direct browser visit (status page)
  const currentHost = url.host;
  return new Response(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <title>JawebFlow - Webhook Instagram Opérationnel</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #131b2e; border: 1px solid #1e293b; padding: 32px; border-radius: 16px; max-width: 540px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 16px; }
        h1 { font-size: 20px; font-weight: 700; margin: 0 0 10px; color: #ffffff; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 8px 0; }
        .code-box { background: #0b1120; border: 1px solid #1e293b; padding: 12px 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #38bdf8; word-break: break-all; margin: 8px 0 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">● Prêt & Actif sur Cloudflare Edge</div>
        <h1>Webhook Instagram JawebFlow</h1>
        <p>Ce point de terminaison répond directement et instantanément aux requêtes de validation de <strong>Meta for Developers</strong>.</p>
        
        <p><strong>URL de rappel (Callback URL) :</strong></p>
        <div class="code-box">https://${currentHost}${url.pathname}</div>

        <p><strong>Jeton de vérification (Verify Token) :</strong></p>
        <div class="code-box" style="color: #c084fc; font-weight: bold;">jawebflow_secure_token_2026</div>

        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
          Statut : 200 OK — Réponse automatique du challenge Meta activée.
        </p>
      </div>
    </body>
    </html>
  `, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

export async function onRequestPost(context: any) {
  try {
    const payload = await context.request.json();
    console.log("📥 Instagram Event received via Cloudflare Pages Function:", JSON.stringify(payload));
  } catch (err) {
    console.warn("Could not parse POST json:", err);
  }

  // Always respond immediately with 200 to Meta
  return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
    }
  });
}
