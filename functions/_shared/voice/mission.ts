/**
 * JAWEBFLOW — 🎯 La MISSION de l'agent vocal : il ne fait pas que répondre, il
 * travaille pour le commerçant.
 * ============================================================================
 * Le marchand choisit **ce qu'il veut obtenir** (CLOSER) et **comment le
 * demander** (son CTA). L'agent :
 *
 *   • répond aux questions — uniquement avec la base de connaissance du compte ;
 *   • amène la conversation vers le CTA choisi (rendez-vous, devis, commande…) ;
 *   • **enregistre la demande** (nom, téléphone, besoin, date) via l'outil
 *     `enregistrer_demande` — la fiche arrive dans les leads du marchand, marquée
 *     « appel vocal » + le type de demande + le statut « nouveau ».
 *
 * ⚠️ Rien à voir avec « chercher sur Internet » : l'outil n'ajoute AUCUNE
 * connaissance, il **note** ce que le client a dit. L'agent continue de ne rien
 * savoir en dehors de ses fiches.
 */

/** Le nom de la fonction que l'agent appelle au téléphone. */
export const LEAD_TOOL_NAME = 'enregistrer_demande';

export const MISSION_GOALS = ['info', 'lead', 'appointment', 'order', 'support'] as const;
export type MissionGoal = (typeof MISSION_GOALS)[number];

/** Ce que le marchand peut demander à l'agent de récolter. */
export const COLLECT_FIELDS = ['nom', 'telephone', 'email', 'ville', 'besoin', 'date'] as const;
export type CollectField = (typeof COLLECT_FIELDS)[number];

export interface VoiceMission {
  /** Faux = l'agent répond mais ne note rien (aucun outil). */
  enabled: boolean;
  goal: MissionGoal;
  /** Le mot que le marchand veut entendre : « Prendre rendez-vous », « Avoir un devis »… */
  cta: string;
  collect: CollectField[];
}

export const DEFAULT_MISSION: VoiceMission = {
  enabled: true,
  goal: 'lead',
  cta: '',
  collect: ['nom', 'telephone', 'besoin'],
};

/** Ce que chaque objectif veut dire, en clair, pour le modèle. */
const GOAL_LINES: Record<MissionGoal, string> = {
  info:
    "Ton objectif : répondre parfaitement aux questions, puis proposer de noter le client pour qu'on le rappelle.",
  lead:
    "Ton objectif : faire laisser son nom et son numéro au client pour qu'on le rappelle — c'est ce qui compte le plus dans l'appel.",
  appointment:
    "Ton objectif : FIXER UN RENDEZ-VOUS. Demande le jour et l'heure qui arrangent le client, propose un créneau concret s'il hésite, et note le rendez-vous.",
  order:
    "Ton objectif : prendre la demande de commande du client (ce qu'il veut, la quantité) et noter le tout pour l'équipe.",
  support:
    "Ton objectif : comprendre précisément le problème du client et noter son numéro pour qu'on le rappelle avec la solution.",
};

const GOAL_LABELS: Record<MissionGoal, string> = {
  info: 'Renseigner et rappeler',
  lead: 'Laisser ses coordonnées',
  appointment: 'Prendre rendez-vous',
  order: 'Passer une commande',
  support: 'Être rappelé pour un problème',
};

export function missionGoalLabel(goal: MissionGoal): string {
  return GOAL_LABELS[goal] || GOAL_LABELS.lead;
}

const FIELD_LABELS: Record<CollectField, string> = {
  nom: 'le nom',
  telephone: 'le téléphone',
  email: "l'e-mail",
  ville: 'la ville',
  besoin: 'ce dont il a besoin',
  date: "le jour et l'heure qui lui conviennent",
};

const clean = (value: unknown, cap: number) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap);

/** Réglages de mission venus du marchand → objet sûr (jamais d'exception). */
export function normalizedMission(raw: unknown): VoiceMission {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const goal = (MISSION_GOALS as readonly string[]).includes(String(m.goal))
    ? (String(m.goal) as MissionGoal)
    : DEFAULT_MISSION.goal;
  const collectRaw = Array.isArray(m.collect) ? m.collect : DEFAULT_MISSION.collect;
  const collect = collectRaw
    .map((f) => String(f))
    .filter((f): f is CollectField => (COLLECT_FIELDS as readonly string[]).includes(f))
    .slice(0, COLLECT_FIELDS.length);
  return {
    // Opt-in : sans réglage explicite, l'agent note les demandes (c'est ce que
    // le marchand veut dans 100 % des cas) — mais un « non » est respecté.
    enabled: m.enabled === false ? false : true,
    goal,
    cta: clean(m.cta, 60),
    collect: collect.length ? collect : DEFAULT_MISSION.collect.slice(),
  };
}

/**
 * La consigne de mission, telle qu'elle entre dans le prompt (4 lignes maxi).
 * C'est ici que « tout dépend du CTA mentionné » : le modèle pousse vers le CTA
 * choisi par le marchand, et rien d'autre.
 */
export function missionInstruction(mission: VoiceMission): string {
  if (!mission.enabled) return '';
  const cta = mission.cta || missionGoalLabel(mission.goal);
  const champs = mission.collect.map((f) => FIELD_LABELS[f] || f).join(', ');
  return [
    '### 🎯 TA MISSION (elle arrive après les questions du client, jamais avant)',
    GOAL_LINES[mission.goal] || GOAL_LINES.lead,
    cta ? `Le marchand appelle ça : « ${cta} ». Quand le client est d'accord, dis-le avec ces mots : « ${cta} ».` : '',
    `À récolter pendant l'appel : ${champs}. Demande UNE seule chose à la fois, naturellement, jamais comme un formulaire.`,
    `DÈS que tu as ${mission.collect.includes('telephone') ? 'le nom et le numéro' : 'ce qu\'il faut'} : appelle l'outil ${LEAD_TOOL_NAME}, puis confirme au client en une phrase (« c'est noté, on vous rappelle »). Si l'appel se termine sans les coordonnées, propose-les une dernière fois avant de raccrocher.`,
    "Ne dis JAMAIS que tu « enregistres dans un système » : dis simplement que tu notes et qu'on va rappeler.",
  ]
    .filter(Boolean)
    .join('\n');
}

/** Les champs que le modèle doit remplir — dans l'ordre du formulaire. */
export function toolProperties(mission: VoiceMission) {
  const wanted = new Set<string>(mission.collect);
  const props: Record<string, unknown> = {};
  if (wanted.has('nom')) props.nom = { type: 'STRING', description: 'Nom du client, tel qu\'il l\'a dit.' };
  if (wanted.has('telephone'))
    props.telephone = { type: 'STRING', description: 'Numéro de téléphone du client, chiffres et indicatif (ex. 0697660969).' };
  if (wanted.has('email')) props.email = { type: 'STRING', description: "E-mail du client s'il l'a donné." };
  if (wanted.has('ville')) props.ville = { type: 'STRING', description: 'Ville du client.' };
  if (wanted.has('besoin'))
    props.besoin = { type: 'STRING', description: 'Ce que le client veut, en une phrase (produit, service, problème).' };
  if (wanted.has('date'))
    props.date = { type: 'STRING', description: "Jour et heure demandés par le client (ex. « samedi 10h »), s'il s'agit d'un rendez-vous ou d'une livraison." };
  // Le type de demande est toujours utile au marchand : il trie ses leads.
  props.type_demande = {
    type: 'STRING',
    description: 'Nature de la demande : rendez-vous, devis, commande, rappel ou information.',
    enum: ['rendez-vous', 'devis', 'commande', 'rappel', 'information'],
  };
  return props;
}

/**
 * La déclaration d'outil envoyée à Gemini Live (elle voyage DANS le jeton : le
 * navigateur ne peut ni la changer ni en ajouter une autre).
 */
export function leadToolDeclaration(mission: VoiceMission) {
  return {
    name: LEAD_TOOL_NAME,
    description:
      "Enregistre la demande du client dans le registre du commerçant (coordonnées, besoin, rendez-vous) pour qu'on le rappelle. À appeler dès que tu as le nom et le numéro, AVANT de raccrocher. Après l'appel, dis au client que c'est noté.",
    parameters: {
      type: 'OBJECT',
      properties: toolProperties(mission),
      required: mission.collect.includes('telephone') ? ['telephone'] : [],
    },
  };
}

/** L'outil prêt pour le jeton, ou `[]` si le marchand a coupé la mission. */
export function liveTools(mission: VoiceMission) {
  return mission.enabled ? [{ functionDeclarations: [leadToolDeclaration(mission)] }] : [];
}

// ── Les langues de l'assistant ───────────────────────────────────────────────

export const VOICE_LANGUAGES = ['darija', 'ar', 'fr', 'en'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  darija: 'Darija (algérien)',
  ar: 'Arabe',
  fr: 'Français',
  en: 'Anglais',
};

/** Ce que chaque langue veut dire pour le modèle (comment il doit la parler). */
const LANGUAGE_HOW: Record<VoiceLanguage, string> = {
  darija: 'la darija algérienne (écrite en lettres latines si besoin : « wach n9der n3awnek »)',
  ar: "l'arabe simple, compris par tout le monde",
  fr: 'le français simple',
  en: 'un anglais simple',
};

/**
 * La consigne de langue : le client a TOUJOURS le dernier mot — l'agent répond
 * dans la langue où on lui parle, choisie parmi celles que le marchand a
 * cochées. Une langue non cochée : l'agent propose poliment la plus proche.
 */
export function languageInstruction(languages: VoiceLanguage[]): string {
  const wanted = languages.length ? languages : (['darija', 'ar', 'fr'] as VoiceLanguage[]);
  const how = wanted.map((l) => LANGUAGE_HOW[l] || l).join(', ');
  const first = wanted[0];
  return [
    `### 🗣️ LANGUES (${wanted.map((l) => LANGUAGE_LABELS[l] || l).join(' · ')})`,
    `Tu parles ${how} — et tu réponds TOUJOURS dans la langue que le client a utilisée en dernier, jamais dans une autre.`,
    'Si le client mélange les langues, tu fais pareil. S\'il hésite, tu reprends la même langue que lui.',
    first
      ? `C'est le client qui choisit : si tu dois vraiment décider (il ne parle pas encore), commence en ${LANGUAGE_LABELS[first] || first}.`
      : '',
    'Tu ne dis jamais que tu ne comprends pas une langue du client : s\'il parle une langue que tu ne parles pas, tu réponds dans la plus proche de sa liste, poliment, et tu continues l\'appel.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function normalizedLanguages(raw: unknown): VoiceLanguage[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw && raw !== 'auto'
      ? [raw]
      : [];
  const out = list
    .map((l) => String(l))
    .filter((l): l is VoiceLanguage => (VOICE_LANGUAGES as readonly string[]).includes(l));
  return Array.from(new Set(out)).slice(0, VOICE_LANGUAGES.length);
}
