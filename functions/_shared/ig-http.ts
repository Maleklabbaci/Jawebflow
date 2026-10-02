/**
 * JAWEBFLOW — Petits outils communs aux points d'entrée « automatisations ».
 * Tout est réservé au marchand connecté (jeton Supabase dans « Authorization »).
 */
import { supabaseGetInstagramIntegration, verifySupabaseIdToken } from './supabase.ts';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Renvoie le marchand connecté, ou une réponse 401 toute prête. */
export async function requireUser(context: { request: Request; env: any }): Promise<{ uid: string; email?: string } | Response> {
  try {
    const user = await verifySupabaseIdToken(context.env || {}, context.request.headers.get('Authorization'));
    if (!user) return json({ error: 'Connecte-toi pour continuer.' }, 401);
    return user;
  } catch (e: any) {
    return json({ error: e?.message || 'Authentification impossible.' }, 500);
  }
}

export interface MerchantInstagram {
  token: string;
  igUserId: string;
  username: string;
  assistantId?: string;
}

/** Le compte Instagram connecté du marchand (jeton lu côté serveur, jamais renvoyé au navigateur). */
export async function getMerchantInstagram(env: any, uid: string): Promise<MerchantInstagram | null> {
  const integ: any = await supabaseGetInstagramIntegration(env, uid);
  if (!integ || integ.connected === false || !integ.accessToken) return null;
  return {
    token: String(integ.accessToken),
    igUserId: String(integ.instagramUserId || ''),
    username: String(integ.instagramUsername || '').replace(/^@/, ''),
    assistantId: integ.assistantId ? String(integ.assistantId) : undefined,
  };
}

/** La table n'existe pas encore (migration SQL pas encore exécutée) ? */
export function isMissingTable(status: number, bodyText: string): boolean {
  return status === 404 || /PGRST20[45]|relation .* does not exist|schema cache|Could not find the table/i.test(bodyText || '');
}
