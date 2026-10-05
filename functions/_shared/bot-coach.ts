/**
 * JAWEBFLOW — LE COACH DU BOT
 * ------------------------------------------------------------
 * Le marchand ne sait pas toujours quoi ajouter pour que son robot vende mieux.
 * Ce module regarde l'état RÉEL de l'assistant (fiches, infos officielles,
 * questions restées sans réponse, règles, sécurité…) et en tire un PLAN
 * d'amélioration ordonné : quoi faire, pourquoi, et dans quel écran.
 *
 * Aucune base, aucun réseau : logique pure, testable à froid. Il est branché
 *   • dans « Mon IA » (le copilot propose et exécute les étapes),
 *   • dans le tableau de bord (carte « Développez votre bot »).
 */

export type CoachPriority = 'urgent' | 'important' | 'bonus';

export type CoachStepId =
  | 'knowledge'
  | 'contact'
  | 'questions'
  | 'rules'
  | 'site'
  | 'instagram'
  | 'security'
  | 'handoff'
  | 'tone'
  | 'test';

export type CoachStep = {
  id: CoachStepId;
  priority: CoachPriority;
  title: string;
  /** Pourquoi ça change quelque chose pour le marchand. */
  why: string;
  /** Comment le faire, en une phrase simple. */
  how: string;
  /** Écran du menu à ouvrir (DashboardSectionId), si applicable. */
  section?: string;
  /** Complément affiché (ex. la question la plus posée). */
  detail?: string;
  done: boolean;
};

export type CoachInput = {
  businessName?: string;
  businessDescription?: string;
  businessCategory?: string;
  websiteUrl?: string;
  businessInfo?: { phone?: unknown; address?: unknown; hours?: unknown; closedDays?: unknown } | null;
  knowledgeCount?: number;
  /** Questions que le robot n'a pas su traiter (onglet « Apprentissage IA »). */
  openQuestions?: { question?: unknown; occurrences?: unknown }[] | null;
  /** Règles du commerçant (règles spéciales + consignes personnalisées). */
  rulesText?: string;
  assistantTone?: string;
  whatsappEscalation?: string;
  widgetKey?: string;
  allowedDomains?: string[] | string | null;
  /** undefined = on ne sait pas (ex. depuis le tableau de bord) → étape ignorée. */
  instagramConnected?: boolean;
  /** Le marchand a déjà testé son robot dans le simulateur. */
  simulatorTested?: boolean;
};

export type CoachPlan = {
  steps: CoachStep[];
  /** Ce qu'il reste à faire, dans l'ordre. */
  next: CoachStep[];
  done: number;
  total: number;
  /** Pourcentage de préparation (0-100). */
  score: number;
};

const PRIORITY_ORDER: Record<CoachPriority, number> = { urgent: 0, important: 1, bonus: 2 };

const has = (v: unknown): boolean => String(v ?? '').trim().length > 0;

function domainCount(value: CoachInput['allowedDomains']): number {
  if (Array.isArray(value)) return value.filter((v) => has(v)).length;
  if (typeof value === 'string') return value.split(/[\n,]+/).filter((v) => has(v)).length;
  return 0;
}

/** Le plan d'amélioration de l'assistant, ordonné par priorité. */
export function buildCoachPlan(input: CoachInput = {}): CoachPlan {
  const steps: CoachStep[] = [];
  const info = input.businessInfo || {};
  const missingInfo = (['phone', 'address', 'hours'] as const).filter((k) => !has(info[k]));
  const knowledgeCount = Number(input.knowledgeCount || 0);
  const openQuestions = (input.openQuestions || []).filter((q) => has(q.question));
  const topQuestion = openQuestions
    .slice()
    .sort((a, b) => Number(b.occurrences || 1) - Number(a.occurrences || 1))[0];

  // 1. La base de connaissances : sans elle, le robot ne sait rien.
  steps.push({
    id: 'knowledge',
    priority: knowledgeCount === 0 ? 'urgent' : 'important',
    title: knowledgeCount === 0
      ? 'Ajoutez vos premières informations (produits, prix, conditions)'
      : `Complétez vos informations (${knowledgeCount} fiche${knowledgeCount > 1 ? 's' : ''} aujourd'hui)`,
    why: "C'est la seule source du robot : sans fiche, il improvise ou répond « je ne sais pas ».",
    how: 'Une fiche = un produit ou un sujet, avec les prix et conditions exacts. Visez au moins 5 fiches.',
    section: 'knowledge',
    done: knowledgeCount >= 5,
  });

  // 2. Les informations officielles (téléphone, adresse, horaires).
  steps.push({
    id: 'contact',
    priority: 'urgent',
    title: missingInfo.length ? `Renseignez ${missingInfo.length} information(s) officielle(s)` : 'Informations officielles complètes',
    why: 'Le robot les cite mot pour mot : un client qui demande « où êtes-vous ? » doit avoir la bonne adresse.',
    how: 'Téléphone, adresse, horaires, jours fermés — onglet « Mon profil ».',
    section: 'settings',
    done: missingInfo.length === 0,
  });

  // 3. Les questions restées sans réponse : c'est de l'argent perdu.
  steps.push({
    id: 'questions',
    priority: openQuestions.length > 0 ? 'urgent' : 'important',
    title: openQuestions.length
      ? `Répondez aux ${openQuestions.length} question(s) que le robot n'a pas su traiter`
      : 'Aucune question en attente',
    why: 'Chaque question sans réponse est un client qui part. Répondre une fois suffit : le robot saura toujours.',
    how: 'Onglet « Apprentissage » : écrivez la bonne réponse, elle part dans la base de connaissances.',
    section: 'learning',
    detail: topQuestion
      ? `La plus fréquente : « ${String(topQuestion.question).slice(0, 90)} »${Number(topQuestion.occurrences || 1) > 1 ? ` (posée ${topQuestion.occurrences} fois)` : ''}`
      : undefined,
    done: openQuestions.length === 0,
  });

  // 4. Les règles du commerçant : la voix de la maison.
  steps.push({
    id: 'rules',
    priority: 'important',
    title: has(input.rulesText) ? 'Règles du commerçant définies' : 'Donnez vos règles absolues au robot',
    why: "Elles ont la priorité sur tout le reste : ton, interdits, ce qu'il ne faut jamais promettre.",
    how: 'Ex. « Tutoie toujours le client. », « Ne promets jamais une livraison en 24 h. » (2 à 5 règles courtes).',
    section: 'behavior',
    done: has(input.rulesText),
  });

  // 5. Le site officiel : source automatique d'informations.
  steps.push({
    id: 'site',
    priority: 'important',
    title: has(input.websiteUrl) ? 'Site officiel renseigné' : 'Indiquez votre site web',
    why: 'Le robot peut en tirer vos informations et renvoyer le client vers la bonne page.',
    how: 'Renseignez l’adresse puis lancez un scan (« Mettre sur mon site » / « Scanner »).',
    section: 'crawler',
    done: has(input.websiteUrl),
  });

  // 6. Instagram (seulement si on connaît l'état de la connexion).
  if (input.instagramConnected !== undefined) {
    steps.push({
      id: 'instagram',
      priority: 'important',
      title: input.instagramConnected ? 'Instagram connecté' : 'Connectez votre compte Instagram',
      why: 'Vos clients écrivent et commentent là-bas : le robot peut répondre, relancer et qualifier.',
      how: 'Onglet « Instagram » → autoriser l’accès, puis activer les réponses aux commentaires.',
      section: 'instagram',
      done: input.instagramConnected === true,
    });
  }

  // 7. La sécurité du widget : protéger le robot des autres sites.
  const secured = has(input.widgetKey) && domainCount(input.allowedDomains) > 0;
  steps.push({
    id: 'security',
    priority: 'bonus',
    title: secured ? 'Widget protégé' : 'Protégez votre robot (clé + domaines autorisés)',
    why: "Sans ça, n'importe quel site peut utiliser votre robot et vos informations à votre place.",
    how: '« Mon profil » → « Sécurité & équipe » : générez une clé et listez vos domaines.',
    section: 'settings',
    done: secured,
  });

  // 8. Le relais humain.
  steps.push({
    id: 'handoff',
    priority: 'bonus',
    title: has(input.whatsappEscalation) ? 'Relais humain défini' : 'Donnez un contact humain de secours',
    why: 'Quand le robot ne peut pas aider, le client doit pouvoir parler à quelqu’un — pas disparaître.',
    how: 'Un numéro WhatsApp : le robot le propose quand il est bloqué.',
    section: 'settings',
    done: has(input.whatsappEscalation),
  });

  // 9. Le ton.
  steps.push({
    id: 'tone',
    priority: 'bonus',
    title: has(input.assistantTone) ? 'Ton défini' : 'Définissez le ton de votre robot',
    why: 'Un robot qui parle comme vous rassure ; un robot neutre fait « service client ».',
    how: 'Ex. « Chaleureux, tutoiement, phrases courtes, comme un vendeur de boutique. »',
    section: 'behavior',
    done: has(input.assistantTone),
  });

  // 10. Le test dans le simulateur.
  steps.push({
    id: 'test',
    priority: 'important',
    title: input.simulatorTested ? 'Robot testé' : 'Testez votre robot avant de le publier',
    why: 'Posez-lui les 5 questions que vos clients posent vraiment : vous verrez tout de suite les trous.',
    how: 'Onglet « Simulateur » : écrivez comme un client, corrigez ce qui cloche.',
    section: 'simulator',
    done: input.simulatorTested === true,
  });

  steps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const next = steps.filter((s) => !s.done);
  const done = steps.length - next.length;
  return {
    steps,
    next,
    done,
    total: steps.length,
    score: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}

/** Une phrase d'encouragement honnête selon l'avancement. */
export function coachHeadline(plan: CoachPlan): string {
  if (plan.total === 0) return 'Votre robot est prêt.';
  if (plan.next.length === 0) return 'Votre robot est prêt : tout est en place. 🎉';
  if (plan.score >= 70) return `Presque prêt (${plan.score} %) : encore ${plan.next.length} point(s) à régler.`;
  if (plan.score >= 40) return `Bien démarré (${plan.score} %) : ${plan.next.length} point(s) à régler pour vendre plus.`;
  return `À construire (${plan.score} %) : ${plan.next.length} point(s) vous séparent d'un robot qui vend.`;
}

/** Version texte pour « Mon IA » : l'IA s'en sert pour orienter le marchand. */
export function coachPlanText(plan: CoachPlan, max = 5): string {
  if (!plan.next.length) return 'Aucune amélioration en attente : l’assistant est complet.';
  const lines = plan.next.slice(0, max).map((s, i) => {
    const where = s.section ? ` (écran « ${s.section} »)` : '';
    return `${i + 1}. ${s.title}${where} — ${s.why}${s.detail ? ` ${s.detail}` : ''}`;
  });
  if (plan.next.length > max) lines.push(`(+ ${plan.next.length - max} autre(s) point(s) moins prioritaires)`);
  return lines.join('\n');
}
