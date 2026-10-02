/**
 * Client des points d'entrée « automatisations Instagram ».
 * Chaque appel envoie le jeton de connexion du marchand ; les erreurs arrivent
 * déjà en français (écrites côté serveur), prêtes à être affichées.
 */
import type { Automation, AutomationInput } from '../../functions/_shared/ig-automation-core';
import { ApiError, apiRequest as request } from './api-client';

export { ApiError };

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
