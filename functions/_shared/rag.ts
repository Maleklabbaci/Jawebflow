/**
 * JAWEBFLOW — 🧠 RAG BORNÉ + MISE EN CACHE DU CONTEXTE (les deux leviers d'économie)
 * ============================================================================
 * Deux idées, un seul module :
 *
 * 1. **RAG (ne jamais envoyer ce qui ne sert pas).** Une base de connaissance
 *    de 8 000 caractères envoyée à CHAQUE message coûte cher et dilue
 *    l'attention du modèle. Ici on la découpe en sections, on ne garde que
 *    celles qui parlent de la question, et on s'arrête net au budget
 *    (`budgetChars`) — le reste n'est jamais facturé.
 *
 * 2. **Mise en cache (payer 10 % au lieu de 100 %).** Gemini facture un
 *    « cache read » à 0,025 $/M contre 0,25 $/M en entrée normale (famille 3.x,
 *    Flash-Lite) : **−90 %**. Google n'accepte de créer un cache qu'au-dessus
 *    d'un plancher (4 096 jetons pour la famille Gemini 3) : en dessous, la
 *    création échoue — d'où `cacheableChars()` qui refuse tout ce qui est trop
 *    petit AVANT de dépenser un aller-retour réseau.
 *
 * ⚠️ La donnée vivante (message du client, mémoire, commande, fiches choisies
 * pour CE tour) ne part JAMAIS dans le cache : seule la partie stable
 * (consignes + base entière) est mise en cache, sinon le cache est recréé à
 * chaque message et coûte plus qu'il ne rapporte.
 *
 * Estimation de jetons : `chars / 4` (moyenne française, ~4 caractères par
 * jeton). C'est une estimation volontairement simple : elle sert à DÉCIDER
 * (cache ou pas), jamais à facturer.
 */

import { scoreRelevantText } from './prompt.ts';

/** Ratio moyen retenu pour l'estimation (4 caractères ≈ 1 jeton). */
export const CHARS_PER_TOKEN = 4;

/** Plancher documenté par Google pour créer un cache explicite (famille Gemini 3). */
export const CACHE_MIN_TOKENS = 4_096;

/** Équivalent en caractères du plancher de cache (16 384 caractères). */
export const CACHE_MIN_CHARS = CACHE_MIN_TOKENS * CHARS_PER_TOKEN;

/** Ce qu'on accepte de mettre en cache pour UN assistant (≈ 5 000 jetons). */
export const KB_CACHE_BUDGET_CHARS = 20_000;

/** Plafond du contexte de connaissance envoyé à chaque message (≈ 2 250 jetons). */
export const TURN_RAG_BUDGET_CHARS = 9_000;

/** Budget de la base du site vitrine par message (≈ 650 jetons). */
export const SITE_KB_TURN_BUDGET_CHARS = 2_600;

/** Longueur au-delà de laquelle une section est recoupée (lisibilité du score). */
const SECTION_MAX_CHARS = 1_400;

/** Ce qu'un chatbot doit toujours pouvoir dire, même sur une question floue. */
const ESSENTIAL_RE = /prix|tarif|formule|paiement|payer|contact|telephone|adresse|horaire|livraison|whatsapp|email|e-mail/i;

/** Part maximale du budget réservée aux informations « vitales ». */
const ESSENTIAL_SHARE = 0.45;

const lineHasBullet = (line: string) => /^\s*(?:[•*‣·]|[-–—]\s|\d+[.)]\s)/.test(line);
const lineIsHeading = (line: string) => {
  const trimmed = line.trim();
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Étiquette courte et sans ponctuation de fin (« FORMULES », « Contact : ») —
  // une vraie phrase de contenu n'est jamais prise pour un titre.
  return trimmed.length >= 3 && trimmed.length <= 60 && /^[^\s]/.test(trimmed) &&
    !/[.!?…]$/.test(trimmed) && /[A-ZÀ-Ý]{3}/.test(trimmed);
};

/** ~jetons pour un texte, sans appeler Google (estimation `chars / 4`). */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / CHARS_PER_TOKEN);
}

/** Vrai si un texte est assez gros pour que Google accepte de le mettre en cache. */
export function cacheableChars(chars: number): boolean {
  return Math.max(0, chars) >= CACHE_MIN_CHARS;
}

/** Vrai si l'assemblage consignes + base dépasse le plancher de cache. */
export function cacheableText(...parts: Array<string | undefined | null>): boolean {
  const chars = parts.reduce((total, part) => total + String(part || '').length, 0);
  return cacheableChars(chars);
}

export interface RagPiece {
  /** Nom court, utilisé dans le rapport (`fiches`, `tarifs`, `faq`…). */
  name: string;
  text?: unknown;
}

export interface RagSelection {
  /** Ce qui part réellement dans le prompt. */
  text: string;
  /** Noms des blocs gardés, dans l'ordre d'importance. */
  kept: string[];
  /** Noms des blocs écartés faute de place. */
  dropped: string[];
  /** Nombre de caractères envoyés. */
  chars: number;
  /** Nombre de caractères qui n'ont PAS été envoyés (l'économie). */
  omittedChars: number;
  /** Estimation de jetons envoyés. */
  estimatedTokens: number;
}

/**
 * Assemble des blocs dans l'ordre d'importance en s'arrêtant au budget.
 * Le premier bloc est prioritaire : jamais de coupe au milieu d'un bloc court.
 */
export function fitPieces(pieces: RagPiece[], budgetChars = TURN_RAG_BUDGET_CHARS): RagSelection {
  const budget = Math.max(0, Math.floor(budgetChars));
  const cleaned = (pieces || [])
    .map((piece) => ({ name: String(piece?.name || 'bloc'), text: String(piece?.text ?? '').trim() }))
    .filter((piece) => piece.text.length > 0);
  const totalChars = cleaned.reduce((total, piece) => total + piece.text.length, 0);

  let used = 0;
  const kept: string[] = [];
  const dropped: string[] = [];
  const parts: string[] = [];
  for (const piece of cleaned) {
    if (used + piece.text.length <= budget) {
      parts.push(piece.text);
      used += piece.text.length;
      kept.push(piece.name);
      continue;
    }
    // Il reste un peu de place : on coupe le bloc à la dernière ligne complète
    // plutôt que de le jeter (mieux vaut une fiche partielle que rien).
    const room = budget - used;
    if (room >= 120) {
      const cut = piece.text.slice(0, room);
      const safe = cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)).trim();
      if (safe.length >= 120) {
        parts.push(safe);
        used += safe.length;
        kept.push(piece.name);
        dropped.push(`${piece.name} (fin coupée)`);
        continue;
      }
    }
    dropped.push(piece.name);
  }

  return {
    text: parts.join('\n\n'),
    kept,
    dropped,
    chars: used,
    omittedChars: Math.max(0, totalChars - used),
    estimatedTokens: estimateTokens(used),
  };
}

/**
 * Découpe une base de connaissance en sections indépendantes :
 * titres markdown, blocs séparés par une ligne vide, ou puces de premier niveau
 * (le cas d'une base écrite comme une liste). Les sections trop longues sont
 * recoupées aux fins de phrase pour que le score reste pertinent.
 */
export function splitKnowledgeSections(text: unknown, maxSections = 40): string[] {
  const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];

  const byBlank = raw.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const blocks: string[] = [];
  if (byBlank.length > 1) {
    blocks.push(...byBlank);
  } else {
    // Une seule suite de puces : chaque puce de premier niveau = une section.
    let current: string[] = [];
    for (const line of raw.split('\n')) {
      const topLevel = /^[^\s]/.test(line) && (lineHasBullet(line) || lineIsHeading(line));
      if (topLevel && current.length) {
        blocks.push(current.join('\n').trim());
        current = [];
      }
      current.push(line);
    }
    if (current.length) blocks.push(current.join('\n').trim());
  }

  const sections: string[] = [];
  for (const block of blocks) {
    if (block.length <= SECTION_MAX_CHARS) {
      sections.push(block);
      continue;
    }
    let buffer = '';
    for (const sentence of block.split(/(?<=[.!?])\s+|\n/)) {
      if ((buffer + ' ' + sentence).trim().length > 900 && buffer.trim()) {
        sections.push(buffer.trim());
        buffer = '';
      }
      buffer += (buffer ? ' ' : '') + sentence;
    }
    if (buffer.trim()) sections.push(buffer.trim());
  }

  // Un titre seul sur sa ligne rejoint le texte qu'il annonce (sinon il
  // formerait une « section » de 12 caractères, impossible à scorer).
  const isLoneHeading = (section: string) => {
    // Une seule ligne, courte, sans ponctuation de fin : « ## Livraison »,
    // « FORMULES », « Contact : »… Un titre SUIVI de son texte n'est pas concerné.
    return !section.includes('\n') && section.length <= 60 &&
      !/[.!?…]$/.test(section) && section.split(/\s+/).length <= 7;
  };
  const merged: string[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (isLoneHeading(section)) {
      const next = sections[index + 1];
      if (next) {
        sections[index + 1] = `${section}\n${next}`;
        continue;
      }
      if (merged.length) {
        merged[merged.length - 1] = `${merged[merged.length - 1]}\n${section}`;
        continue;
      }
    }
    merged.push(section);
  }
  return merged.slice(0, Math.max(1, maxSections));
}

export interface KnowledgeSelection extends RagSelection {
  /** Nombre total de caractères de la base d'origine. */
  total: number;
  /** `full` = base courte (envoyée telle quelle), `relevance` = sections choisies,
   *  `head` = repli sur le début de la base (question trop vague). */
  mode: 'full' | 'relevance' | 'head';
}

/**
 * Choisit les sections de la base utiles à LA question.
 *
 * Règles :
 *  • base plus petite que le budget → envoyée entière (aucune perte) ;
 *  • sinon, sections qui contiennent les mots de la question, en gardant de
 *    côté les informations vitales (prix, contact, horaires) plafonnées ;
 *  • question trop vague (bonjour, « ok ») → repli sur le début de la base,
 *    jamais un prompt vide (sinon le bot répondrait « je ne sais pas »).
 */
export function selectKnowledgeSections(
  text: unknown,
  message: string,
  options: { budgetChars?: number; maxSections?: number; fallbackToHead?: boolean } = {},
): KnowledgeSelection {
  const raw = String(text || '').trim();
  const budget = Math.max(200, Math.floor(options.budgetChars ?? SITE_KB_TURN_BUDGET_CHARS));
  const fallbackToHead = options.fallbackToHead !== false;

  if (!raw) {
    return { text: '', kept: [], dropped: [], chars: 0, omittedChars: 0, estimatedTokens: 0, total: 0, mode: 'full' };
  }
  if (raw.length <= budget) {
    return {
      text: raw,
      kept: ['base'],
      dropped: [],
      chars: raw.length,
      omittedChars: 0,
      estimatedTokens: estimateTokens(raw.length),
      total: raw.length,
      mode: 'full',
    };
  }

  const sections = splitKnowledgeSections(raw, options.maxSections ?? 40);
  const ranked = sections.map((section, index) => ({
    section,
    index,
    score: scoreRelevantText(message, '', section),
    essential: ESSENTIAL_RE.test(section),
  }));

  const essentialBudget = Math.floor(budget * ESSENTIAL_SHARE);
  let used = 0;
  const parts: string[] = [];
  const kept: string[] = [];

  const tryAdd = (section: string, remaining: number) => {
    const room = Math.min(remaining, budget - used);
    if (room < 80) return false;
    const chunk = section.length <= room ? section : section.slice(0, room);
    if (chunk.trim().length < 60) return false;
    parts.push(chunk.trim());
    used += chunk.trim().length;
    kept.push(section.slice(0, 40));
    return true;
  };

  for (const item of ranked.filter((entry) => entry.essential).slice(0, 4)) {
    if (used >= essentialBudget) break;
    tryAdd(item.section, essentialBudget - used);
  }

  const relevant = ranked
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of relevant) {
    if (used >= budget) break;
    const already = parts.some((part) => item.section.startsWith(part.slice(0, 60)));
    if (already) continue;
    tryAdd(item.section, budget - used);
  }

  let mode: KnowledgeSelection['mode'] = used > 0 ? 'relevance' : 'head';
  if (used === 0 && fallbackToHead) {
    for (const item of ranked) {
      if (used >= budget) break;
      tryAdd(item.section, budget - used);
    }
    mode = 'head';
  }

  const result = parts.join('\n\n');
  return {
    text: result,
    kept,
    dropped: ranked.filter((entry) => !parts.includes(entry.section)).map((entry) => entry.section.slice(0, 40)),
    chars: result.length,
    omittedChars: Math.max(0, raw.length - result.length),
    estimatedTokens: estimateTokens(result.length),
    total: raw.length,
    mode: mode === 'relevance' && result.length >= raw.length ? 'full' : mode,
  };
}

/** Ligne lisible pour les journaux : ce qui est parti, ce qui a été économisé. */
export function ragReport(selection: RagSelection, label = 'RAG'): string {
  const total = selection.chars + selection.omittedChars;
  const saved = total > 0 ? Math.round((selection.omittedChars / total) * 100) : 0;
  return `${label} : ${selection.chars}/${total} car. envoyés (~${selection.estimatedTokens} jetons, ${saved} % de moins)${
    selection.dropped.length ? ` · écarté : ${selection.dropped.slice(0, 4).join(', ')}` : ''
  }`;
}

/**
 * Phrase affichée dans les diagnostics du chat quand le cache Gemini est actif.
 * Volontairement courte : elle sert au client qui dépanne son widget.
 */
export function cacheDiagnostic(tokens: number, reused: boolean): string {
  return reused
    ? `cache Gemini réutilisé (${tokens} jetons relus à 10 % du prix)`
    : `base de connaissance envoyée en entier (${tokens} jetons, cache en préparation)`;
}
