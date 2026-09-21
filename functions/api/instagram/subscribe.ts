// Abonne le compte Instagram Business connecté aux événements webhook "messages".
// Sans cet appel, Meta ne délivre JAMAIS les messages entrants au callback,
// même si l'URL du webhook est vérifiée et que le token est valide.
// Doc Meta : POST https://graph.instagram.com/{version}/me/subscribed_apps?subscribed_fields=messages

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

export async function subscribeToInstagramMessages(accessToken: string) {
  const url = `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: "POST" });
  const data = await res.json().catch(() => ({} as any)) as any;

  const success = res.ok && data?.success === true;
  return { success, status: res.status, data };
}

export async function onRequestPost(context: { request: Request }) {
  try {
    const body = await context.request.json().catch(() => ({})) as { accessToken?: string };
    const accessToken = String(body.accessToken || "").trim();

    if (!accessToken) {
      return json({ success: false, error: "accessToken manquant." }, 400);
    }

    const result = await subscribeToInstagramMessages(accessToken);

    if (!result.success) {
      return json({
        success: false,
        error: result.data?.error?.message || `Meta a refusé l'abonnement au webhook (HTTP ${result.status}).`,
        details: result.data
      }, 400);
    }

    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: error?.message || "Erreur interne pendant l'abonnement au webhook." }, 500);
  }
}

export default { onRequestPost, onRequestOptions };
