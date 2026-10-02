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
  /** Bouton proposé à côté du point : reconnecter, réparer les notifications, ou aller connecter le compte. */
  action?: 'connect' | 'reconnect' | 'repair';
}

type Ctx = { request: Request; env: any };

export async function onRequestGet(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const env = context.env;

  const ig = await getMerchantInstagram(env, user.uid);
  if (!ig) {
    return json({
      connected: false,
      username: '',
      lastCommentAt: null,
      checks: [{
        id: 'account', status: 'error', title: 'Aucun compte Instagram connecté',
        detail: 'Connecte ton compte dans l’onglet « Instagram » : c’est la première étape.', action: 'connect',
      }] satisfies Check[],
    });
  }

  const [subs, firstMedia, state] = await Promise.all([
    getSubscribedFields(ig.token),
    listMedia(ig.token, { limit: 1 }),
    supabaseRequest(env, `ig_automation_state?user_id=eq.${encodeURIComponent(user.uid)}&select=last_comment_at`)
      .then(async (r) => (r.ok ? (((await r.json().catch(() => [])) as any[])[0] || null) : null))
      .catch(() => null),
  ]);

  const tokenExpired = subs.error?.kind === 'token' || firstMedia.error?.kind === 'token';

  // Autorisation « gérer les commentaires » : on essaie VRAIMENT de lire les commentaires d'une publication.
  let permission: 'ok' | 'missing' | 'unknown' = 'unknown';
  if (!tokenExpired && firstMedia.ok && firstMedia.media[0]) {
    const probe = await igRequest(ig.token, 'GET', `/${encodeURIComponent(firstMedia.media[0].id)}/comments`, { query: { limit: 1 }, retry: false });
    permission = probe.ok ? 'ok' : probe.error?.kind === 'permission' ? 'missing' : 'unknown';
  }

  const checks: Check[] = [];

  checks.push(
    tokenExpired
      ? { id: 'token', status: 'error', title: 'La connexion Instagram a expiré', detail: 'Reconnecte ton compte pour que le robot puisse répondre.', action: 'reconnect' }
      : { id: 'account', status: 'ok', title: 'Compte Instagram connecté', detail: ig.username ? `@${ig.username}` : undefined },
  );

  if (permission === 'ok') {
    checks.push({ id: 'permission', status: 'ok', title: 'Autorisation « commentaires » accordée' });
  } else if (permission === 'missing') {
    checks.push({
      id: 'permission', status: 'error', title: 'Il manque l’autorisation « gérer les commentaires »',
      detail: 'Reconnecte ton compte Instagram et accepte toutes les autorisations demandées.', action: 'reconnect',
    });
  } else {
    checks.push({
      id: 'permission', status: 'unknown', title: 'Autorisation « commentaires » : pas encore vérifiable',
      detail: firstMedia.ok && !firstMedia.media.length
        ? 'Publie un premier post : je pourrai alors vérifier l’autorisation.'
        : tokenExpired ? undefined : 'Instagram n’a pas permis de la vérifier maintenant. Clique sur « Vérifier » dans un instant.',
    });
  }

  if (!subs.ok) {
    checks.push({
      id: 'subscription', status: tokenExpired ? 'unknown' : 'warn', title: 'Notifications Instagram : pas vérifiables',
      detail: tokenExpired ? undefined : 'Clique sur « Réparer » pour relancer l’abonnement.', action: tokenExpired ? undefined : 'repair',
    });
  } else {
    const fields = subs.fields || [];
    const missing = ['messages', 'comments'].filter((f) => !fields.includes(f));
    if (!missing.length) {
      checks.push({
        id: 'subscription', status: fields.includes('messaging_postbacks') ? 'ok' : 'warn',
        title: fields.includes('messaging_postbacks') ? 'Instagram envoie bien les commentaires et les messages' : 'Commentaires et messages OK — boutons à activer',
        detail: fields.includes('messaging_postbacks') ? undefined : 'Sans cela, l’option « Suis mon compte avant de recevoir le message » ne peut pas fonctionner. Clique sur « Réparer ».',
        action: fields.includes('messaging_postbacks') ? undefined : 'repair',
      });
    } else {
      checks.push({
        id: 'subscription', status: 'warn',
        title: missing.includes('comments') ? 'Instagram n’envoie pas encore les commentaires' : 'Instagram n’envoie pas les messages privés',
        detail: 'Clique sur « Réparer » pour relancer l’abonnement.', action: 'repair',
      });
    }
  }

  const lastCommentAt: string | null = state?.last_comment_at || null;
  checks.push(
    lastCommentAt
      ? { id: 'activity', status: 'ok', title: 'Instagram nous a déjà envoyé des commentaires' }
      : {
          id: 'activity', status: 'unknown', title: 'Aucun commentaire reçu pour le moment',
          detail: 'Normal si tu viens de commencer. Pour tester en vrai : commente une de tes publications depuis un AUTRE compte Instagram.',
        },
  );

  return json({
    connected: true,
    username: ig.username,
    permission,
    subscribedFields: subs.ok ? subs.fields : null,
    lastCommentAt,
    checks,
  });
}

export async function onRequestPost(context: Ctx) {
  const user = await requireUser(context);
  if (user instanceof Response) return user;
  const env = context.env;
  const body = await context.request.json().catch(() => ({} as any));
  if (body?.action !== 'subscribe') return json({ error: 'Action inconnue.' }, 400);

  const ig = await getMerchantInstagram(env, user.uid);
  if (!ig) return json({ success: false, error: 'Connecte d’abord ton compte Instagram.' }, 409);

  const result = await subscribeAccount(ig.token);
  try {
    await supabaseUpsertInstagramIntegration(env, user.uid, { webhookStatus: result.success ? 'active' : 'error' });
  } catch { /* l'état affiché peut attendre */ }

  if (!result.success) {
    return json({ success: false, error: result.error?.message || 'Instagram a refusé l’abonnement.', detail: result.error?.raw }, 502);
  }
  const missing = ['comments', 'messaging_postbacks'].filter((f) => !result.fields.includes(f));
  return json({
    success: true,
    fields: result.fields,
    missing,
    message: missing.length
      ? 'Les messages privés sont bien reliés, mais Instagram n’a pas accepté tous les types de notifications (' + missing.join(', ') + '). Vérifie que l’application Meta les autorise (voir le guide).'
      : 'Parfait : Instagram enverra désormais les commentaires, les messages et les clics sur les boutons.',
  });
}
