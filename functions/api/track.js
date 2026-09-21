/**
 * JAWEBFLOW — Capture de prospect (appelé par le widget public).
 *
 * ⚠️ CORRECTIF IMPORTANT : cet endpoint écrivait dans Firestore avec
 * `?key=<FIRESTORE_API_KEY>` (requête ANONYME). Les règles de sécurité
 * n'autorisent la création d'un prospect que pour le premier write ; toute
 * mise à jour (téléphone, email, statut ajoutés en cours de conversation)
 * était donc refusée — silencieusement, car la réponse n'était pas contrôlée.
 * Résultat : des prospects sans coordonnées. On écrit désormais en Admin via
 * le compte de service, ce qui est le rôle attendu d'un endpoint serveur.
 */
import { getGoogleAccessToken, firestoreDocumentsBase } from '../_shared/google.ts';

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const data = await context.request.json();
    const env = context.env;

    const assistantId = String(data.assistantId || '').trim();
    const visitorId = String(data.visitorId || '').trim();
    if (!assistantId || !visitorId) {
      return new Response(JSON.stringify({ error: 'assistantId et visitorId sont requis' }), { status: 400, headers: cors });
    }
    if (!env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('[track] FIREBASE_SERVICE_ACCOUNT manquant : prospection non enregistrée.');
      return new Response(JSON.stringify({ error: 'Service de prospection non configuré' }), { status: 503, headers: cors });
    }

    const truncate = (value, max = 300) => String(value).slice(0, max);
    const docId = `${assistantId}_${visitorId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);

    const fields = {
      assistantId: { stringValue: truncate(assistantId, 200) },
      visitorId: { stringValue: truncate(visitorId, 200) },
      status: { stringValue: truncate(data.status || 'nouveau', 50) },
      currentPage: { stringValue: truncate(data.currentPage || '') },
      updatedAt: { stringValue: new Date().toISOString() },
    };
    if (data.phone) fields.phone = { stringValue: truncate(data.phone, 40) };
    if (data.email) fields.email = { stringValue: truncate(data.email, 200) };
    if (data.need) fields.need = { stringValue: truncate(data.need, 2000) };

    const { accessToken } = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
    const res = await fetch(`${firestoreDocumentsBase(env)}/prospects/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[track] écriture Firestore refusée (${res.status})`, body.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Enregistrement du prospect impossible' }), { status: 502, headers: cors });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (err) {
    console.error('[track] erreur', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
