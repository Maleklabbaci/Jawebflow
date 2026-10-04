/**
 * JAWEBFLOW — Le MOTEUR des automatisations Instagram (style ManyChat).
 *
 *   processCommentEvent   commentaire reçu  ➜ réponse publique + message privé
 *   runDmAutomations      message privé / réponse à une story / mention en story
 *                         ➜ réponse automatique par mots-clés (AVANT l'IA)
 *   handleAutomationPostback / follow-gate
 *                         « suis mon compte puis appuie sur le bouton »
 *
 * Principes de sécurité (anti-spam, anti-boucle, anti-doublon) :
 *   • on ignore nos propres commentaires et les réponses à un commentaire ;
 *   • chaque événement est « réservé » dans ig_automation_events AVANT d'envoyer
 *     quoi que ce soit (contrainte d'unicité) : si Meta renvoie le même
 *     événement deux fois, le second est ignoré ;
 *   • « une seule fois par personne » par défaut ;
 *   • une seule automatisation par commentaire (la plus précise).
 *
 * Aucune fonction ici ne lève d'exception vers l'appelant : le webhook doit
 * toujours répondre 200 à Meta.
 */
import { supabaseConfigured, supabaseRequest } from './supabase.ts';
import {
  buildDm,
  buildGate,
  buildPublicReply,
  firstNameFrom,
  normalizeText,
  pickAutomation,
  rowToAutomation,
  type Automation,
  type TemplateVars,
  type TriggerType,
} from './ig-automation-core.ts';
import {
  getContactProfile,
  refreshInstagramTokenIfNeeded,
  replyToComment,
  sendMessage,
  urlButtons,
  type MetaError,
  type OutgoingMessage,
} from './ig-api.ts';

export interface IgAccount {
  /** user_id Supabase du marchand (clé de instagram_integrations). */
  userId: string;
  /** Identifiant « professionnel » Instagram (celui des webhooks : entry.id). */
  igUserId: string;
  token: string;
  assistantId?: string;
  respondToStories?: boolean;
  lastConnectedAt?: string;
  businessName?: string;
}

const enc = encodeURIComponent;
const GATE_PREFIX = 'jfg:';
const THREAD_KEEP = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Accès base de données
// ─────────────────────────────────────────────────────────────────────────────
let warnedMissingTable = false;

export async function loadAccountByIgId(env: any, igUserId: string): Promise<IgAccount | null> {
  if (!supabaseConfigured(env) || !igUserId) return null;
  try {
    const res = await supabaseRequest(env, `instagram_integrations?instagram_user_id=eq.${enc(igUserId)}&select=*`);
    if (!res.ok) return null;
    const row = ((await res.json()) as any[])?.[0];
    const token = String(row?.access_token || '');
    if (!row || !token || !row.user_id) return null;
    return {
      userId: String(row.user_id),
      igUserId: String(igUserId),
      token,
      assistantId: row.assistant_id ? String(row.assistant_id) : undefined,
      respondToStories: row.respond_to_stories,
      lastConnectedAt: row.last_connected_at ? String(row.last_connected_at) : undefined,
    };
  } catch (e: any) {
    console.error('[ig-auto] lecture du compte impossible:', e?.message || e);
    return null;
  }
}

export async function loadAutomations(env: any, userId: string, types: TriggerType[]): Promise<Automation[]> {
  try {
    const res = await supabaseRequest(
      env,
      `ig_automations?user_id=eq.${enc(userId)}&enabled=eq.true&trigger_type=in.(${types.join(',')})&select=*&order=created_at.asc&limit=100`,
    );
    if (!res.ok) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(`[ig-auto] table ig_automations illisible (HTTP ${res.status}) — la migration supabase/migration_ig_automations.sql a-t-elle été exécutée ?`);
      }
      return [];
    }
    return ((await res.json()) as any[]).map(rowToAutomation);
  } catch (e: any) {
    console.error('[ig-auto] lecture des automatisations impossible:', e?.message || e);
    return [];
  }
}

async function loadAutomationById(env: any, userId: string, id: string): Promise<Automation | null> {
  try {
    const res = await supabaseRequest(env, `ig_automations?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=*`);
    if (!res.ok) return null;
    const row = ((await res.json()) as any[])?.[0];
    return row ? rowToAutomation(row) : null;
  } catch {
    return null;
  }
}

type ClaimResult = { kind: 'new'; id: string } | { kind: 'duplicate' } | { kind: 'error'; message: string };

/** Réserve l'événement : le 2e appel pour le même (automatisation, commentaire) est refusé. */
async function claimEvent(env: any, row: Record<string, any>): Promise<ClaimResult> {
  try {
    const res = await supabaseRequest(env, 'ig_automation_events?on_conflict=automation_id,source_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    if (!res.ok) return { kind: 'error', message: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` };
    const rows = (await res.json().catch(() => [])) as any[];
    return rows?.[0]?.id ? { kind: 'new', id: String(rows[0].id) } : { kind: 'duplicate' };
  } catch (e: any) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

async function patchEvent(env: any, id: string, patch: Record<string, any>, extraFilter = ''): Promise<boolean> {
  try {
    const res = await supabaseRequest(env, `ig_automation_events?id=eq.${enc(id)}${extraFilter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => [])) as any[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function getEvent(env: any, id: string): Promise<any | null> {
  try {
    const res = await supabaseRequest(env, `ig_automation_events?id=eq.${enc(id)}&select=*`);
    if (!res.ok) return null;
    return ((await res.json()) as any[])?.[0] || null;
  } catch {
    return null;
  }
}

async function bump(env: any, automationId: string, d: { triggered?: number; publicReplies?: number; dms?: number; errors?: number }) {
  try {
    await supabaseRequest(env, 'rpc/ig_automation_bump', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        p_id: automationId,
        p_triggered: d.triggered || 0,
        p_public: d.publicReplies || 0,
        p_dm: d.dms || 0,
        p_errors: d.errors || 0,
      }),
    });
  } catch (e: any) {
    console.warn('[ig-auto] compteurs non mis à jour:', e?.message || e);
  }
}

async function alreadyServed(env: any, automationId: string, contactId: string): Promise<boolean> {
  try {
    const res = await supabaseRequest(
      env,
      `ig_automation_events?automation_id=eq.${enc(automationId)}&contact_id=eq.${enc(contactId)}` +
        `&or=(dm_status.in.(sent,awaiting_follow),public_reply_status.eq.sent)&select=id&limit=1`,
    );
    if (!res.ok) return false;
    return ((await res.json().catch(() => [])) as any[]).length > 0;
  } catch {
    return false;
  }
}

/** Ajoute l'échange à l'historique de la conversation : l'IA saura ce qui a déjà été dit. */
async function appendThread(env: any, userId: string, contactId: string, entries: Array<{ role: 'user' | 'model'; text: string }>, mid?: string) {
  try {
    const res = await supabaseRequest(env, `instagram_threads?integration_id=eq.${enc(userId)}&customer_id=eq.${enc(contactId)}&select=messages,handled_mids`);
    const row = res.ok ? ((await res.json().catch(() => [])) as any[])?.[0] : null;
    const messages = [...(Array.isArray(row?.messages) ? row.messages : []), ...entries.map((e) => ({ role: e.role, text: e.text.slice(0, 1000) }))].slice(-THREAD_KEEP);
    const handled = Array.isArray(row?.handled_mids) ? row.handled_mids : [];
    await supabaseRequest(env, 'instagram_threads?on_conflict=integration_id,customer_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        integration_id: userId,
        customer_id: contactId,
        messages,
        ...(mid ? { handled_mids: [...handled, mid].slice(-30) } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e: any) {
    console.warn('[ig-auto] historique de conversation non mis à jour:', e?.message || e);
  }
}

const lastTouch = new Map<string, number>();

/** « Instagram nous a bien envoyé un commentaire » — au plus 1 écriture / 30 s par marchand. */
async function touchCommentState(env: any, userId: string) {
  const now = Date.now();
  if (now - (lastTouch.get(userId) || 0) < 30_000) return;
  lastTouch.set(userId, now);
  try {
    await supabaseRequest(env, 'ig_automation_state?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, last_comment_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }),
    });
  } catch { /* purement informatif */ }
}

async function isContactMuted(env: any, assistantId: string | undefined, contactId: string): Promise<boolean> {
  if (!assistantId) return false;
  try {
    const res = await supabaseRequest(env, `bot_mutes?assistant_id=eq.${enc(assistantId)}&session_id=eq.ig_${enc(contactId)}&select=assistant_id`);
    if (!res.ok) return false;
    return ((await res.json().catch(() => [])) as any[]).length > 0;
  } catch {
    return false;
  }
}

async function businessNameFor(env: any, account: IgAccount): Promise<string> {
  if (account.businessName !== undefined) return account.businessName;
  let name = '';
  if (account.assistantId) {
    try {
      const res = await supabaseRequest(env, `assistants?id=eq.${enc(account.assistantId)}&select=business_name`);
      if (res.ok) name = String(((await res.json().catch(() => [])) as any[])?.[0]?.business_name || '');
    } catch { /* facultatif */ }
  }
  account.businessName = name;
  return name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Petits utilitaires
// ─────────────────────────────────────────────────────────────────────────────
/** Seuls les textes réellement utilisés comptent (le texte d'abonnement par défaut existe même quand l'option est éteinte). */
const allTexts = (a: Automation) =>
  [
    ...(a.config.publicReply.enabled ? a.config.publicReply.variations : []),
    ...(a.config.dm.enabled ? [a.config.dm.text] : []),
    ...(a.config.gate.enabled && a.config.dm.enabled ? [a.config.gate.text, a.config.gate.retry] : []),
  ].join('\n');
const usesBusinessName = (a: Automation) => /\{\{?\s*(entreprise|business)\b/i.test(allTexts(a));
const usesPersonalVars = (a: Automation) => /\{\{?\s*@?(pseudo|username|prenom|prénom|first_name|firstname)\b/i.test(allTexts(a));

const errText = (label: string, e?: MetaError) => `${label} : ${e?.message || 'échec'}`;

const CONFIRM_WORDS = new Set(['ok', 'okay', 'oui', 'yes', 'fait', 'done', 'c est fait', 'cest fait', 'voila', 'تم', '✅', '👍']);
const isConfirmWord = (text: string) => CONFIRM_WORDS.has(normalizeText(text));

function outcomeOf(attempted: boolean[]): 'done' | 'partial' | 'failed' | 'skipped' {
  if (!attempted.length) return 'skipped';
  const ok = attempted.filter(Boolean).length;
  return ok === attempted.length ? 'done' : ok === 0 ? 'failed' : 'partial';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) COMMENTAIRES
// ─────────────────────────────────────────────────────────────────────────────
export type CommentStatus = 'ignored' | 'no_account' | 'no_match' | 'duplicate' | 'skipped' | 'done' | 'partial' | 'failed' | 'error';
export interface CommentOutcome {
  status: CommentStatus;
  detail?: string;
  eventId?: string;
}

/** `entryId` = compte Instagram du marchand ; `value` = changes[].value du webhook « comments ». */
export async function processCommentEvent(env: any, entryId: string, value: any): Promise<CommentOutcome> {
  try {
    const commentId = String(value?.id || value?.comment_id || '');
    const contactId = String(value?.from?.id || '');
    const username = String(value?.from?.username || '');
    const text = typeof value?.text === 'string' ? value.text : '';
    const mediaId = String(value?.media?.id || '');

    if (!commentId || !contactId || !entryId) return { status: 'ignored', detail: 'événement incomplet' };
    if (contactId === String(entryId)) return { status: 'ignored', detail: 'commentaire du compte lui-même' };
    if (value?.parent_id) return { status: 'ignored', detail: 'réponse à un commentaire' };
    if (!supabaseConfigured(env)) return { status: 'ignored', detail: 'base de données non configurée' };

    const account = await loadAccountByIgId(env, String(entryId));
    if (!account) return { status: 'no_account' };
    await touchCommentState(env, account.userId);

    const automations = await loadAutomations(env, account.userId, ['comment']);
    const picked = pickAutomation(automations, { type: 'comment', text, mediaId });
    if (!picked) return { status: 'no_match' };
    const a = picked.automation;
    const cfg = a.config;

    const claim = await claimEvent(env, {
      user_id: account.userId,
      automation_id: a.id,
      automation_name: a.name,
      trigger_type: 'comment',
      contact_id: contactId,
      contact_username: username || null,
      source_id: commentId,
      media_id: mediaId || null,
      input_text: text.slice(0, 500),
      outcome: 'processing',
    });
    if (claim.kind === 'duplicate') return { status: 'duplicate' };
    if (claim.kind === 'error') {
      console.error('[ig-auto] événement non enregistré — envoi annulé pour éviter les doublons:', claim.message);
      return { status: 'error', detail: claim.message };
    }
    const eventId = claim.id;

    if (cfg.oncePerUser && (await alreadyServed(env, a.id, contactId))) {
      await patchEvent(env, eventId, { outcome: 'skipped', note: 'Cette personne avait déjà reçu cette automatisation (option « une seule fois par personne »).' });
      return { status: 'skipped', detail: 'déjà servi', eventId };
    }

    // Jeton proche de l'expiration Meta ? On le renouvelle en silence.
    const tokenView = { igToken: account.token, accessToken: account.token, integrationId: account.userId, lastConnectedAt: account.lastConnectedAt };
    await refreshInstagramTokenIfNeeded(env, tokenView);
    account.token = tokenView.igToken;

    const vars: TemplateVars = {
      username,
      firstName: '', // inconnu avant que la personne ait écrit (règle Meta : « consentement »)
      businessName: usesBusinessName(a) ? await businessNameFor(env, account) : '',
    };
    const publicText = buildPublicReply(cfg, vars);
    const gate = buildGate(cfg, vars);
    const dm = buildDm(cfg, vars);

    // Réponse publique et message privé partent EN MÊME TEMPS.
    const [pub, priv] = await Promise.all([
      publicText ? replyToComment(account.token, commentId, publicText) : Promise.resolve(null),
      (async () => {
        if (!dm) return null;
        if (gate) {
          const msg: OutgoingMessage = {
            text: gate.text,
            buttons: [{ type: 'postback', title: gate.button, payload: `${GATE_PREFIX}${eventId}` }],
          };
          return sendMessage(account.token, account.igUserId, { commentId }, msg, {
            plainFallback: `${gate.text}\n\n(Quand c’est fait, réponds « OK » pour recevoir ton message.)`,
          });
        }
        return sendMessage(account.token, account.igUserId, { commentId }, { text: dm.text, buttons: urlButtons(dm.buttons) });
      })(),
    ]);

    const attempted: boolean[] = [];
    const errors: string[] = [];
    const patch: Record<string, any> = {};
    if (pub) {
      attempted.push(pub.ok);
      patch.public_reply_text = publicText;
      patch.public_reply_status = pub.ok ? 'sent' : 'failed';
      if (!pub.ok) errors.push(errText('Réponse publique', pub.error));
    }
    if (priv) {
      attempted.push(priv.ok);
      patch.dm_text = dm?.text;
      patch.dm_status = priv.ok ? (gate ? 'awaiting_follow' : 'sent') : 'failed';
      if (priv.ok && gate) patch.gate_state = 'awaiting';
      if (!priv.ok) errors.push(errText('Message privé', priv.error));
    }
    const outcome = outcomeOf(attempted);
    patch.outcome = outcome;
    if (errors.length) patch.error = errors.join(' — ');
    await patchEvent(env, eventId, patch);

    await bump(env, a.id, {
      triggered: 1,
      publicReplies: pub?.ok ? 1 : 0,
      dms: priv?.ok ? 1 : 0,
      errors: errors.length ? 1 : 0,
    });

    if (priv?.ok && dm && !gate) {
      await appendThread(env, account.userId, priv.recipientId || contactId, [{ role: 'model', text: dm.text }]);
    }

    console.log(`[ig-auto] commentaire traité par « ${a.name} » : ${outcome}${errors.length ? ` (${errors.join(' | ')})` : ''}`);
    return { status: outcome, eventId };
  } catch (e: any) {
    console.error('[ig-auto] erreur inattendue (commentaire):', e?.stack || e?.message || e);
    return { status: 'error', detail: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) MESSAGES PRIVÉS : mots-clés, stories
// ─────────────────────────────────────────────────────────────────────────────
export type DmAutomationResult = 'handled' | 'ignored' | 'pass';

/**
 * Appelé par le webhook AVANT l'IA.
 *   'handled' : une automatisation a répondu (ou l'événement est un doublon) → stop.
 *   'ignored' : événement à ne PAS traiter par l'IA (ex. mention en story sans règle).
 *   'pass'    : rien ne correspond → l'IA continue comme avant.
 */
export async function runDmAutomations(env: any, account: IgAccount, event: any): Promise<DmAutomationResult> {
  try {
    const senderId = String(event?.sender?.id || '');
    const message = event?.message || {};
    const mid = String(message?.mid || '');
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    const attachments: any[] = Array.isArray(message?.attachments) ? message.attachments : [];
    const isStoryMention = attachments.some((x) => x?.type === 'story_mention');
    const isStoryReply = Boolean(message?.reply_to?.story);
    if (!senderId || !supabaseConfigured(env)) return 'pass';

    // « OK » après une demande d'abonnement envoyée en texte simple.
    if (text && isConfirmWord(text) && (await tryReleaseGateByConfirm(env, account, senderId))) return 'handled';

    const order: TriggerType[] = isStoryMention ? ['story_mention'] : isStoryReply ? ['story_reply', 'dm_keyword'] : ['dm_keyword'];
    if (!isStoryMention && !text) return 'pass';

    const automations = await loadAutomations(env, account.userId, order);
    let picked: ReturnType<typeof pickAutomation> = null;
    let type: TriggerType = order[0];
    for (const t of order) {
      picked = pickAutomation(automations, { type: t, text });
      if (picked) { type = t; break; }
    }
    if (!picked) return isStoryMention ? 'ignored' : 'pass';

    // Quelqu'un qui a dit STOP au robot ne reçoit rien d'automatique.
    if (await isContactMuted(env, account.assistantId, senderId)) return 'pass';

    const a = picked.automation;
    const claim = await claimEvent(env, {
      user_id: account.userId,
      automation_id: a.id,
      automation_name: a.name,
      trigger_type: type,
      contact_id: senderId,
      source_id: mid || null,
      input_text: text.slice(0, 500) || (isStoryMention ? '(mention en story)' : null),
      outcome: 'processing',
    });
    if (claim.kind === 'duplicate') return 'handled';
    if (claim.kind === 'error') {
      console.error('[ig-auto] événement non enregistré — réponse automatique annulée:', claim.message);
      return 'pass';
    }

    // Prénom / pseudo : seulement si le message en a besoin (1 appel de plus à Meta).
    const vars: TemplateVars = { businessName: usesBusinessName(a) ? await businessNameFor(env, account) : '' };
    if (usesPersonalVars(a)) {
      const { profile } = await getContactProfile(account.token, senderId);
      if (profile) {
        vars.username = profile.username;
        vars.firstName = firstNameFrom(profile.name);
        if (profile.username) await patchEvent(env, claim.id, { contact_username: profile.username });
      }
    }
    const dm = buildDm(a.config, vars);
    if (!dm) {
      await patchEvent(env, claim.id, { outcome: 'skipped', note: 'Le message de l’automatisation est vide.' });
      return 'pass';
    }

    const r = await sendMessage(account.token, account.igUserId, { recipientId: senderId }, { text: dm.text, buttons: urlButtons(dm.buttons) });
    await patchEvent(env, claim.id, {
      dm_text: dm.text,
      dm_status: r.ok ? 'sent' : 'failed',
      outcome: r.ok ? 'done' : 'failed',
      ...(r.ok ? {} : { error: errText('Message privé', r.error) }),
    });
    await bump(env, a.id, { triggered: 1, dms: r.ok ? 1 : 0, errors: r.ok ? 0 : 1 });
    if (r.ok) {
      await appendThread(env, account.userId, senderId, [{ role: 'user', text }, { role: 'model', text: dm.text }], mid);
    }
    console.log(`[ig-auto] message privé traité par « ${a.name} » : ${r.ok ? 'réponse envoyée' : 'échec'}`);
    return 'handled';
  } catch (e: any) {
    console.error('[ig-auto] erreur inattendue (message privé):', e?.stack || e?.message || e);
    return 'pass';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) « SUIS MON COMPTE » (follow-gate) : bouton / confirmation « OK »
// ─────────────────────────────────────────────────────────────────────────────
/** Postback d'un bouton de l'automatisation. Renvoie true si l'événement nous concernait. */
export async function handleAutomationPostback(env: any, account: IgAccount, event: any): Promise<boolean> {
  try {
    const payload = String(event?.postback?.payload || '');
    if (!payload.startsWith(GATE_PREFIX)) return false;
    const eventId = payload.slice(GATE_PREFIX.length);
    const senderId = String(event?.sender?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(eventId) || !senderId) return true;
    const ev = await getEvent(env, eventId);
    if (!ev || ev.user_id !== account.userId || String(ev.contact_id) !== senderId) return true;
    await releaseGate(env, account, ev);
    return true;
  } catch (e: any) {
    console.error('[ig-auto] erreur inattendue (bouton):', e?.stack || e?.message || e);
    return true;
  }
}

async function tryReleaseGateByConfirm(env: any, account: IgAccount, senderId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const res = await supabaseRequest(
      env,
      `ig_automation_events?user_id=eq.${enc(account.userId)}&contact_id=eq.${enc(senderId)}&gate_state=eq.awaiting&created_at=gte.${enc(since)}&select=*&order=created_at.desc&limit=1`,
    );
    if (!res.ok) return false;
    const ev = ((await res.json().catch(() => [])) as any[])?.[0];
    if (!ev) return false;
    await releaseGate(env, account, ev);
    return true;
  } catch {
    return false;
  }
}

/**
 * La personne dit « c'est fait » : on vérifie qu'elle suit bien le compte, puis
 * on envoie le vrai message. Si Instagram ne permet pas de vérifier (profil
 * indisponible), on fait confiance : mieux vaut servir que bloquer.
 */
async function releaseGate(env: any, account: IgAccount, ev: any): Promise<void> {
  // Verrou atomique : un double clic ne doit pas envoyer deux fois le message.
  const locked = await patchEvent(env, String(ev.id), { gate_state: 'releasing' }, '&gate_state=eq.awaiting');
  if (!locked) return;

  const automation = ev.automation_id ? await loadAutomationById(env, account.userId, String(ev.automation_id)) : null;
  if (!automation) {
    await patchEvent(env, String(ev.id), { gate_state: 'released', outcome: 'failed', error: 'L’automatisation a été supprimée avant l’envoi du message.' });
    return;
  }

  const { profile } = await getContactProfile(account.token, String(ev.contact_id));
  const vars: TemplateVars = {
    username: String(ev.contact_username || profile?.username || ''),
    firstName: firstNameFrom(profile?.name),
    businessName: usesBusinessName(automation) ? await businessNameFor(env, account) : '',
  };

  if (profile?.isUserFollowBusiness === false) {
    const gate = buildGate(automation.config, vars);
    if (gate) {
      await sendMessage(
        account.token,
        account.igUserId,
        { recipientId: String(ev.contact_id) },
        { text: gate.retry, buttons: [{ type: 'postback', title: gate.button, payload: `${GATE_PREFIX}${ev.id}` }] },
        { plainFallback: `${gate.retry}\n\n(Quand c’est fait, réponds « OK ».)` },
      );
    }
    await patchEvent(env, String(ev.id), { gate_state: 'awaiting', note: 'Abonnement pas encore détecté : un rappel a été envoyé.' });
    return;
  }

  const dm = buildDm(automation.config, vars);
  if (!dm) {
    await patchEvent(env, String(ev.id), { gate_state: 'released', outcome: 'failed', error: 'Le message de l’automatisation est vide.' });
    return;
  }
  const r = await sendMessage(account.token, account.igUserId, { recipientId: String(ev.contact_id) }, { text: dm.text, buttons: urlButtons(dm.buttons) });
  await patchEvent(env, String(ev.id), {
    gate_state: 'released',
    dm_text: dm.text,
    dm_status: r.ok ? 'sent' : 'failed',
    outcome: r.ok ? (ev.public_reply_status === 'failed' ? 'partial' : 'done') : 'failed',
    note: profile?.isUserFollowBusiness === undefined ? 'Abonnement non vérifiable : message envoyé sur la foi de la personne.' : 'Abonnement confirmé ✅',
    ...(r.ok ? {} : { error: errText('Message privé', r.error) }),
  });
  if (!r.ok) await bump(env, automation.id, { errors: 1 });
  else await appendThread(env, account.userId, String(ev.contact_id), [{ role: 'model', text: dm.text }]);
}
