/**
 * Appels vers nos propres points d'entrée (/api/…) avec le jeton de connexion du marchand.
 * Les erreurs arrivent déjà en français (écrites côté serveur), prêtes à être affichées.
 */
import { supabase } from './supabase';

export class ApiError extends Error {
  status: number;
  details: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, opts: { timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      ...(opts.timeoutMs && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
      headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new ApiError('Ça prend plus de temps que prévu. Réessaie dans un instant.', 0);
    }
    throw new ApiError('Pas de connexion internet : vérifie ton réseau puis réessaie.', 0);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  if (!res.ok) {
    const fallback =
      res.status === 401 ? 'Ta session a expiré : reconnecte-toi puis réessaie.'
      : res.status === 404 ? 'Cette fonction n’est pas encore disponible sur le serveur (mise en ligne en cours ?).'
      : 'Une erreur est survenue. Réessaie dans un instant.';
    throw new ApiError(data?.error || fallback, res.status, data);
  }
  return data as T;
}
