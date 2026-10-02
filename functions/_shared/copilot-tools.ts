/**
 * JAWEBFLOW — « Parler à mon IA » : les ACTIONS réelles.
 *
 * Quand l'IA décide « j'ajoute cette fiche » ou « je crée cette réponse aux
 * commentaires », c'est ici que ça s'écrit vraiment dans la base — avec les
 * mêmes contrôles que les écrans du tableau de bord. Rien n'est supposé :
 * chaque outil renvoie à l'IA ce qui s'est PASSÉ (ok / erreur en français),
 * et on garde la liste exacte des actions faites pour l'afficher au marchand
 * avec un bouton « Annuler ».
 */
import {
  supabaseAssistantRowToConfig,
  supabaseGetInstagramIntegration,
  supabasePatchAssistant,
  supabaseUpsertInstagramIntegration,
} from './supabase.ts';
import { listMedia } from './ig-api.ts';
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  reinsertAutomation,
  updateAutomation,
} from './ig-automation-store.ts';
import { LEGACY_DEFAULT_GREETING, TRIGGER_LABELS, TRIGGER_TYPES } from './ig-automation-core.ts';
import type { Automation, TriggerType } from './ig-automation-core.ts';
import { readLeads, readStats } from './copilot-stats.ts';
import {
  COPILOT_LIMITS,
  applyBehaviorPatch,
  applyBusinessInfoPatch,
  argsToAutomationInput,
  asBool,
  automationDetail,
  buildNote,
  cleanText,
  clip,
  findNote,
  normalizeBehavior,
  normalizeBusinessInfo,
  noteDetail,
  periodRange,
  revertToBehaviorPatch,
  searchNotes,
  titleKey,
} from './copilot-core.ts';
import type {
  Behavior,
  BusinessInfo,
  CopilotAction,
  CopilotOp,
  CopilotSnapshot,
  CopilotStatePatch,
  Note,
  PostMeta,
} from './copilot-core.ts';

const SETUP_TEXT = 'La fonction « Automatisations » est en cours d’activation sur ce compte : impossible d’en créer ou d’en modifier pour le moment.';

// ─────────────────────────────────────────────────────────────────────────────
// Lire l'état actuel de l'entreprise
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeNotes(raw: unknown): Note[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((n) => n && typeof n === 'object')
    .map((n: any, i) => ({
      ...n,
      id: String(n.id || `note_${i + 1}`),
      title: String(n.title || ''),
      content: String(n.content || ''),
      category: String(n.category || 'general'),
      enabled: n.enabled !== false,
    }));
}

export interface LoadedState {
  snapshot: CopilotSnapshot;
  ig: { token: string; username: string } | null;
}

/** Tout ce que l'IA a besoin de savoir pour répondre : fiches, comportement, Instagram, automatisations. */
export async function loadState(env: any, uid: string, assistantRow: Record<string, any>): Promise<LoadedState> {
  const config = supabaseAssistantRowToConfig(assistantRow);

  // Les deux lectures sont indépendantes : en parallèle (gagne un aller-retour vers la base à chaque message).
  const [integ, listed]: [any, Awaited<ReturnType<typeof listAutomations>>] = await Promise.all([
    supabaseGetInstagramIntegration(env, uid).catch(() => null), // pas d'Instagram : on continue
    listAutomations(env, uid),
  ]);
  const connected = Boolean(integ && integ.connected !== false && integ.accessToken);
  const greetingRaw = String(integ?.customGreeting || '').trim();
  const automations = listed.ok === true ? listed.value : null;

  return {
    snapshot: {
      businessName: String(config.businessName || ''),
      businessCategory: config.businessCategory ? String(config.businessCategory) : undefined,
      businessDescription: config.businessDescription ? String(config.businessDescription) : undefined,
      websiteUrl: config.websiteUrl ? String(config.websiteUrl) : undefined,
      businessInfo: normalizeBusinessInfo(config.businessInfo),
      behavior: normalizeBehavior(config.behavior),
      notes: normalizeNotes(config.knowledgeNotes),
      automations,
      instagram: {
        connected,
        username: connected ? String(integ.instagramUsername || '').replace(/^@/, '') : undefined,
        greeting: greetingRaw && greetingRaw !== LEGACY_DEFAULT_GREETING ? greetingRaw : '',
      },
    },
    ig: connected ? { token: String(integ.accessToken), username: String(integ.instagramUsername || '').replace(/^@/, '') } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Écritures (une seule fonction par type de donnée)
// ─────────────────────────────────────────────────────────────────────────────
async function writeNotes(env: any, assistantId: string, notes: Note[]): Promise<boolean> {
  const r = await supabasePatchAssistant(env, assistantId, { knowledgeNotes: notes });
  return r.ok;
}
async function writeConfigKey(env: any, assistantId: string, key: 'behavior' | 'businessInfo', value: unknown): Promise<boolean> {
  const r = await supabasePatchAssistant(env, assistantId, { [key]: value });
  return r.ok;
}
async function writeGreeting(env: any, uid: string, text: string): Promise<void> {
  await supabaseUpsertInstagramIntegration(env, uid, { customGreeting: text });
}

const SAVE_ERROR = { ok: false, error: 'L’enregistrement a échoué (la base ne répond pas). Rien n’a été modifié : réessaie dans un instant.' };

function defaultAutomationName(trigger: TriggerType, keywords: string[]): string {
  const k = keywords[0] ? clip(keywords[0], 30) : '';
  if (trigger === 'comment') return k ? `Commentaire « ${k} »` : 'Tous les commentaires';
  if (trigger === 'dm_keyword') return k ? `Message « ${k} »` : TRIGGER_LABELS[trigger].short;
  return TRIGGER_LABELS[trigger].short;
}

const snapshotOf = (a: Automation): Extract<CopilotOp, { type: 'automation_restore' }>['automation'] => ({
  id: a.id,
  name: a.name,
  triggerType: a.triggerType,
  enabled: a.enabled,
  config: a.config,
});

// ─────────────────────────────────────────────────────────────────────────────
// L'exécuteur d'outils (un par message du marchand)
// ─────────────────────────────────────────────────────────────────────────────
export interface RunnerInit {
  env: any;
  uid: string;
  assistantId: string;
  state: LoadedState;
  now?: () => Date;
  makeId?: () => string;
}

export class CopilotRunner {
  readonly actions: CopilotAction[] = [];
  readonly patch: CopilotStatePatch = {};
  executed = 0;

  private env: any;
  private uid: string;
  private assistantId: string;
  private ig: LoadedState['ig'];
  private now: () => Date;
  private makeId: () => string;
  private notes: Note[];
  private behavior: Behavior;
  private businessInfo: BusinessInfo;
  private greeting: string;
  private automations: Automation[] | null;
  private posts: PostMeta[] | null = null;

  constructor(init: RunnerInit) {
    this.env = init.env;
    this.uid = init.uid;
    this.assistantId = init.assistantId;
    this.ig = init.state.ig;
    this.now = init.now || (() => new Date());
    this.makeId = init.makeId || (() => `cp_${crypto.randomUUID().slice(0, 8)}`);
    this.notes = [...init.state.snapshot.notes];
    this.behavior = init.state.snapshot.behavior;
    this.businessInfo = init.state.snapshot.businessInfo;
    this.greeting = init.state.snapshot.instagram.greeting || '';
    this.automations = init.state.snapshot.automations ? [...init.state.snapshot.automations] : null;
  }

  private record(a: Omit<CopilotAction, 'id'>): void {
    this.actions.push({ id: `a${this.actions.length + 1}`, ...a });
  }

  async execute(name: string, rawArgs: unknown): Promise<Record<string, unknown>> {
    if (this.executed >= COPILOT_LIMITS.maxToolCalls) {
      return { ok: false, error: 'Trop d’actions en une seule fois : dis au marchand ce qui reste à faire, il le demandera dans un prochain message.' };
    }
    this.executed += 1;
    const args: any = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    try {
      switch (name) {
        case 'search_knowledge': return this.searchKnowledge(args);
        case 'add_knowledge': return await this.addKnowledge(args);
        case 'update_knowledge': return await this.updateKnowledge(args);
        case 'delete_knowledge': return await this.deleteKnowledge(args);
        case 'set_business_info': return await this.setBusinessInfo(args);
        case 'set_behavior': return await this.setBehavior(args);
        case 'set_instagram_greeting': return await this.setGreeting(args);
        case 'list_instagram_posts': return await this.listPosts();
        case 'create_automation': return await this.createAutomationTool(args);
        case 'update_automation': return await this.updateAutomationTool(args);
        case 'set_automation_enabled': return await this.setAutomationEnabled(args);
        case 'delete_automation': return await this.deleteAutomationTool(args);
        case 'get_stats': return await this.getStats(args);
        case 'list_leads': return await this.listLeadsTool(args);
        default: return { ok: false, error: `Outil inconnu : ${String(name).slice(0, 40)}.` };
      }
    } catch (e: any) {
      console.error('[copilot] outil en échec:', name, e?.message || e);
      return { ok: false, error: 'Une erreur est survenue pendant cette action. Rien n’a été confirmé : réessaie.' };
    }
  }

  // ── Chiffres du compte (lecture seule : rien n'est écrit, aucune carte « action ») ──
  private async getStats(args: any) {
    return readStats(this.env, this.assistantId, periodRange(args.period, this.now(), '7d'));
  }

  private async listLeadsTool(args: any) {
    const wanted = Math.trunc(Number(args.limit));
    const limit = Number.isFinite(wanted) ? Math.min(COPILOT_LIMITS.maxLeadsReturned, Math.max(1, wanted)) : 5;
    return readLeads(this.env, this.assistantId, periodRange(args.period, this.now(), 'all'), { limit, query: cleanText(args.query, 60) });
  }

  // ── Fiches ────────────────────────────────────────────────────────────────
  private searchKnowledge(args: any) {
    const found = searchNotes(this.notes, args.query, 8);
    return {
      ok: true,
      count: found.length,
      notes: found.map((n) => ({ id: n.id, title: n.title, category: n.category, enabled: n.enabled, content: n.content })),
    };
  }

  private async addKnowledge(args: any) {
    const built = buildNote(args, { id: this.makeId(), now: this.now().toISOString() });
    if (built.ok === false) return { ok: false, error: built.error };
    const note = built.note;
    if (this.notes.length >= COPILOT_LIMITS.maxNotes) {
      return { ok: false, error: `La base contient déjà ${COPILOT_LIMITS.maxNotes} fiches : supprime-en avant d’en ajouter.` };
    }
    const dup = this.notes.find((n) => titleKey(n.title) === titleKey(note.title));
    if (dup) return { ok: false, error: `Une fiche « ${dup.title} » existe déjà (id=${dup.id}). Utilise update_knowledge pour la compléter ou la modifier.` };

    const next = [...this.notes, note];
    if (!(await writeNotes(this.env, this.assistantId, next))) return SAVE_ERROR;
    this.notes = next;
    this.patch.knowledgeNotes = next;
    this.record({
      tool: 'add_knowledge',
      icon: 'note',
      title: 'Fiche ajoutée à « Mes informations »',
      detail: noteDetail(note),
      undo: { type: 'knowledge_remove', noteId: note.id },
      goto: 'knowledge',
    });
    return { ok: true, id: note.id, title: note.title, category: note.category, message: 'Fiche ajoutée.' };
  }

  private async updateKnowledge(args: any) {
    const found = findNote(this.notes, args.id);
    if (found.ambiguous) {
      return { ok: false, error: `Plusieurs fiches correspondent : ${found.ambiguous.slice(0, 5).map((n) => `« ${n.title} » (id=${n.id})`).join(' ; ')}. Précise l’id.` };
    }
    const existing = found.note;
    if (!existing) return { ok: false, error: 'Fiche introuvable : regarde la liste des fiches et utilise un id exact.' };

    let content: unknown = args.content !== undefined ? args.content : existing.content;
    if (args.append !== undefined && String(args.append).trim()) content = `${String(content).trim()}\n${cleanText(args.append, COPILOT_LIMITS.maxNoteContent)}`;

    const built = buildNote(
      { title: args.title, content, category: args.category, enabled: args.enabled },
      { id: existing.id, now: this.now().toISOString(), existing },
    );
    if (built.ok === false) return { ok: false, error: built.error };
    const note = built.note;

    const clash = this.notes.find((n) => n.id !== existing.id && titleKey(n.title) === titleKey(note.title));
    if (clash) return { ok: false, error: `Une autre fiche s’appelle déjà « ${clash.title} » (id=${clash.id}).` };

    const same = note.title === existing.title && note.content === existing.content && note.category === existing.category && note.enabled === existing.enabled;
    if (same) return { ok: true, unchanged: true, id: existing.id, message: 'La fiche était déjà ainsi.' };

    const next = this.notes.map((n) => (n.id === existing.id ? note : n));
    if (!(await writeNotes(this.env, this.assistantId, next))) return SAVE_ERROR;
    this.notes = next;
    this.patch.knowledgeNotes = next;
    const onlyToggle = note.title === existing.title && note.content === existing.content && note.category === existing.category;
    this.record({
      tool: 'update_knowledge',
      icon: 'note',
      title: onlyToggle ? (note.enabled ? 'Fiche réactivée' : 'Fiche mise de côté') : 'Fiche modifiée',
      detail: noteDetail(note),
      undo: { type: 'knowledge_restore', note: existing },
      goto: 'knowledge',
    });
    return { ok: true, id: note.id, title: note.title, message: 'Fiche modifiée.' };
  }

  private async deleteKnowledge(args: any) {
    const found = findNote(this.notes, args.id);
    if (found.ambiguous) {
      return { ok: false, error: `Plusieurs fiches correspondent : ${found.ambiguous.slice(0, 5).map((n) => `« ${n.title} » (id=${n.id})`).join(' ; ')}. Précise l’id.` };
    }
    const existing = found.note;
    if (!existing) return { ok: false, error: 'Fiche introuvable : regarde la liste des fiches et utilise un id exact.' };

    const next = this.notes.filter((n) => n.id !== existing.id);
    if (!(await writeNotes(this.env, this.assistantId, next))) return SAVE_ERROR;
    this.notes = next;
    this.patch.knowledgeNotes = next;
    this.record({
      tool: 'delete_knowledge',
      icon: 'note',
      title: 'Fiche supprimée',
      detail: existing.title,
      undo: { type: 'knowledge_restore', note: existing },
      goto: 'knowledge',
    });
    return { ok: true, deleted: existing.title, message: 'Fiche supprimée.' };
  }

  // ── Infos officielles / comportement / accueil Instagram ─────────────────
  private async setBusinessInfo(args: any) {
    const r = applyBusinessInfoPatch(this.businessInfo, args);
    if (r.ok === false) return { ok: false, error: r.error };
    if (!r.changes.length) return { ok: true, unchanged: true, message: 'Ces informations étaient déjà enregistrées ainsi.' };
    if (!(await writeConfigKey(this.env, this.assistantId, 'businessInfo', r.info))) return SAVE_ERROR;
    this.businessInfo = r.info;
    this.patch.businessInfo = r.info;
    this.record({
      tool: 'set_business_info',
      icon: 'info',
      title: 'Informations officielles mises à jour',
      detail: r.changes.join(' · '),
      undo: { type: 'business_info_revert', set: r.revert },
      goto: 'knowledge',
    });
    return { ok: true, changes: r.changes, businessInfo: r.info };
  }

  private async setBehavior(args: any) {
    const r = applyBehaviorPatch(this.behavior, args);
    if (r.ok === false) return { ok: false, error: r.error, ...(r.rules ? { currentRules: r.rules } : {}) };
    if (!r.changes.length) return { ok: true, unchanged: true, message: 'Le comportement était déjà réglé ainsi.' };
    if (!(await writeConfigKey(this.env, this.assistantId, 'behavior', r.behavior))) return SAVE_ERROR;
    this.behavior = r.behavior;
    this.patch.behavior = r.behavior;
    this.record({
      tool: 'set_behavior',
      icon: 'behavior',
      title: 'Façon de répondre mise à jour',
      detail: r.changes.join(' · '),
      undo: { type: 'behavior_revert', revert: r.revert },
      goto: 'behavior',
    });
    return { ok: true, changes: r.changes };
  }

  private async setGreeting(args: any) {
    if (!this.ig) return { ok: false, error: 'Instagram n’est pas encore connecté : le marchand doit d’abord le connecter dans le menu « Instagram ».' };
    const text = cleanText(args.text, COPILOT_LIMITS.maxGreeting + 1);
    if (text.length > COPILOT_LIMITS.maxGreeting) return { ok: false, error: `Message d’accueil trop long (${COPILOT_LIMITS.maxGreeting} caractères max).` };
    if (text === this.greeting) return { ok: true, unchanged: true, message: 'Le message d’accueil était déjà celui-là.' };
    await writeGreeting(this.env, this.uid, text);
    const previous = this.greeting;
    this.greeting = text;
    this.patch.instagramChanged = true;
    this.record({
      tool: 'set_instagram_greeting',
      icon: 'instagram',
      title: text ? 'Message d’accueil Instagram changé' : 'Message d’accueil Instagram remis en automatique',
      detail: text ? clip(text, 160) : 'Le robot retrouve son message d’accueil automatique.',
      undo: { type: 'greeting_restore', text: previous },
      goto: 'instagram',
    });
    return { ok: true, message: text ? 'Message d’accueil changé.' : 'Message d’accueil remis en automatique.' };
  }

  // ── Publications Instagram ───────────────────────────────────────────────
  private async loadPosts(): Promise<{ ok: true; posts: PostMeta[] } | { ok: false; error: string }> {
    if (!this.ig) return { ok: false, error: 'Instagram n’est pas encore connecté : le marchand doit d’abord le connecter dans le menu « Instagram ».' };
    if (this.posts) return { ok: true, posts: this.posts };
    const r = await listMedia(this.ig.token, { limit: 24 });
    if (r.ok === false) return { ok: false, error: r.error?.message || 'Instagram ne répond pas pour le moment.' };
    this.posts = r.media.map((m) => ({ id: m.id, caption: m.caption, type: m.type, permalink: m.permalink, thumbnail: m.thumbnail, timestamp: m.timestamp, comments: m.comments }));
    return { ok: true, posts: this.posts };
  }

  private async listPosts() {
    const r = await this.loadPosts();
    if (r.ok === false) return { ok: false, error: r.error };
    return {
      ok: true,
      count: r.posts.length,
      posts: r.posts.slice(0, 12).map((p) => ({ id: p.id, type: p.type, date: String(p.timestamp || '').slice(0, 10), caption: clip(p.caption, 80), comments: p.comments })),
    };
  }

  // ── Automatisations ──────────────────────────────────────────────────────
  private async resolvePost(postId: unknown): Promise<{ ok: true; post: PostMeta | null } | { ok: false; error: string }> {
    const id = cleanText(postId, 64);
    if (!id || /^(all|toutes?|any)$/i.test(id)) return { ok: true, post: null };
    const r = await this.loadPosts();
    if (r.ok === false) return { ok: false, error: r.error };
    const post = r.posts.find((p) => p.id === id);
    if (!post) return { ok: false, error: 'Publication introuvable parmi les dernières publications : appelle list_instagram_posts et choisis un id de la liste.' };
    return { ok: true, post };
  }

  private warnings(): string[] {
    return this.ig ? [] : ['Instagram n’est pas encore connecté : elle ne servira qu’une fois le compte connecté (menu « Instagram »).'];
  }

  private failure(r: { error: string; errors?: string[]; setupRequired?: boolean }) {
    if (r.setupRequired) this.automations = null;
    return r.errors && r.errors.length > 1 ? { ok: false, error: r.error, allErrors: r.errors } : { ok: false, error: r.error };
  }

  private async createAutomationTool(args: any) {
    if (this.automations === null) return { ok: false, error: SETUP_TEXT };
    const trigger = (TRIGGER_TYPES as string[]).includes(args.trigger) ? (args.trigger as TriggerType) : null;
    if (!trigger) return { ok: false, error: `Type inconnu. Choix : ${TRIGGER_TYPES.join(', ')}.` };

    let post: PostMeta | null = null;
    if (trigger === 'comment' && args.post_id !== undefined) {
      const p = await this.resolvePost(args.post_id);
      if (p.ok === false) return { ok: false, error: p.error };
      post = p.post;
    }

    const input = argsToAutomationInput(trigger, args, undefined, post);
    if (!input.name) input.name = defaultAutomationName(trigger, input.config?.match?.keywords || []);
    const activate = asBool(args.activate) === true;

    const res = await createAutomation(this.env, this.uid, { ...input, enabled: activate });
    if (res.ok === false) return this.failure(res);
    const a = res.value;
    this.automations = [a, ...(this.automations || [])];
    this.patch.automationsChanged = true;
    this.record({
      tool: 'create_automation',
      icon: 'automation',
      title: a.enabled ? 'Réponse automatique créée et activée' : 'Réponse automatique créée (en pause)',
      detail: automationDetail(a),
      undo: { type: 'automation_delete', automationId: a.id },
      ...(a.enabled ? {} : { activate: { automationId: a.id } }),
      goto: 'automations',
    });
    return { ok: true, id: a.id, name: a.name, enabled: a.enabled, summary: automationDetail(a), warnings: this.warnings() };
  }

  private findAutomation(ref: unknown): Automation | null {
    const id = String(ref ?? '').trim();
    return (this.automations || []).find((a) => a.id === id) || null;
  }

  private async updateAutomationTool(args: any) {
    if (this.automations === null) return { ok: false, error: SETUP_TEXT };
    const cur = this.findAutomation(args.id);
    if (!cur) return { ok: false, error: 'Automatisation introuvable : utilise un id de la liste des automatisations.' };

    let post: PostMeta | null = null;
    if (cur.triggerType === 'comment' && args.post_id !== undefined) {
      const p = await this.resolvePost(args.post_id);
      if (p.ok === false) return { ok: false, error: p.error };
      post = p.post;
    }
    const input = argsToAutomationInput(cur.triggerType, args, cur, post);
    const res = await updateAutomation(this.env, this.uid, cur.id, { automation: { name: input.name, config: input.config } });
    if (res.ok === false) return this.failure(res);
    const { automation: a, before } = res.value;
    this.automations = (this.automations || []).map((x) => (x.id === a.id ? a : x));
    this.patch.automationsChanged = true;
    this.record({
      tool: 'update_automation',
      icon: 'automation',
      title: 'Réponse automatique modifiée',
      detail: automationDetail(a),
      undo: { type: 'automation_restore', automation: snapshotOf(before) },
      goto: 'automations',
    });
    return { ok: true, id: a.id, summary: automationDetail(a), warnings: this.warnings() };
  }

  private async setAutomationEnabled(args: any) {
    if (this.automations === null) return { ok: false, error: SETUP_TEXT };
    const cur = this.findAutomation(args.id);
    if (!cur) return { ok: false, error: 'Automatisation introuvable : utilise un id de la liste des automatisations.' };
    const enabled = asBool(args.enabled);
    if (enabled === undefined) return { ok: false, error: 'Précise enabled : true (activer) ou false (mettre en pause).' };
    if (cur.enabled === enabled) return { ok: true, unchanged: true, message: enabled ? 'Elle était déjà activée.' : 'Elle était déjà en pause.' };

    const res = await updateAutomation(this.env, this.uid, cur.id, { enabled });
    if (res.ok === false) return this.failure(res);
    const { automation: a } = res.value;
    this.automations = (this.automations || []).map((x) => (x.id === a.id ? a : x));
    this.patch.automationsChanged = true;
    this.record({
      tool: 'set_automation_enabled',
      icon: 'automation',
      title: enabled ? 'Réponse automatique activée' : 'Réponse automatique mise en pause',
      detail: automationDetail(a),
      undo: { type: 'automation_set_enabled', automationId: a.id, enabled: cur.enabled },
      goto: 'automations',
    });
    return { ok: true, id: a.id, enabled: a.enabled, warnings: enabled ? this.warnings() : [] };
  }

  private async deleteAutomationTool(args: any) {
    if (this.automations === null) return { ok: false, error: SETUP_TEXT };
    const cur = this.findAutomation(args.id);
    if (!cur) return { ok: false, error: 'Automatisation introuvable : utilise un id de la liste des automatisations.' };
    const res = await deleteAutomation(this.env, this.uid, cur.id);
    if (res.ok === false) return this.failure(res);
    this.automations = (this.automations || []).filter((x) => x.id !== cur.id);
    this.patch.automationsChanged = true;
    this.record({
      tool: 'delete_automation',
      icon: 'automation',
      title: 'Réponse automatique supprimée',
      detail: `« ${cur.name} »`,
      undo: { type: 'automation_restore', automation: snapshotOf(res.value.deleted) },
      goto: 'automations',
    });
    return { ok: true, deleted: cur.name };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opérations directes : ANNULER une action / ACTIVER une automatisation
// ─────────────────────────────────────────────────────────────────────────────
export type OpResult =
  | { ok: true; message: string; patch: CopilotStatePatch }
  | { ok: false; status: number; error: string };

const NOTE_ID_RE = /^[\w.:-]{1,64}$/;
const NOTE_FIELDS = ['id', 'title', 'content', 'category', 'enabled', 'source', 'createdAt', 'updatedAt', 'confidenceScore', 'occurrencesCount', 'lastReinforcedAt'];

/** Une fiche venant du navigateur (annulation) : on ne garde que les champs connus, re-validés. */
function restoredNote(raw: any, nowIso: string): Note | null {
  if (!raw || typeof raw !== 'object' || !NOTE_ID_RE.test(String(raw.id || ''))) return null;
  const picked: Record<string, unknown> = {};
  for (const k of NOTE_FIELDS) if (raw[k] !== undefined) picked[k] = raw[k];
  const built = buildNote(picked, { id: String(raw.id), now: nowIso, allowAnyCategory: true });
  if (built.ok === false) return null;
  return { ...built.note, ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt.slice(0, 40) } : {}) };
}

const BAD_OP: OpResult = { ok: false, status: 400, error: 'Cette action ne peut plus être annulée.' };
const OP_SAVE_ERROR: OpResult = { ok: false, status: 502, error: 'L’enregistrement a échoué, réessaie dans un instant.' };

export async function applyOp(env: any, uid: string, assistantId: string, assistantRow: Record<string, any>, rawOp: unknown, now: Date = new Date()): Promise<OpResult> {
  const op: any = rawOp && typeof rawOp === 'object' ? rawOp : null;
  if (!op || typeof op.type !== 'string') return BAD_OP;
  const config = supabaseAssistantRowToConfig(assistantRow);

  switch (op.type) {
    case 'knowledge_remove': {
      const notes = normalizeNotes(config.knowledgeNotes);
      const id = String(op.noteId || '');
      if (!notes.some((n) => n.id === id)) return { ok: true, message: 'Cette fiche n’existe plus : rien à annuler.', patch: {} };
      const next = notes.filter((n) => n.id !== id);
      if (!(await writeNotes(env, assistantId, next))) return OP_SAVE_ERROR;
      return { ok: true, message: 'Fiche retirée.', patch: { knowledgeNotes: next } };
    }
    case 'knowledge_restore': {
      const note = restoredNote(op.note, now.toISOString());
      if (!note) return BAD_OP;
      const notes = normalizeNotes(config.knowledgeNotes);
      const exists = notes.some((n) => n.id === note.id);
      const next = exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note];
      if (next.length > COPILOT_LIMITS.maxNotes) return { ok: false, status: 409, error: `La base contient déjà ${COPILOT_LIMITS.maxNotes} fiches.` };
      if (!(await writeNotes(env, assistantId, next))) return OP_SAVE_ERROR;
      return { ok: true, message: exists ? 'Fiche remise comme avant.' : 'Fiche rétablie.', patch: { knowledgeNotes: next } };
    }
    case 'behavior_revert': {
      // Défait CE changement seulement : les autres réglages (faits avant ou après) ne bougent pas.
      const r = op.revert && typeof op.revert === 'object' ? op.revert : null;
      if (!r) return BAD_OP;
      const current = normalizeBehavior(config.behavior);
      const patched = applyBehaviorPatch(current, revertToBehaviorPatch(r), { exactRemove: true });
      if (patched.ok === false) return { ok: false, status: 409, error: patched.error };
      if (!(await writeConfigKey(env, assistantId, 'behavior', patched.behavior))) return OP_SAVE_ERROR;
      return { ok: true, message: 'Façon de répondre remise comme avant.', patch: { behavior: patched.behavior } };
    }
    case 'business_info_revert': {
      const raw = op.set && typeof op.set === 'object' ? op.set : null;
      if (!raw) return BAD_OP;
      const current = normalizeBusinessInfo(config.businessInfo);
      const patched = applyBusinessInfoPatch(current, { phone: raw.phone, address: raw.address, hours: raw.hours, closed_days: raw.closedDays });
      if (patched.ok === false) return { ok: false, status: 409, error: patched.error };
      if (!(await writeConfigKey(env, assistantId, 'businessInfo', patched.info))) return OP_SAVE_ERROR;
      return { ok: true, message: 'Informations remises comme avant.', patch: { businessInfo: patched.info } };
    }
    case 'greeting_restore': {
      let integ: any = null;
      try { integ = await supabaseGetInstagramIntegration(env, uid); } catch { /* ignoré */ }
      if (!integ) return { ok: false, status: 409, error: 'Instagram n’est pas connecté.' };
      await writeGreeting(env, uid, cleanText(op.text, COPILOT_LIMITS.maxGreeting));
      return { ok: true, message: 'Message d’accueil remis comme avant.', patch: { instagramChanged: true } };
    }
    case 'automation_delete': {
      const r = await deleteAutomation(env, uid, String(op.automationId || ''));
      if (r.ok === false) return r.status === 404 ? { ok: true, message: 'Elle n’existe plus : rien à annuler.', patch: { automationsChanged: true } } : { ok: false, status: r.status, error: r.error };
      return { ok: true, message: 'Réponse automatique supprimée.', patch: { automationsChanged: true } };
    }
    case 'automation_set_enabled': {
      if (typeof op.enabled !== 'boolean') return BAD_OP;
      const r = await updateAutomation(env, uid, String(op.automationId || ''), { enabled: op.enabled });
      if (r.ok === false) return { ok: false, status: r.status, error: r.error };
      return { ok: true, message: op.enabled ? 'Réponse automatique activée.' : 'Réponse automatique mise en pause.', patch: { automationsChanged: true } };
    }
    case 'automation_restore': {
      const snap = op.automation;
      if (!snap || typeof snap !== 'object') return BAD_OP;
      const id = String(snap.id || '');
      const input = { name: snap.name, triggerType: snap.triggerType, config: snap.config };
      const existing = await updateAutomation(env, uid, id, { automation: input, enabled: snap.enabled === true });
      if (existing.ok === true) return { ok: true, message: 'Réponse automatique remise comme avant.', patch: { automationsChanged: true } };
      if (existing.status !== 404) return { ok: false, status: existing.status, error: existing.error };
      const back = await reinsertAutomation(env, uid, { id, name: String(snap.name || ''), triggerType: snap.triggerType, enabled: snap.enabled === true, config: snap.config });
      if (back.ok === false) return { ok: false, status: back.status, error: back.error };
      return { ok: true, message: 'Réponse automatique rétablie.', patch: { automationsChanged: true } };
    }
    default:
      return BAD_OP;
  }
}
