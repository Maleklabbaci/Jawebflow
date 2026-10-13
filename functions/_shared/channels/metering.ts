/**
 * JAWEBFLOW — COMPTEUR DE MESSAGES WHATSAPP (refacturation)
 * ============================================================================
 * Décision commerciale (voir docs/DECISION_WHATSAPP_PLANS.md) :
 *
 *   Découverte  : 0        Basic : 0 (WhatsApp non inclus)
 *   Pro         : 1 000 messages/mois inclus
 *   Enterprise  : 5 000 messages/mois inclus
 *   Au-delà     : recharge prépayée
 *
 * POURQUOI CE MODULE EXISTE : depuis le 01/10/2026, Meta facture chaque message
 * de service au-delà de 1 000 gratuits par numéro et par mois (0,0046 $ en
 * Algérie, marché « Rest of Africa »). Les messages MARKETING (3,50 DA) n'ont
 * AUCUNE franchise. Sans ce compteur, JawebFlow paierait ces frais sans pouvoir
 * les refacturer — et ne pourrait pas couper proprement.
 *
 * SOURCE DE VÉRITÉ : Meta renvoie dans chaque accusé de livraison un objet
 * `pricing` (voir `whatsapp.ts`) :
 *     { "billable": true,  "category": "service" }   → facturé
 *     { "billable": false, "type": "free_customer_service" } → offre gratuite
 * On enregistre `billable` tel quel : la refacturation est la COPIE EXACTE de
 * ce que Meta facture, sans estimation.
 */

import { supabaseRequest, supabaseConfigured, type SupabaseEnv } from '../supabase.ts';
import { monthStartIso } from '../limits.ts';

/** Messages WhatsApp inclus par plan et par mois. */
export const WHATSAPP_MESSAGES_PER_PLAN: Record<string, number> = {
  free: 0,
  basic: 0, // WhatsApp n'est pas inclus dans Basic (décision commerciale)
  pro: 1000,
  enterprise: 5000,
};

/** Ce que le client voit quand son forfait WhatsApp est épuisé. */
export const WA_QUOTA_REACHED_MSG =
  "Merci pour votre message ! 🙏 Le forfait WhatsApp de cette entreprise est utilisé pour ce mois-ci. " +
  "Vous pouvez aussi nous écrire depuis le site web — nous vous répondons avec plaisir. " +
  "Le forfait se recharge automatiquement le 1ᵉʳ du mois.";

/** Forfait mensuel d'un plan (0 si le canal n'est pas inclus). */
export function waQuotaForPlan(plan: string): number {
  const key = String(plan || '').toLowerCase();
  return key in WHATSAPP_MESSAGES_PER_PLAN ? WHATSAPP_MESSAGES_PER_PLAN[key] : 0;
}

/** Le forfait est-il encore disponible ? (fonction pure) */
export function waQuotaAvailable(plan: string, used: number, purchased = 0): boolean {
  return used < waQuotaForPlan(plan) + Math.max(0, purchased);
}

/** Message d'alerte affiché au marchand à 80 % du forfait (fonction pure). */
export function waQuotaWarning(plan: string, used: number): string | null {
  const quota = waQuotaForPlan(plan);
  if (quota <= 0) return null;
  const ratio = used / quota;
  if (ratio >= 1) return 'Forfait WhatsApp épuisé : les réponses WhatsApp sont en pause jusqu\u2019au 1ᵉʳ du mois.';
  if (ratio >= 0.8) return `Forfait WhatsApp à ${Math.round(ratio * 100)} % (${used}/${quota} messages).`;
  return null;
}

export interface WaUsage {
  /** Messages déjà facturés par Meta ce mois-ci. */
  billable: number;
  /** Messages restés dans l'offre gratuite de Meta. */
  free: number;
  quota: number;
  /** Crédits prépayés achetés (recharges). */
  purchased: number;
  remaining: number;
}

/**
 * Consommation WhatsApp du mois pour un assistant.
 * Lecture fail-open (0) : un pépin de base ne doit jamais bloquer un client —
 * c'est la même règle que `supabaseCountMonthlyConversations`.
 */
export async function whatsappUsage(env: SupabaseEnv, assistantId: string): Promise<WaUsage> {
  const empty: WaUsage = { billable: 0, free: 0, quota: 0, purchased: 0, remaining: 0 };
  if (!supabaseConfigured(env) || !assistantId) return empty;
  try {
    const res = await supabaseRequest(
      env,
      `channel_messages?assistant_id=eq.${encodeURIComponent(assistantId)}&channel=eq.whatsapp` +
        `&created_at=gte.${encodeURIComponent(monthStartIso())}&direction=eq.out&select=billable`,
    );
    if (!res.ok) return empty;
    const rows = (await res.json().catch(() => [])) as any[];
    const list = Array.isArray(rows) ? rows : [];
    const billable = list.filter((r) => r?.billable === true).length;
    const free = list.length - billable;

    // Forfait du plan + recharges prépayées.
    // ⚠️ Le plan vit dans la colonne jsonb `config.plan` (voir updateAssistantPlan
    // côté client) — PAS dans une colonne `plan`. Le lire au mauvais endroit
    // donnait un forfait de 0 à tout le monde : plus aucune réponse WhatsApp.
    const asst = await supabaseRequest(env, `assistants?id=eq.${encodeURIComponent(assistantId)}&select=*`);
    const asstRow = asst.ok ? ((await asst.json().catch(() => [])) as any[])?.[0] : null;
    const plan = String(asstRow?.config?.plan || asstRow?.plan || 'basic');
    const quota = waQuotaForPlan(plan);

    const credit = await supabaseRequest(
      env,
      `channel_credits?assistant_id=eq.${encodeURIComponent(assistantId)}&channel=eq.whatsapp&select=quantity`,
    );
    const purchased = credit.ok
      ? ((await credit.json().catch(() => [])) as any[]).reduce((t, r) => t + Number(r?.quantity || 0), 0)
      : 0;

    const remaining = Math.max(0, quota + purchased - billable);
    return { billable, free, quota, purchased, remaining };
  } catch {
    return empty;
  }
}

/**
 * Ce message entrant a-t-il DÉJÀ été traité ?
 *
 * Les plateformes réémettent leurs webhooks (Meta jusqu'à plusieurs fois). Sans
 * ce garde-fou, un renvoi ferait répondre l'IA une seconde fois — donc payer
 * deux fois — et enverrait un doublon au client.
 *
 * La clé est (canal, CONTACT, message) : chez Telegram, `message_id` ne vaut 1
 * que DANS une conversation, deux clients différents peuvent donc avoir le
 * même identifiant.
 *
 * Lecture « fail-open » : si la table n'existe pas encore, on répond quand
 * même (mieux vaut une réponse en double qu'un client sans réponse).
 */
export async function alreadyHandledInbound(
  env: SupabaseEnv,
  assistantId: string,
  channel: string,
  contactId: string,
  messageId: string,
): Promise<boolean> {
  if (!supabaseConfigured(env) || !assistantId || !messageId || !contactId) return false;
  try {
    const res = await supabaseRequest(
      env,
      `channel_messages?assistant_id=eq.${encodeURIComponent(assistantId)}` +
        `&channel=eq.${encodeURIComponent(channel)}` +
        `&contact_id=eq.${encodeURIComponent(contactId)}` +
        `&message_id=eq.${encodeURIComponent(messageId)}&direction=eq.in&select=id&limit=1`,
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => [])) as any[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Enregistre un accusé de livraison (facturation) dans `channel_messages`.
 * Appelé en arrière-plan après avoir répondu à Meta.
 */
export async function logChannelMessage(
  env: SupabaseEnv,
  entry: {
    assistantId: string;
    /** Propriétaire de l'assistant (lu dans `channel_integrations`). */
    userId?: string;
    channel: string;
    direction: 'in' | 'out';
    messageId?: string;
    contactId?: string;
    billable?: boolean;
    category?: string;
    fromAd?: boolean;
  },
): Promise<void> {
  if (!supabaseConfigured(env) || !entry.assistantId) return;
  try {
    await supabaseRequest(env, 'channel_messages', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        assistant_id: entry.assistantId,
        ...(entry.userId ? { user_id: entry.userId } : {}),
        channel: entry.channel,
        direction: entry.direction,
        message_id: entry.messageId || null,
        contact_id: entry.contactId || null,
        billable: entry.billable === true,
        category: entry.category || null,
        from_ad: entry.fromAd === true,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('[metering] enregistrement échoué:', (e as Error)?.message || e);
  }
}
