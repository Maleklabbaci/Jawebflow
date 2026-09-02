// Cloudflare Pages Function pour valider Meta / Instagram Webhook

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const token = url.searchParams.get("hub.verify_token") || url.searchParams.get("verify_token");
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge");

  // Si Meta envoie son challenge de vérification
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  // Si on visite la page dans le navigateur
  return new Response(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><title>JawebFlow Webhook OK</title></head>
    <body style="background:#090d16;color:#34d399;font-family:sans-serif;padding:40px;text-align:center;">
      <h2>● Webhook Instagram JawebFlow Actif sur Cloudflare Edge</h2>
      <p style="color:#94a3b8">Prêt pour la validation de Meta for Developers</p>
    </body>
    </html>
  `, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

export async function onRequestPost(context: any) {
  // Réponse immédiate 200 à Meta pour les événements reçus
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
