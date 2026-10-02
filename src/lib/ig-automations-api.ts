/**
 * Client des points d'entrée « automatisations Instagram ».
 * Chaque appel envoie le jeton de connexion du marchand ; les erreurs arrivent
 * déjà en français (écrites côté serveur), prêtes à être affichées.
 */
import { supabase } from './supabase';
import type { Automation, AutomationInput } from '../../functions/_shared/ig-automation-core';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
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

export interface AutomationEvent {
  id: string;
  automationId: string | null;
  automationName: string;
  triggerType: string;
  username: string;
  inputText: string;
  publicReplyText: string;
  publicReplyStatus: 'sent' | 'failed' | 'skipped' | null;
  dmText: string;
  dmStatus: 'sent' | 'failed' | 'skipped' | 'awaiting_follow' | null;
  gateState: 'awaiting' | 'released' | 'releasing' | null;
  outcome: 'processing' | 'done' | 'partial' | 'failed' | 'skipped';
  error: string;
  note: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  caption: string;
  type: string;
  thumbnail: string;
  permalink: string;
  timestamp: string;
  comments: number;
}

export interface DiagnosticCheck {
  id: 'account' | 'token' | 'permission' | 'subscription' | 'activity';
  status: 'ok' | 'warn' | 'error' | 'unknown';
  title: string;
  detail?: string;
  action?: 'connect' | 'reconnect' | 'repair';
}

export interface Diagnostics {
  connected: boolean;
  username: string;
  lastCommentAt: string | null;
  permission?: 'ok' | 'missing' | 'unknown';
  subscribedFields?: string[] | null;
  checks: DiagnosticCheck[];
}

const BASE = '/api/instagram';

export const igApi = {
  list: () => request<{ setupRequired: boolean; automations: Automation[] }>(`${BASE}/automations`),
  events: (automationId?: string, limit = 60) =>
    request<{ setupRequired?: boolean; events: AutomationEvent[] }>(
      `${BASE}/automations?view=events&limit=${limit}${automationId ? `&automationId=${encodeURIComponent(automationId)}` : ''}`,
    ),
  create: (automation: AutomationInput) =>
    request<{ automation: Automation }>(`${BASE}/automations`, { method: 'POST', body: JSON.stringify({ automation }) }),
  update: (id: string, automation: AutomationInput) =>
    request<{ automation: Automation }>(`${BASE}/automations`, { method: 'PATCH', body: JSON.stringify({ id, automation }) }),
  setEnabled: (id: string, enabled: boolean) =>
    request<{ automation: Automation }>(`${BASE}/automations`, { method: 'PATCH', body: JSON.stringify({ id, enabled }) }),
  duplicate: (id: string) =>
    request<{ automation: Automation }>(`${BASE}/automations`, { method: 'POST', body: JSON.stringify({ duplicateOf: id }) }),
  remove: (id: string) => request<{ ok: boolean }>(`${BASE}/automations?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  media: (after?: string) =>
    request<{ media: MediaItem[]; next: string | null }>(`${BASE}/media${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  diagnostics: () => request<Diagnostics>(`${BASE}/diagnostics`),
  repairSubscription: () =>
    request<{ success: boolean; fields: string[]; missing: string[]; message: string }>(`${BASE}/diagnostics`, {
      method: 'POST',
      body: JSON.stringify({ action: 'subscribe' }),
    }),
};
