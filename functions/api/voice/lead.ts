/**
 * JAWEBFLOW — POST /api/voice/lead
 * ============================================================================
 * Pendant un appel, l'agent vocal appelle l'outil `enregistrer_demande` : le
 * navigateur nous transmet les coordonnées que le client vient de donner, et
 * cette route **garde la fiche**.
 *
 *   • Widget d'un client  → la fiche va dans la table `prospects` du marchand
 *     (statut « qualifié », source « appel vocal », besoin, rendez-vous) : elle
 *     apparaît dans ses leads, comme un lead venu d'Instagram ou du chat.
 *   • Appel du site vitrine → la demande va dans `platform_settings`
 *     (`id = site_leads`) et s'affiche dans la console admin.
 *
 * Garde-fous : 12 appels max par IP et par 10 minutes, tout est borné en
 * taille, et une demande sans téléphone ni e-mail n'est PAS enregistrée — on
 * répond à l'agent ce qui manque pour qu'il le demande au client.
 */
import { rateLimited } from '../../_shared/rate-limit.ts';
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
  supabaseUpsertProspect,
} from '../../_shared/supabase.ts';
import { evaluateWidgetAccess } from '../../_shared/widget-access.ts';
import { normalizedSiteLead, saveSiteLead } from '../../_shared/site-chat.ts';
import { LEAD_TOOL_NAME } from '../../_shared/voice/mission.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

/** Ce que l'agent reçoit en retour : toujours en français, toujours simple. */
const toolReply = (body: Record<string, unknown>) => json(body);

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  try {
    const body = await context.request.json().catch(() => ({} as any));
    const args = body?.args && typeof body.args === 'object' ? body.args : {};
    const sessionId = String(body?.sessionId || '').trim().slice(0, 80);

    const ip =
      context.request.headers.get('CF-Connecting-IP') ||
      (context.request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'inconnue';
    if (rateLimited(`voice-lead:${ip}`, { max: 12, windowMs: 10 * 60_000 })) {
      return toolReply({
        ok: false,
        message: "Le registre est momentanément occupé : garde le numéro du client et confirme-lui qu'on le rappelle.",
      });
    }

    const phone = String(args.telephone || args.phone || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const email = String(args.email || '').trim().slice(0, 120);
    const name = String(args.nom || args.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const need = String(args.besoin || args.need || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const city = String(args.ville || args.city || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const date = String(args.date || args.rdv || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const kind = String(args.type_demande || args.kind || 'demande').replace(/\s+/g, ' ').trim().slice(0, 30);

    // Sans moyen de rappeler le client, la fiche ne sert à rien : on le dit à
    // l'agent, qui pose la question — c'est exactement ce qu'on veut.
    const phoneOk = phone.replace(/\D/g, '').length >= 8;
    const emailOk = /.+@.+\..+/.test(email);
    if (!phoneOk && !emailOk) {
      return toolReply({
        ok: false,
        manquant: ['telephone'],
        message: name
          ? `Il manque le numéro de ${name} : demande-le, répète-le pour vérifier, puis rappelle l'outil.`
          : "Il manque le numéro du client : demande-le, répète-le pour vérifier, puis rappelle l'outil.",
      });
    }

    // ── L'appel du site vitrine : `platform_settings` ────────────────────────
    if (body?.site === true) {
      const lead = normalizedSiteLead({ ...args, nom: name, telephone: phone, email, besoin: need, ville: city, date, type_demande: kind }, sessionId);
      const saved = await saveSiteLead(env, lead);
      if (!saved.ok) {
        console.warn('[voice/lead] site :', saved.error);
        return toolReply({
          ok: false,
          message: "Le registre du site ne répond pas : confirme au visiteur qu'on le rappelle, l'équipe a bien la demande en note.",
        });
      }
      return toolReply({
        ok: true,
        enregistre: true,
        statut: 'nouveau',
        message: "C'est noté pour l'équipe JawebFlow. Confirme au visiteur en une phrase qu'on le rappelle.",
      });
    }

    // ── Le widget d'un client : la table `prospects` du marchand ────────────
    const assistantId = String(body?.assistantId || '').trim().slice(0, 90);
    if (!assistantId || assistantId === 'asst_live') {
      return toolReply({
        ok: false,
        message: "Je n'ai pas pu ranger la demande : prends le numéro du client et dis-lui qu'on le rappelle.",
      });
    }
    if (!supabaseConfigured(env)) {
      return toolReply({
        ok: false,
        message: "Le registre du commerçant n'est pas joignable : note le numéro et confirme au client qu'on le rappelle.",
      });
    }

    const assistant = await supabaseGetAssistant(env, assistantId);
    const row = assistant?.data;
    if (!row) {
      return toolReply({ ok: false, message: "Le registre du commerçant est introuvable : dis au client qu'on le rappelle." });
    }
    const config = supabaseAssistantRowToConfig(row);
    const access = evaluateWidgetAccess(config, {
      key: body?.widgetKey,
      origin: String(body?.origin || context.request.headers.get('Origin') || ''),
    });
    if (!access.allowed) {
      return toolReply({ ok: false, message: "Cet appel n'est pas autorisé à enregistrer une demande." });
    }

    // Même numéro = même fiche (le client qui rappelle complète sa fiche au
    // lieu d'en créer une deuxième).
    const digits = phone.replace(/\D/g, '') || email.toLowerCase().replace(/[^a-z0-9]/g, '');
    const docId = `voice_${assistantId}_${digits}`.slice(0, 190);
    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(city ? { city } : {}),
      ...(need ? { need } : {}),
      source: 'Appel vocal',
      channel: 'voice',
      voiceKind: kind,
      ...(date ? { appointmentAt: date } : {}),
      // « Marqué » : la fiche est qualifiée (on a un moyen de rappeler) et on
      // sait d'où elle vient — le marchand la retrouve dans ses leads.
      status: 'qualifie',
      leadSource: 'appel vocal',
      leadTool: LEAD_TOOL_NAME,
      leadMarkedAt: now,
      lastInteractionAt: now,
      sessionId: sessionId || undefined,
      messages: [{ sender: 'user', text: `Appel vocal — ${need || kind}${date ? ` (${date})` : ''}`.slice(0, 500), timestamp: now }],
    };

    try {
      await supabaseUpsertProspect(env, docId, assistantId, patch);
    } catch (e: any) {
      console.error('[voice/lead] prospects :', e?.message || e);
      return toolReply({
        ok: false,
        message: "Je n'ai pas pu ranger la demande dans le registre : confirme au client qu'on le rappelle.",
      });
    }

    return toolReply({
      ok: true,
      enregistre: true,
      statut: 'qualifie',
      message: "C'est noté dans le registre du commerçant. Confirme au client en une phrase qu'on le rappelle.",
    });
  } catch (e: any) {
    console.error('[voice/lead]', e?.message || e);
    return toolReply({ ok: false, message: "Un souci est survenu : prends le numéro et dis au client qu'on le rappelle." });
  }
}
