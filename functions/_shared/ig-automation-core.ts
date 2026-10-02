/**
 * JAWEBFLOW — Automatisations Instagram : le CŒUR (logique pure).
 *
 * Aucun accès réseau, aucune API propre à Cloudflare ou au navigateur : ce
 * fichier est utilisé À LA FOIS par le serveur (webhook, API) et par
 * l'interface (aperçu, simulateur, validation). Une seule vérité = ce que le
 * marchand voit dans le simulateur est EXACTEMENT ce que le robot fera.
 *
 *   • normalizeText / matchKeywords : comprendre un commentaire (FR, darija,
 *     arabe, accents, majuscules, émojis).
 *   • renderTemplate : {prenom}, {@pseudo}, {entreprise}.
 *   • sanitizeAutomationInput : valide et nettoie TOUT ce que le client envoie.
 *   • pickAutomation : choisit LA bonne automatisation (la plus précise).
 *   • simulateAutomation : « que se passerait-il si… » sans rien envoyer.
 */

export type TriggerType = 'comment' | 'dm_keyword' | 'story_reply' | 'story_mention';
export type MatchMode = 'any' | 'contains' | 'exact';

export interface LinkButton {
  title: string;
  url: string;
}

export interface AutomationConfig {
  /** Publication visée (déclencheur « commentaire » uniquement). */
  media: { scope: 'any' | 'one'; id?: string; permalink?: string; thumbnail?: string; caption?: string; type?: string };
  /** Quels mots déclenchent l'automatisation. */
  match: { mode: MatchMode; keywords: string[] };
  /** Réponse PUBLIQUE sous le commentaire (une variante au hasard). */
  publicReply: { enabled: boolean; variations: string[] };
  /** Message PRIVÉ (DM). */
  dm: { enabled: boolean; text: string; buttons: LinkButton[] };
  /** « Suis mon compte avant de recevoir le message ». */
  gate: { enabled: boolean; text: string; button: string; retry: string };
  /** Ne servir qu'une fois la même personne. */
  oncePerUser: boolean;
}

export interface AutomationStats {
  triggered: number;
  publicReplies: number;
  dms: number;
  errors: number;
  lastTriggeredAt: string | null;
}

export interface Automation {
  id: string;
  name: string;
  triggerType: TriggerType;
  enabled: boolean;
  config: AutomationConfig;
  stats: AutomationStats;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationInput {
  name?: string;
  triggerType?: TriggerType;
  enabled?: boolean;
  config?: Partial<AutomationConfig> & Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Limites (une seule source : serveur ET interface)
// ─────────────────────────────────────────────────────────────────────────────
export const LIMITS = {
  maxAutomations: 50,
  maxKeywords: 20,
  maxKeywordLength: 40,
  maxVariations: 5,
  maxPublicReplyLength: 400,
  /** Instagram accepte 1000 octets UTF-8 ; on garde de la marge pour les {variables}. */
  maxDmBytes: 850,
  hardDmBytes: 1000,
  maxButtons: 3,
  maxButtonTitle: 20,
  maxName: 80,
  maxGateText: 400,
  maxUrl: 500,
} as const;

export const TRIGGER_TYPES: TriggerType[] = ['comment', 'dm_keyword', 'story_reply', 'story_mention'];

export const TRIGGER_LABELS: Record<TriggerType, { title: string; short: string; description: string }> = {
  comment: {
    title: 'Commentaire sous une publication',
    short: 'Commentaire',
    description: 'Quelqu’un commente un de tes posts ou reels : le robot répond en public et/ou lui écrit en privé.',
  },
  dm_keyword: {
    title: 'Mot-clé dans un message privé',
    short: 'Mot-clé en message privé',
    description: 'Quelqu’un t’écrit « livraison », « prix »… : le robot répond tout de suite avec ton message (sans IA).',
  },
  story_reply: {
    title: 'Réponse à une story',
    short: 'Réponse à une story',
    description: 'Quelqu’un répond à ta story : le robot lui envoie ton message.',
  },
  story_mention: {
    title: 'Mention dans une story',
    short: 'Mention en story',
    description: 'Quelqu’un te mentionne dans sa story : le robot le remercie automatiquement.',
  },
};

/** Variables disponibles dans les messages (et leurs alias acceptés). */
export const TEMPLATE_VARIABLES: Array<{ key: string; label: string; help: string }> = [
  { key: '{@pseudo}', label: '@pseudo', help: 'Mentionne la personne (marche partout).' },
  { key: '{prenom}', label: 'Prénom', help: 'Son prénom — connu seulement dans les messages privés, vide sous un commentaire.' },
  { key: '{entreprise}', label: 'Mon entreprise', help: 'Le nom de ton entreprise.' },
];
const VAR_ALIASES: Record<string, 'pseudo' | '@pseudo' | 'prenom' | 'entreprise'> = {
  'pseudo': 'pseudo',
  '@pseudo': '@pseudo',
  'username': 'pseudo',
  '@username': '@pseudo',
  'prenom': 'prenom',
  'prénom': 'prenom',
  'first_name': 'prenom',
  'firstname': 'prenom',
  'entreprise': 'entreprise',
  'business': 'entreprise',
};

// ─────────────────────────────────────────────────────────────────────────────
// Texte : normalisation + mots-clés
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rend un texte « comparable » : minuscules, sans accents ni voyelles arabes,
 * variantes de lettres arabes unifiées, chiffres arabes → 0-9, ponctuation
 * remplacée par des espaces. Les émojis sont CONSERVÉS (« 🔥 » peut être un mot-clé).
 */
export function normalizeText(input: unknown): string {
  let s = String(input ?? '');
  try { s = s.normalize('NFKD'); } catch { /* environnement ancien */ }
  s = s
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/g, '') // accents + harakat
    .replace(/\u0640/g, '') // tatweel
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  try {
    s = s.replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, ' ');
  } catch {
    s = s.replace(/[^a-z0-9\u0600-\u06ff]+/gi, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

export interface KeywordMatch {
  matched: boolean;
  keyword?: string;
}

/**
 * - any      : n'importe quel texte non vide.
 * - exact    : le texte entier EST un des mots (« prix » ✔, « quel prix ? » ✘).
 * - contains : le texte CONTIENT un des mots (« c'est quoi le prix svp » ✔).
 *   Les très courts mots-clés (< 3 caractères, ex. « ok ») doivent être un mot
 *   entier : « ok » ne se déclenche pas sur « book ».
 */
export function matchKeywords(text: unknown, mode: MatchMode, keywords: string[]): KeywordMatch {
  const raw = String(text ?? '');
  if (!raw.trim()) return { matched: false };
  if (mode === 'any') return { matched: true };
  const t = normalizeText(raw);
  if (!t) return { matched: false };
  const kws = (keywords || [])
    .map((k) => ({ raw: String(k ?? '').trim(), n: normalizeText(k) }))
    .filter((k) => k.n);
  if (!kws.length) return { matched: false };
  const padded = ` ${t} `;
  for (const k of kws) {
    if (mode === 'exact') {
      if (t === k.n) return { matched: true, keyword: k.raw };
      continue;
    }
    // Un mot de 1-2 lettres doit être un mot entier ; un émoji, lui, se cherche partout.
    const short = [...k.n].length < 3 && /[\p{L}\p{N}]/u.test(k.n);
    if (short ? padded.includes(` ${k.n} `) : t.includes(k.n)) return { matched: true, keyword: k.raw };
  }
  return { matched: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Texte : variables, tailles
// ─────────────────────────────────────────────────────────────────────────────
export interface TemplateVars {
  username?: string;
  firstName?: string;
  businessName?: string;
}

const VAR_RE = /\{\{?\s*(@?[\p{L}_]+)\s*\}?\}/gu;

/** Variables utilisées dans un texte qui ne sont PAS reconnues (pour avertir le marchand). */
export function unknownVariables(tpl: string): string[] {
  const bad = new Set<string>();
  for (const m of String(tpl || '').matchAll(VAR_RE)) {
    if (!VAR_ALIASES[m[1].toLowerCase()]) bad.add(`{${m[1]}}`);
  }
  return [...bad];
}

/** Premier prénom « crédible » (un pseudo comme « boutique_dz23 » n'est pas un prénom). */
export function firstNameFrom(name?: string | null): string {
  const n = String(name || '').trim();
  if (!n) return '';
  const first = n.split(/\s+/)[0];
  if (!first || /[0-9_.@]/.test(first) || first.length > 24) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Remplace les variables puis nettoie les espaces laissés par une variable vide. */
export function renderTemplate(tpl: string, vars: TemplateVars = {}): string {
  const username = String(vars.username || '').replace(/^@/, '').trim();
  const values: Record<string, string> = {
    'pseudo': username,
    '@pseudo': username ? `@${username}` : '',
    'prenom': String(vars.firstName || '').trim(),
    'entreprise': String(vars.businessName || '').trim(),
  };
  const out = String(tpl || '').replace(VAR_RE, (whole, key: string) => {
    const canonical = VAR_ALIASES[key.toLowerCase()];
    return canonical ? values[canonical] : whole;
  });
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/ +,/g, ',').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Coupe proprement (jamais au milieu d'un caractère) pour tenir dans `max` octets UTF-8. */
export function truncateToBytes(s: string, max: number): string {
  if (byteLength(s) <= max) return s;
  const ellipsis = '…';
  const budget = max - byteLength(ellipsis);
  let out = '';
  let used = 0;
  for (const ch of s) {
    const b = byteLength(ch);
    if (used + b > budget) break;
    out += ch;
    used += b;
  }
  return out.trimEnd() + ellipsis;
}

export function pickVariation(list: string[], rnd: () => number = Math.random): string | null {
  const clean = (list || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!clean.length) return null;
  return clean[Math.min(clean.length - 1, Math.floor(rnd() * clean.length))];
}

/** Ajoute les liens en clair quand les boutons ne peuvent pas être affichés. */
export function appendLinks(text: string, buttons: LinkButton[]): string {
  if (!buttons.length) return text;
  return `${text}\n\n${buttons.map((b) => `👉 ${b.title} : ${b.url}`).join('\n')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration par défaut + modèles prêts à l'emploi
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ancien texte pré-rempli par l'interface dans « Message d'accueil ». Il a été enregistré chez des
 * marchands qui ne l'ont jamais choisi : on le traite comme « vide » (salutation automatique).
 */
export const LEGACY_DEFAULT_GREETING = 'Salam 👋 Bienvenue sur notre page Instagram ! Comment puis-je vous aider ?';

export const DEFAULT_GATE = {
  text: 'Salut {prenom} 👋 Pour recevoir ton message, suis d’abord mon compte, puis appuie sur le bouton ci-dessous 👇',
  button: '✅ C’est fait',
  retry: 'Je ne vois pas encore ton abonnement 🙈 Suis le compte, puis appuie à nouveau sur le bouton.',
};

export function defaultConfig(trigger: TriggerType): AutomationConfig {
  return {
    media: { scope: 'any' },
    match: { mode: trigger === 'comment' || trigger === 'dm_keyword' ? 'contains' : 'any', keywords: [] },
    publicReply: { enabled: trigger === 'comment', variations: [] },
    dm: { enabled: true, text: '', buttons: [] },
    gate: { enabled: false, ...DEFAULT_GATE },
    oncePerUser: trigger === 'comment',
  };
}

export interface AutomationTemplate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  triggerType: TriggerType;
  name: string;
  config: Partial<AutomationConfig>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'comment-to-dm',
    emoji: '💬',
    title: 'Commentaire ➜ message privé',
    description: 'Quelqu’un commente « prix » ou « info » : tu lui réponds en public et tu lui envoies les détails en privé.',
    triggerType: 'comment',
    name: 'Commentaire « prix » ➜ message privé',
    config: {
      match: { mode: 'contains', keywords: ['prix', 'info', 'lien', 'combien', 'سعر', 'ch7al'] },
      publicReply: {
        enabled: true,
        variations: [
          '{@pseudo} Je t’envoie les détails en message privé 📩',
          'Merci {@pseudo} ! Regarde tes messages privés 😉',
          '{@pseudo} C’est parti, je t’écris en privé 🚀',
        ],
      },
      dm: {
        enabled: true,
        text: 'Salut {prenom} 👋\nMerci pour ton commentaire ! Voici les informations que tu as demandées :\n',
        buttons: [],
      },
    },
  },
  {
    id: 'dm-keyword',
    emoji: '🔑',
    title: 'Réponse automatique à un mot-clé',
    description: 'Quelqu’un t’écrit « livraison », « horaires »… : réponse immédiate avec ton message, sans IA.',
    triggerType: 'dm_keyword',
    name: 'Réponse automatique « livraison »',
    config: {
      match: { mode: 'contains', keywords: ['livraison', 'livrer', 'توصيل'] },
      dm: { enabled: true, text: 'Bonjour {prenom} 👋\nMerci pour votre message ! Voici nos informations de livraison :\n', buttons: [] },
    },
  },
  {
    id: 'story-reply',
    emoji: '📖',
    title: 'Réponse à une story',
    description: 'Quelqu’un réagit à ta story : tu lances la conversation automatiquement.',
    triggerType: 'story_reply',
    name: 'Réponse à mes stories',
    config: {
      match: { mode: 'any', keywords: [] },
      dm: { enabled: true, text: 'Merci {prenom} 🙏 Content que ma story te plaise ! Dis-moi ce que tu veux savoir 😊', buttons: [] },
    },
  },
  {
    id: 'story-mention',
    emoji: '📣',
    title: 'Remerciement pour une mention',
    description: 'Quelqu’un te mentionne dans sa story : tu le remercies tout de suite.',
    triggerType: 'story_mention',
    name: 'Merci pour la mention',
    config: {
      match: { mode: 'any', keywords: [] },
      dm: { enabled: true, text: 'Merci beaucoup pour la mention {prenom} 🙏 Ça nous fait super plaisir ! 💜', buttons: [] },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Validation / nettoyage (TOUT ce qui vient du navigateur passe ici)
// ─────────────────────────────────────────────────────────────────────────────
function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

/** Accepte « boutique.dz/promo » (ajoute https://) ; refuse tout ce qui n'est pas http(s). */
export function normalizeUrl(input: unknown): string | null {
  let u = String(input ?? '').trim();
  if (!u || /\s/.test(u) || u.length > LIMITS.maxUrl) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseKeywords(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,\n;،]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const k = cleanStr(item, LIMITS.maxKeywordLength);
    const n = normalizeText(k);
    if (!k || !n || seen.has(n)) continue;
    seen.add(n);
    out.push(k);
  }
  return out;
}

/** Remet une config (éventuellement ancienne ou incomplète) à la forme attendue, sans rien refuser. */
export function normalizeConfig(trigger: TriggerType, raw: any): AutomationConfig {
  const base = defaultConfig(trigger);
  const c = raw && typeof raw === 'object' ? raw : {};
  const mode: MatchMode = ['any', 'contains', 'exact'].includes(c?.match?.mode) ? c.match.mode : base.match.mode;
  return {
    media: {
      scope: c?.media?.scope === 'one' && c?.media?.id ? 'one' : 'any',
      ...(c?.media?.id ? { id: String(c.media.id) } : {}),
      ...(c?.media?.permalink ? { permalink: String(c.media.permalink) } : {}),
      ...(c?.media?.thumbnail ? { thumbnail: String(c.media.thumbnail) } : {}),
      ...(c?.media?.caption ? { caption: String(c.media.caption) } : {}),
      ...(c?.media?.type ? { type: String(c.media.type) } : {}),
    },
    match: { mode, keywords: Array.isArray(c?.match?.keywords) ? c.match.keywords.map(String) : [] },
    publicReply: {
      enabled: trigger === 'comment' && Boolean(c?.publicReply?.enabled),
      variations: Array.isArray(c?.publicReply?.variations) ? c.publicReply.variations.map(String) : [],
    },
    dm: {
      enabled: c?.dm?.enabled === undefined ? base.dm.enabled : Boolean(c.dm.enabled),
      text: String(c?.dm?.text ?? ''),
      buttons: Array.isArray(c?.dm?.buttons)
        ? c.dm.buttons.map((b: any) => ({ title: String(b?.title ?? ''), url: String(b?.url ?? '') }))
        : [],
    },
    gate: {
      enabled: trigger === 'comment' && Boolean(c?.gate?.enabled),
      text: String(c?.gate?.text || DEFAULT_GATE.text),
      button: String(c?.gate?.button || DEFAULT_GATE.button),
      retry: String(c?.gate?.retry || DEFAULT_GATE.retry),
    },
    oncePerUser: c?.oncePerUser === undefined ? base.oncePerUser : Boolean(c.oncePerUser),
  };
}

export interface SanitizeResult {
  ok: boolean;
  /** Messages en français, prêts à afficher (vide si ok). */
  errors: string[];
  /** Présent seulement si ok. */
  value?: { name: string; triggerType: TriggerType; enabled?: boolean; config: AutomationConfig };
}

/**
 * Valide ce qu'envoie le navigateur. Les messages d'erreur sont en français,
 * lisibles par le marchand (ils s'affichent tels quels dans l'interface).
 * `partial` : pour une simple mise à jour (ex. juste activer/désactiver),
 * seuls les champs fournis sont contrôlés — voir applyPatch côté API.
 */
export function sanitizeAutomationInput(input: AutomationInput | any): SanitizeResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Données invalides.'] };

  const triggerType = input.triggerType as TriggerType;
  if (!TRIGGER_TYPES.includes(triggerType)) return { ok: false, errors: ['Type d’automatisation inconnu.'] };

  const name = cleanStr(input.name, LIMITS.maxName) || TRIGGER_LABELS[triggerType].short;
  const raw = input.config && typeof input.config === 'object' ? input.config : {};
  const cfg = defaultConfig(triggerType);

  // ── Publication visée ──────────────────────────────────────────────────────
  if (triggerType === 'comment') {
    if (raw?.media?.scope === 'one') {
      const id = cleanStr(raw.media.id, 64);
      if (!/^[0-9A-Za-z_-]{5,64}$/.test(id)) errors.push('Choisis la publication concernée (ou « Toutes mes publications »).');
      else {
        cfg.media = {
          scope: 'one',
          id,
          ...(raw.media.permalink && /^https:\/\//.test(String(raw.media.permalink)) ? { permalink: cleanStr(raw.media.permalink, LIMITS.maxUrl) } : {}),
          ...(raw.media.thumbnail && /^https:\/\//.test(String(raw.media.thumbnail)) ? { thumbnail: cleanStr(raw.media.thumbnail, 1200) } : {}),
          ...(raw.media.caption ? { caption: cleanStr(raw.media.caption, 140) } : {}),
          ...(raw.media.type ? { type: cleanStr(raw.media.type, 24) } : {}),
        };
      }
    } else {
      cfg.media = { scope: 'any' };
    }
  }

  // ── Mots-clés ──────────────────────────────────────────────────────────────
  if (triggerType === 'story_mention') {
    cfg.match = { mode: 'any', keywords: [] };
  } else {
    const mode: MatchMode = ['any', 'contains', 'exact'].includes(raw?.match?.mode) ? raw.match.mode : cfg.match.mode;
    const keywords = parseKeywords(raw?.match?.keywords).slice(0, LIMITS.maxKeywords);
    if (triggerType === 'dm_keyword' && mode === 'any') {
      errors.push('Pour les messages privés, indique au moins un mot-clé (sinon le robot répondrait à TOUT et l’IA ne serait plus utilisée).');
    }
    if (mode !== 'any' && keywords.length === 0) errors.push('Ajoute au moins un mot-clé (ex. « prix »).');
    cfg.match = { mode, keywords: mode === 'any' ? [] : keywords };
  }

  // ── Réponse publique ───────────────────────────────────────────────────────
  if (triggerType === 'comment') {
    const enabled = Boolean(raw?.publicReply?.enabled);
    const variations = (Array.isArray(raw?.publicReply?.variations) ? raw.publicReply.variations : [])
      .map((v: unknown) => cleanStr(v, LIMITS.maxPublicReplyLength))
      .filter(Boolean)
      .slice(0, LIMITS.maxVariations);
    if (enabled && variations.length === 0) errors.push('Écris au moins une réponse publique (ou désactive-la).');
    for (const v of variations) {
      const bad = unknownVariables(v);
      if (bad.length) errors.push(`Variable inconnue dans la réponse publique : ${bad.join(', ')}.`);
    }
    cfg.publicReply = { enabled, variations };
  } else {
    cfg.publicReply = { enabled: false, variations: [] };
  }

  // ── Message privé ──────────────────────────────────────────────────────────
  const dmEnabled = triggerType === 'comment' ? Boolean(raw?.dm?.enabled) : true;
  const dmText = cleanStr(raw?.dm?.text, 4000);
  const buttons: LinkButton[] = [];
  for (const b of (Array.isArray(raw?.dm?.buttons) ? raw.dm.buttons : []).slice(0, LIMITS.maxButtons)) {
    const title = cleanStr(b?.title, LIMITS.maxButtonTitle);
    const rawUrl = String(b?.url ?? '').trim();
    if (!title && !rawUrl) continue;
    const url = normalizeUrl(rawUrl);
    if (!title) errors.push('Chaque bouton a besoin d’un titre (20 caractères max).');
    else if (!url) errors.push(`Le lien du bouton « ${title} » n’est pas valide (il doit commencer par https://).`);
    else buttons.push({ title, url });
  }
  if (dmEnabled) {
    if (!dmText) errors.push('Écris le message privé à envoyer.');
    else if (byteLength(dmText) > LIMITS.maxDmBytes) {
      errors.push(`Le message privé est trop long (Instagram limite à environ ${LIMITS.maxDmBytes} caractères en français, moins en arabe).`);
    }
    const bad = unknownVariables(dmText);
    if (bad.length) errors.push(`Variable inconnue dans le message privé : ${bad.join(', ')}.`);
  }
  cfg.dm = { enabled: dmEnabled, text: dmText, buttons };

  if (triggerType === 'comment' && !cfg.publicReply.enabled && !cfg.dm.enabled) {
    errors.push('Active au moins une action : réponse publique ou message privé.');
  }

  // ── Demander de suivre le compte ──────────────────────────────────────────
  if (triggerType === 'comment') {
    const gateEnabled = Boolean(raw?.gate?.enabled) && dmEnabled;
    const gate = {
      enabled: gateEnabled,
      text: cleanStr(raw?.gate?.text, LIMITS.maxGateText) || DEFAULT_GATE.text,
      button: cleanStr(raw?.gate?.button, LIMITS.maxButtonTitle) || DEFAULT_GATE.button,
      retry: cleanStr(raw?.gate?.retry, LIMITS.maxGateText) || DEFAULT_GATE.retry,
    };
    if (gateEnabled) {
      for (const t of [gate.text, gate.retry]) {
        const bad = unknownVariables(t);
        if (bad.length) errors.push(`Variable inconnue dans le message d’abonnement : ${bad.join(', ')}.`);
      }
    }
    cfg.gate = gate;
  } else {
    cfg.gate = { enabled: false, ...DEFAULT_GATE };
  }

  cfg.oncePerUser = raw?.oncePerUser === undefined ? defaultConfig(triggerType).oncePerUser : Boolean(raw.oncePerUser);

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    errors: [],
    value: {
      name,
      triggerType,
      ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
      config: cfg,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Base de données ⇄ objet métier
// ─────────────────────────────────────────────────────────────────────────────
export function rowToAutomation(row: any): Automation {
  const triggerType: TriggerType = TRIGGER_TYPES.includes(row?.trigger_type) ? row.trigger_type : 'comment';
  return {
    id: String(row.id),
    name: String(row.name || TRIGGER_LABELS[triggerType].short),
    triggerType,
    enabled: Boolean(row.enabled),
    config: normalizeConfig(triggerType, row.config),
    stats: {
      triggered: Number(row.triggered_count) || 0,
      publicReplies: Number(row.public_reply_count) || 0,
      dms: Number(row.dm_count) || 0,
      errors: Number(row.error_count) || 0,
      lastTriggeredAt: row.last_triggered_at || null,
    },
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Choisir LA bonne automatisation
// ─────────────────────────────────────────────────────────────────────────────
export interface MatchContext {
  type: TriggerType;
  text?: string;
  mediaId?: string;
}

export interface PickedAutomation {
  automation: Automation;
  keyword?: string;
}

/**
 * Plusieurs automatisations peuvent correspondre : on n'en garde qu'UNE (Meta
 * n'autorise qu'un seul message privé par commentaire, et personne n'aime
 * recevoir deux réponses). Priorité : publication précise > mot-clé précis >
 * « n'importe quel commentaire », puis la plus ancienne.
 */
export function pickAutomation(list: Automation[], ctx: MatchContext): PickedAutomation | null {
  const found: Array<PickedAutomation & { score: number }> = [];
  for (const a of list) {
    if (!a.enabled || a.triggerType !== ctx.type) continue;
    if (ctx.type === 'comment' && a.config.media.scope === 'one' && a.config.media.id !== ctx.mediaId) continue;
    let keyword: string | undefined;
    if (ctx.type !== 'story_mention') {
      const m = matchKeywords(ctx.text, a.config.match.mode, a.config.match.keywords);
      if (!m.matched) continue;
      keyword = m.keyword;
    }
    const score =
      (a.config.media.scope === 'one' ? 100 : 0) +
      (a.config.match.mode === 'exact' ? 20 : a.config.match.mode === 'contains' ? 10 : 0);
    found.push({ automation: a, keyword, score });
  }
  if (!found.length) return null;
  found.sort((x, y) => y.score - x.score || x.automation.createdAt.localeCompare(y.automation.createdAt));
  return { automation: found[0].automation, keyword: found[0].keyword };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construire ce qui sera envoyé (utilisé par le robot ET par le simulateur)
// ─────────────────────────────────────────────────────────────────────────────
export function buildPublicReply(cfg: AutomationConfig, vars: TemplateVars, rnd: () => number = Math.random): string | null {
  if (!cfg.publicReply.enabled) return null;
  const tpl = pickVariation(cfg.publicReply.variations, rnd);
  if (!tpl) return null;
  const text = renderTemplate(tpl, vars);
  return text ? text.slice(0, 2000) : null;
}

export function buildDm(cfg: AutomationConfig, vars: TemplateVars): { text: string; buttons: LinkButton[] } | null {
  if (!cfg.dm.enabled) return null;
  const text = truncateToBytes(renderTemplate(cfg.dm.text, vars), LIMITS.hardDmBytes);
  if (!text) return null;
  return { text, buttons: cfg.dm.buttons.slice(0, LIMITS.maxButtons) };
}

export function buildGate(cfg: AutomationConfig, vars: TemplateVars): { text: string; button: string; retry: string } | null {
  if (!cfg.gate.enabled || !cfg.dm.enabled) return null;
  return {
    text: truncateToBytes(renderTemplate(cfg.gate.text, vars), 600),
    button: cfg.gate.button.slice(0, LIMITS.maxButtonTitle),
    retry: truncateToBytes(renderTemplate(cfg.gate.retry, vars), 600),
  };
}

export interface SimulationInput {
  text: string;
  username?: string;
  firstName?: string;
  mediaId?: string;
  businessName?: string;
}

export interface SimulationResult {
  triggers: boolean;
  reason: string;
  keyword?: string;
  publicReply?: string;
  dm?: { text: string; buttons: LinkButton[] };
  gate?: { text: string; button: string };
}

/** « Que se passerait-il si quelqu'un écrivait ça ? » — sans rien envoyer à Instagram. */
export function simulateAutomation(a: Pick<Automation, 'triggerType' | 'config'>, sample: SimulationInput, rnd: () => number = () => 0): SimulationResult {
  const cfg = a.config;
  const text = String(sample.text || '');
  if (a.triggerType === 'comment' && cfg.media.scope === 'one' && sample.mediaId && sample.mediaId !== cfg.media.id) {
    return { triggers: false, reason: 'Ce commentaire est sous une autre publication que celle choisie.' };
  }
  let keyword: string | undefined;
  if (a.triggerType !== 'story_mention') {
    if (!text.trim()) return { triggers: false, reason: 'Écris un texte pour tester.' };
    const m = matchKeywords(text, cfg.match.mode, cfg.match.keywords);
    if (!m.matched) {
      return {
        triggers: false,
        reason:
          cfg.match.mode === 'exact'
            ? 'Le texte n’est exactement aucun de tes mots-clés.'
            : 'Aucun de tes mots-clés n’apparaît dans ce texte.',
      };
    }
    keyword = m.keyword;
  }
  const vars: TemplateVars = { username: sample.username, firstName: sample.firstName, businessName: sample.businessName };
  const gate = buildGate(cfg, vars);
  return {
    triggers: true,
    reason: keyword ? `Le mot « ${keyword} » est reconnu ✅` : 'Se déclenche ✅',
    keyword,
    publicReply: buildPublicReply(cfg, vars, rnd) || undefined,
    dm: buildDm(cfg, vars) || undefined,
    gate: gate ? { text: gate.text, button: gate.button } : undefined,
  };
}

/** Phrase lisible qui résume une automatisation (carte de la liste). */
export function describeTrigger(a: Pick<Automation, 'triggerType' | 'config'>): string {
  const { match, media } = a.config;
  const words = match.keywords.slice(0, 4).map((k) => `« ${k} »`).join(', ') + (match.keywords.length > 4 ? '…' : '');
  const cond = match.mode === 'any' ? '' : match.mode === 'exact' ? ` est exactement ${words}` : ` contient ${words}`;
  switch (a.triggerType) {
    case 'comment': {
      const where = media.scope === 'one' ? 'sous la publication choisie' : 'sous n’importe laquelle de tes publications';
      return match.mode === 'any' ? `Quand quelqu’un commente ${where}` : `Quand un commentaire${cond} ${where}`;
    }
    case 'dm_keyword':
      return `Quand un message privé${cond}`;
    case 'story_reply':
      return match.mode === 'any' ? 'Quand quelqu’un répond à une de tes stories' : `Quand une réponse à une story${cond}`;
    case 'story_mention':
      return 'Quand quelqu’un te mentionne dans sa story';
  }
}

/** Ce que fait l'automatisation, en une ligne. */
export function describeActions(a: Pick<Automation, 'triggerType' | 'config'>): string {
  const parts: string[] = [];
  if (a.config.publicReply.enabled) parts.push('réponse publique');
  if (a.config.dm.enabled) parts.push(a.config.gate.enabled ? 'message privé (après abonnement)' : 'message privé');
  return parts.length ? `➜ ${parts.join(' + ')}` : '➜ aucune action';
}
