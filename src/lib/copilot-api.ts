/**
 * Client du chat « Parler à mon IA » (POST /api/copilot).
 */
import type { CopilotAction, CopilotMessage, CopilotOp, CopilotStatePatch } from '../../functions/_shared/copilot-core';
import { ApiError, apiRequest } from './api-client';

export { ApiError };
export type { CopilotAction, CopilotMessage, CopilotOp, CopilotStatePatch };

export interface CopilotReply {
  reply: string;
  actions: CopilotAction[];
  state: CopilotStatePatch;
}

export interface CopilotOpResult {
  ok: boolean;
  message: string;
  state: CopilotStatePatch;
}

export const copilotApi = {
  /** Envoie la conversation (les derniers messages) et reçoit la réponse + ce que l'IA a fait. */
  ask: (assistantId: string, messages: CopilotMessage[]) =>
    apiRequest<CopilotReply>('/api/copilot', { method: 'POST', body: JSON.stringify({ assistantId, messages }) }, { timeoutMs: 60000 }),

  /** Annuler une action / activer une automatisation (sans IA). */
  run: (assistantId: string, op: CopilotOp) =>
    apiRequest<CopilotOpResult>('/api/copilot', { method: 'POST', body: JSON.stringify({ assistantId, op }) }, { timeoutMs: 30000 }),
};
