/**
 * JAWEBFLOW — CONNEXIONS DES CANAUX (tableau de bord)
 * ============================================================================
 * GET    /api/channels/integrations              → ce qui est connecté + la jauge WhatsApp
 * POST   /api/channels/integrations              → connecter (le jeton est TESTÉ avant d'être gardé)
 * DELETE /api/channels/integrations?channel=…    → déconnecter
 *
 * Trois garanties :
 *   1. **Le jeton ne sort jamais.** Il est testé côté serveur, rangé en base, et
 *      le client ne reçoit qu'un `hasToken: true/false`.
 *   2. **On ne prend pas le canal d'un autre.** Si le compte (page, numéro) est
 *      déjà relié à un autre marchand, on refuse au lieu d'écraser.
 *   3. **On teste avant d'enregistrer.** Un mauvais jeton est refusé tout de
 *      suite, avec la raison exacte — pas trois jours plus tard en silence.
 */

import { verifySupabaseIdToken } from '../../_shared/supabase.ts';
import {
  supabaseGetAssistant,
  supabaseGetChannelSecret,
  supabaseFindChannelIntegration,
  supabaseListChannelIntegrations,
  supabaseSetChannelConnected,
  supabaseUpsertChannelIntegration,
} from '../../_shared/supabase.ts';
import { verifyChannelCredentials, webhookUrl } from '../../_shared/channels/credentials.ts';
import { whatsappUsage } from '../../_shared/channels/metering.ts';
import { channelLabel, getChannel } from '../../_shared/channels/registry.ts';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Ce que le marchand doit coller à côté de chaque canal (affiché tel quel). */
const CHANNEL_GUIDE: Record<string, { what: string; accountLabel: string; tokenLabel: string; cost: string; paid: boolean }> = {
  messenger: {
    what: 'Votre page Facebook. Les personnes qui vous écrivent sur Messenger et Facebook reçoivent la réponse de votre assistant.',
    accountLabel: 'Identifiant de la page',
    tokenLabel: 'Jeton de la page (commence par EAA…)',
    cost: 'Gratuit — Meta ne facture rien sur Messenger.',
    paid: false,
  },
  whatsapp: {
    what: 'Votre numéro WhatsApp Business. Le seul canal dont les réponses sont payantes chez Meta, donc comptées dans votre forfait.',
    accountLabel: 'Identifiant du numéro (Phone number ID)',
    tokenLabel: 'Jeton d’accès WhatsApp (commence par EAA…)',
    cost: 'Payant — 1 000 réponses incluses (Pro), 5 000 (Enterprise), puis recharge.',
    paid: true,
  },
  telegram: {
    what: 'Un bot Telegram pour tester votre assistant immédiatement, sans aucune validation à attendre.',
    accountLabel: 'Clé de liaison (inventez-la : elle va dans l’adresse du webhook)',
    tokenLabel: 'Jeton du bot (donné par @BotFather)',
    cost: 'Gratuit, sans limite.',
    paid: false,
  },
  tiktok: {
    what: 'Votre compte TikTok Business. Disponible une fois l’accès « Business Messaging » accordé par TikTok.',
    accountLabel: 'Clé de liaison (elle va dans l’adresse du webhook)',
    tokenLabel: 'Jeton d’accès TikTok',
    cost: 'Gratuit.',
    paid: false,
  },
};

const ORDER = ['messenger', 'whatsapp', 'telegram', 'tiktok'];

export async function onRequestGet(context: any) {
  const env = context.env;
  try {
    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) return json({ error: 'Authentification requise' }, 401);

    // L'assistant du marchand (le premier) : c'est lui qui répond sur les canaux.
    const url = new URL(context.request.url);
    const assistantId = url.searchParams.get('assistantId') || '';
    const assistant = assistantId ? await supabaseGetAssistant(env, assistantId) : null;
    const plan = String(assistant?.data?.config?.plan || assistant?.data?.plan || 'basic').toLowerCase();

    const list = await supabaseListChannelIntegrations(env, caller.uid);

    // La jauge WhatsApp : messages déjà facturés ce mois-ci / forfait du plan.
    const wa = assistantId ? await whatsappUsage(env, assistantId) : null;

    return json({
      setupRequired: list.setupRequired,
      integrations: list.integrations,
      whatsapp: wa,
      plan,
      channels: ORDER.filter((id) => getChannel(id)).map((id) => ({
        id,
        label: channelLabel(id),
        ...CHANNEL_GUIDE[id],
        webhookUrl: webhookUrl(id),
        // Telegram et TikTok se routent par une clé dans l'URL : le marchand la
        // choisit, donc l'URL définitive dépend de ce qu'il va saisir.
        keyedWebhook: id === 'telegram' || id === 'tiktok',
      })),
    });
  } catch (e) {
    console.error('[channels/integrations] GET', e);
    return json({ error: (e as Error)?.message || 'Erreur serveur' }, 500);
  }
}

export async function onRequestPost(context: any) {
  const env = context.env;
  try {
    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) return json({ error: 'Authentification requise' }, 401);

    const body = await context.request.json().catch(() => ({}));
    const channel = String(body.channel || '').toLowerCase();
    let accountId = String(body.accountId || '').trim();
    let token = String(body.token || '').trim();
    const displayName = body.displayName !== undefined ? String(body.displayName).trim() : undefined;
    const phoneNumber = body.phoneNumber !== undefined ? String(body.phoneNumber).trim() : undefined;
    const assistantId = String(body.assistantId || '').trim();
    // « Tester sans enregistrer » : utilisé par le bouton de vérification.
    const dryRun = body.dryRun === true;

    if (!getChannel(channel)) return json({ error: `Canal inconnu : ${channel || '(vide)'}` }, 400);

    // « Vérifier à nouveau » : le navigateur n'a jamais reçu le jeton (il ne
    // s'affiche pas). Sans identifiants fournis, on teste donc ceux que le
    // serveur a rangés, et on ne réécrit rien.
    let reusingStored = false;
    if (!token && !accountId) {
      const stored = await supabaseGetChannelSecret(env, caller.uid, channel);
      if (!stored?.accessToken) {
        return json({ error: 'Aucune connexion enregistrée pour ce canal : collez le jeton pour le brancher.' }, 400);
      }
      accountId = stored.accountId;
      token = stored.accessToken;
      reusingStored = true;
    }
    if (!reusingStored && !accountId) return json({ error: 'Identifiant du compte manquant' }, 400);
    // Telegram et TikTok n'ont pas d'identifiant fourni par la plateforme : la
    // clé sert aussi de secret de routing, on impose donc une longueur utile.
    if ((channel === 'telegram' || channel === 'tiktok') && accountId.length < 12) {
      return json({ error: 'Choisissez une clé de liaison d’au moins 12 caractères (elle protège vos messages).' }, 400);
    }
    if (!token && !dryRun) return json({ error: 'Jeton manquant' }, 400);

    // Test réel auprès de la plateforme AVANT d'enregistrer quoi que ce soit.
    const check = await verifyChannelCredentials(channel, { accountId, token }, env);
    if (!check.ok) return json({ error: check.message, verified: check.verified }, 400);
    // Re-vérification d'une connexion existante : on répond sans rien réécrire.
    if (dryRun || reusingStored) {
      return json({ ok: true, message: check.message, verified: check.verified, accountName: check.accountName, reused: reusingStored });
    }

    if (!assistantId) return json({ error: 'Assistant introuvable' }, 400);

    // Un compte ne peut appartenir qu'à un seul marchand.
    const existing = await supabaseFindChannelIntegration(env, channel, accountId);
    if (existing && existing.userId && existing.userId !== caller.uid) {
      return json(
        { error: `Ce compte est déjà relié à un autre compte JawebFlow (${channelLabel(channel)}). Contactez-nous si c’est une erreur.` },
        409
      );
    }

    const assistant = await supabaseGetAssistant(env, assistantId);
    if (!assistant?.data) return json({ error: 'Assistant introuvable' }, 404);
    // Contrôle d'appartenance : un marchand ne branche pas un canal sur
    // l'assistant de quelqu'un d'autre.
    if (String(assistant.data.user_id || '') !== caller.uid) {
      return json({ error: 'Cet assistant ne vous appartient pas' }, 403);
    }

    const saved = await supabaseUpsertChannelIntegration(env, caller.uid, {
      channel,
      accountId,
      assistantId,
      accessToken: token,
      displayName: displayName || check.accountName,
      phoneNumber,
    });
    if (!saved.ok) return json({ error: saved.error || 'Enregistrement impossible' }, 400);

    return json({
      ok: true,
      message: check.message,
      verified: check.verified,
      integration: saved.integration,
      webhookUrl: webhookUrl(channel, accountId),
    });
  } catch (e) {
    console.error('[channels/integrations] POST', e);
    return json({ error: (e as Error)?.message || 'Erreur serveur' }, 500);
  }
}

export async function onRequestDelete(context: any) {
  const env = context.env;
  try {
    const caller = await verifySupabaseIdToken(env, context.request.headers.get('Authorization'));
    if (!caller) return json({ error: 'Authentification requise' }, 401);

    const channel = String(new URL(context.request.url).searchParams.get('channel') || '').toLowerCase();
    if (!getChannel(channel)) return json({ error: `Canal inconnu : ${channel || '(vide)'}` }, 400);

    // On coupe la connexion ET on efface le jeton : déconnecter doit vraiment
    // déconnecter, pas laisser un accès dormir en base.
    const res = await supabaseSetChannelConnected(env, caller.uid, channel, false, { dropToken: true });
    if (!res.ok) return json({ error: res.error || 'Déconnexion impossible' }, 400);
    return json({ ok: true, channel });
  } catch (e) {
    console.error('[channels/integrations] DELETE', e);
    return json({ error: (e as Error)?.message || 'Erreur serveur' }, 500);
  }
}
