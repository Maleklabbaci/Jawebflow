/**
 * JAWEBFLOW — « Est-ce que ça marche ? » : le bilan de santé des automatisations.
 *
 *   GET  /api/instagram/diagnostics                → bilan (compte, autorisations, notifications…)
 *   POST /api/instagram/diagnostics {action:"subscribe"} → (ré)abonne le compte aux notifications
 *
 * Chaque point est expliqué en français, avec l'action à faire si ça ne va pas.
 * Les vérifications interrogent VRAIMENT Instagram (pas de faux « tout va bien »).
 */
import { supabaseRequest, supabaseUpsertInstagramIntegration } from '../../_shared/supabase.ts';
import { getSubscribedFields, igRequest, listMedia, subscribeAccount } from '../../_shared/ig-api.ts';
import { getMerchantInstagram, json, requireUser } from '../../_shared/ig-http.ts';

type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown';
export interface Check {
  id: 'account' | 'token' | 'permission' | 'subscription' | 'activity';
  status: CheckStatus;
  title: string;
  detail?: string;
  action?: 'connect' | 'reconnect' | 'repair';
}

type Ctx = { request: Request; env: any };

function jsonResponse(data: unknown, status = 200) {
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestGet(context: Ctx) {
  try {
    console.log("[instagram][diagnostics] GET request started");

    const user = await requireUser(context);
    if (user instanceof Response) {
      console.warn("[instagram][diagnostics] User authentication failed");
      return user;
    }
    
    const env = context.env;
    console.log("[instagram][diagnostics] User verified:", user.uid.slice(0, 8));

    const ig = await getMerchantInstagram(env, user.uid);
    
    if (!ig) {
      console.log("[instagram][diagnostics] No Instagram integration found");
      return jsonResponse({
        connected: false,
        username: '',
        lastCommentAt: null,
        checks: [{
          id: 'account',
          status: 'error',
          title: 'Aucun compte Instagram connecte',
          detail: 'Connecte ton compte dans l\'onglet "Instagram" : c\'est la premiere etape.',
          action: 'connect',
        } satisfies Check],
      });
    }

    console.log("[instagram][diagnostics] Integration found for:", ig.username || ig.igUserId);

    // Run diagnostics in parallel
    const [subs, firstMedia, state] = await Promise.all([
      getSubscribedFields(ig.token, ig.igUserId).catch((err) => {
        console.error("[instagram][diagnostics] getSubscribedFields error:", err?.message);
        return { ok: false, fields: null, error: { kind: 'unknown' as const } };
      }),
      listMedia(ig.token, { limit: 1 }).catch((err) => {
        console.error("[instagram][diagnostics] listMedia error:", err?.message);
        return { ok: false, media: [], next: null, error: { kind: 'unknown' as const } };
      }),
      supabaseRequest(env, `ig_automation_state?user_id=eq.${encodeURIComponent(user.uid)}&select=last_comment_at`)
        .then(async (r) => (r.ok ? (((await r.json().catch(() => [])) as any[])[0] || null) : null))
        .catch((err) => {
          console.error("[instagram][diagnostics] state query error:", err?.message);
          return null;
        }),
    ]);

    console.log("[instagram][diagnostics] Diagnostics fetched:", {
      hasSubs: !!subs?.ok,
      hasMedia: !!firstMedia?.ok,
      hasState: !!state,
    });

    const tokenExpired = subs?.error?.kind === 'token' || firstMedia?.error?.kind === 'token';
    console.log("[instagram][diagnostics] Token expired:", tokenExpired);

    // Check comment permission
    let permission: 'ok' | 'missing' | 'unknown' = 'unknown';
    
    if (!tokenExpired && firstMedia?.ok && firstMedia.media?.[0]) {
      try {
        console.log("[instagram][diagnostics] Testing comment permission...");
        const probe = await igRequest(ig.token, 'GET', `/${encodeURIComponent(firstMedia.media[0].id)}/comments`, { query: { limit: 1 }, retry: false });
        permission = probe.ok ? 'ok' : probe.error?.kind === 'permission' ? 'missing' : 'unknown';
        console.log("[instagram][diagnostics] Permission test result:", permission);
      } catch (err: any) {
        console.error("[instagram][diagnostics] Permission test error:", err?.message);
      }
    } else {
      console.log("[instagram][diagnostics] Skipping permission test (token expired or no media)");
    }

    const checks: Check[] = [];

    // Check 1: Account
    checks.push(
      tokenExpired
        ? {
            id: 'token',
            status: 'error',
            title: 'La connexion Instagram a expire',
            detail: 'Reconnecte ton compte pour que le robot puisse repondre.',
            action: 'reconnect',
          }
        : {
            id: 'account',
            status: 'ok',
            title: 'Compte Instagram connecte',
            detail: ig.username ? `@${ig.username}` : undefined,
          },
    );

    // Check 2: Permissions
    if (permission === 'ok') {
      checks.push({
        id: 'permission',
        status: 'ok',
        title: 'Autorisation "commentaires" accordee',
      });
    } else if (permission === 'missing') {
      checks.push({
        id: 'permission',
        status: 'error',
        title: 'Il manque l\'autorisation "gerer les commentaires"',
        detail: 'Reconnecte ton compte Instagram et accepte toutes les autorisations demandees.',
        action: 'reconnect',
      });
    } else {
      checks.push({
        id: 'permission',
        status: 'unknown',
        title: 'Autorisation "commentaires" : pas encore verifiable',
        detail:
          firstMedia?.ok && !firstMedia.media?.length
            ? 'Publie un premier post : je pourrai alors verifier l\'autorisation.'
            : tokenExpired
              ? undefined
              : 'Instagram n\'a pas permis de la verifier maintenant. Clique sur "Verifier" dans un instant.',
      });
    }

    // Check 3: Subscriptions
    if (!subs?.ok) {
      checks.push({
        id: 'subscription',
        status: tokenExpired ? 'unknown' : 'warn',
        title: 'Notifications Instagram : pas verifiables',
        detail: tokenExpired ? undefined : 'Clique sur "Reparer" pour relancer l\'abonnement.',
        action: tokenExpired ? undefined : 'repair',
      });
    } else {
      const fields = subs.fields || [];
      const missing = ['messages', 'comments'].filter((f) => !fields.includes(f));
      
      if (!missing.length) {
        checks.push({
          id: 'subscription',
          status: fields.includes('messaging_postbacks') ? 'ok' : 'warn',
          title: fields.includes('messaging_postbacks')
            ? 'Instagram envoie bien les commentaires et les messages'
            : 'Commentaires et messages OK -- boutons a activer',
          detail: fields.includes('messaging_postbacks')
            ? undefined
            : 'Sans cela, l\'option "Suis mon compte avant de recevoir le message" ne peut pas fonctionner. Clique sur "Reparer".',
          action: fields.includes('messaging_postbacks') ? undefined : 'repair',
        });
      } else {
        checks.push({
          id: 'subscription',
          status: 'warn',
          title: missing.includes('comments')
            ? 'Instagram n\'envoie pas encore les commentaires'
            : 'Instagram n\'envoie pas les messages prives',
          detail: 'Clique sur "Reparer" pour relancer l\'abonnement.',
          action: 'repair',
        });
      }
    }

    // Check 4: Activity
    const lastCommentAt: string | null = state?.last_comment_at || null;
    checks.push(
      lastCommentAt
        ? {
            id: 'activity',
            status: 'ok',
            title: 'Instagram nous a deja envoye des commentaires',
          }
        : {
            id: 'activity',
            status: 'unknown',
            title: 'Aucun commentaire recu pour le moment',
            detail: 'Normal si tu viens de commencer. Pour tester en vrai : commente une de tes publications depuis un AUTRE compte Instagram.',
          },
    );

    console.log("[instagram][diagnostics] GET response prepared with", checks.length, "checks");

    return jsonResponse({
      connected: true,
      username: ig.username,
      permission,
      subscribedFields: subs?.ok ? subs.fields : null,
      lastCommentAt,
      checks,
    });

  } catch (error: any) {
    console.error("[instagram][diagnostics] GET fatal error:", error?.message);
    return jsonResponse({
      error: error?.message || "Erreur interne lors de la diagnostic.",
      step: "unknown"
    }, 500);
  }
}

export async function onRequestPost(context: Ctx) {
  try {
    console.log("[instagram][diagnostics] POST request started");

    const user = await requireUser(context);
    if (user instanceof Response) {
      console.warn("[instagram][diagnostics] User authentication failed");
      return user;
    }

    const env = context.env;
    const body = await context.request.json().catch(() => ({} as any));

    console.log("[instagram][diagnostics] POST body action:", body?.action);

    if (body?.action !== 'subscribe') {
      return jsonResponse({ error: 'Action inconnue.' }, 400);
    }

    const ig = await getMerchantInstagram(env, user.uid);
    if (!ig) {
      console.error("[instagram][diagnostics] No Instagram integration found");
      return jsonResponse({
        success: false,
        error: 'Connecte d\'abord ton compte Instagram.',
      }, 409);
    }

    console.log("[instagram][diagnostics] Attempting subscription...");

    const result = await subscribeAccount(ig.token, ig.igUserId);

    console.log("[instagram][diagnostics] Subscription result:", {
      success: result.success,
      fields: result.fields,
      error: result.error?.message,
    });

    // Update webhook status in database
    try {
      await supabaseUpsertInstagramIntegration(env, user.uid, {
        webhookStatus: result.success ? 'active' : 'error',
      });
      console.log("[instagram][diagnostics] Webhook status updated");
    } catch (err: any) {
      console.warn("[instagram][diagnostics] Failed to update webhook status:", err?.message);
    }

    if (!result.success) {
      console.error("[instagram][diagnostics] Subscription failed");
      return jsonResponse(
        {
          success: false,
          error: result.error?.kind === 'token' ? result.error.message : result.error?.raw || result.error?.message || 'Instagram a refusé l\'abonnement.',
          detail: result.error?.message,
          code: result.error?.code,
          hint: 'Vérifie dans Meta Developers que les champs messages et messaging_postbacks sont activés pour Instagram Webhooks et que l’application est en mode Live avec les permissions avancées.',
        },
        502
      );
    }

    const missing = ['comments', 'messaging_postbacks'].filter((f) => !result.fields.includes(f));

    console.log("[instagram][diagnostics] Subscription successful, missing fields:", missing);

    return jsonResponse({
      success: true,
      fields: result.fields,
      missing,
      message: missing.length
        ? 'Les messages prives sont bien relies, mais Instagram n\'a pas accepte tous les types de notifications (' +
            missing.join(', ') +
            '). Verifie que l\'application Meta les autorise (voir le guide).'
        : 'Parfait : Instagram enverra désormais les commentaires, les messages et les clics sur les boutons.',
    });

  } catch (error: any) {
    console.error("[instagram][diagnostics] POST fatal error:", error?.message);
    return jsonResponse({
      success: false,
      error: error?.message || "Erreur interne lors de la reparation.",
      step: "unknown"
    }, 500);
  }
}

export default { onRequestPost, onRequestGet, onRequestOptions };
