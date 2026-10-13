/**
 * 🃏 LES CARTES DU CHAT — transformer une réponse de l'assistant en blocs
 * propres : une carte par sujet (titre + puces courtes), des boutons pour les
 * liens, et du texte simple quand il n'y a rien à organiser.
 *
 * Pourquoi ici et pas dans le prompt : on ne demande JAMAIS au modèle de
 * fabriquer du JSON (il se trompe, et le client voit du charabia). On le laisse
 * écrire du **markdown simple** (un titre en gras, des puces, un lien) — ce
 * qu'il fait très bien — et c'est ce fichier qui décide de l'affichage.
 *
 * Le rendu reste lisible si tout va mal : une réponse qui ne ressemble à rien
 * s'affiche exactement comme avant (texte normal).
 */

export interface ChatAction {
  label: string;
  href: string;
}

export type ChatBlock =
  | { kind: 'text'; text: string; actions?: ChatAction[] }
  | { kind: 'card'; title: string; items: string[]; actions: ChatAction[] };

/** Un lien markdown `[libellé](url)` — le seul « bouton » qu'on accepte. */
const LINK_RE = /\[([^\]]{1,60})\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
const BULLET_RE = /^\s*(?:[-*•·‣]|\d+[.)])\s+(.*)$/;
const TITLE_RE = /^\s*(?:\*\*(.+?)\*\*|__(.+?)__|#{1,4}\s*(.+?))\s*[:：]?\s*$/;

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Retire les liens et renvoie aussi les boutons qu'ils portent. */
function extractLinks(text: string): { text: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const out = text.replace(LINK_RE, (_all, label: string, href: string) => {
    actions.push({ label: clean(label), href: String(href).trim() });
    return clean(label);
  });
  return { text: out, actions };
}

function titleOf(line: string): string {
  const m = TITLE_RE.exec(line);
  if (!m) return '';
  return clean(m[1] || m[2] || m[3] || '');
}

/**
 * Découpe un message en blocs affichables.
 *
 * Une « carte » naît d'un groupe de puces (2 minimum) — avec ou sans titre — ou
 * d'un titre en gras suivi de lignes courtes. Tout le reste reste du texte.
 */
export function parseChatBlocks(raw: unknown, opts: { maxItems?: number } = {}): ChatBlock[] {
  const maxItems = Math.min(Math.max(opts.maxItems ?? 6, 1), 10);
  const source = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];

  const blocks: ChatBlock[] = [];
  // Une ligne vide sépare deux blocs. Les puces restent groupées même si le
  // modèle les a collées sans ligne vide (c'est le cas le plus fréquent).
  const sections = source
    .split(/\n{2,}/)
    .flatMap((section) => splitSection(section))
    .filter((section) => section.length);
  void sections;

  for (const section of sections) {
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const actions: ChatAction[] = [];
    const bullets: string[] = [];
    const texts: string[] = [];
    let title = '';

    for (const line of lines) {
      const bullet = BULLET_RE.exec(line);
      const found = extractLinks(bullet ? bullet[1] : line);
      actions.push(...found.actions);
      const content = clean(found.text);
      if (!content) continue;
      if (bullet) {
        bullets.push(content);
        continue;
      }
      if (!bullets.length && !title) {
        title = titleOf(line) || (content.length <= 48 ? content : '');
        if (title) continue;
      }
      texts.push(content);
    }

    if (bullets.length >= 2 || (bullets.length === 1 && title)) {
      if (texts.length) blocks.push({ kind: 'text', text: texts.join(' ') });
      blocks.push({ kind: 'card', title, items: bullets.slice(0, maxItems), actions });
      continue;
    }

    const remaining = [...texts, ...bullets];
    if (remaining.length) {
      blocks.push({ kind: 'text', text: remaining.join('\n'), ...(actions.length ? { actions } : {}) });
    } else if (actions.length) {
      blocks.push({ kind: 'card', title, items: [], actions });
    } else if (title) {
      blocks.push({ kind: 'text', text: title });
    }
  }

  return blocks;
}

/** Découpe un paragraphe quand le modèle colle un titre juste après des puces. */
function splitSection(section: string): string[] {
  const lines = section.split('\n');
  const out: string[][] = [];
  let current: string[] = [];
  let seenBullet = false;
  for (const line of lines) {
    const isBullet = BULLET_RE.test(line);
    // Une ligne de titre APRÈS des puces commence une nouvelle carte.
    if (seenBullet && !isBullet && titleOf(line)) {
      out.push(current);
      current = [];
      seenBullet = false;
    }
    if (isBullet) seenBullet = true;
    current.push(line);
  }
  if (current.length) out.push(current);
  return out.map((chunk) => chunk.join('\n').trim()).filter(Boolean);
}

/** Vrai si le message mérite un rendu en cartes (sinon : texte normal). */
export function hasCards(blocks: ChatBlock[]): boolean {
  return blocks.some((b) => b.kind === 'card' && (b.items.length > 0 || b.actions.length > 0));
}

/** Le texte brut d'un message, sans balisage (pour le copier/coller, les logs). */
export function plainText(raw: unknown): string {
  return String(raw ?? '')
    .replace(LINK_RE, (_all, label: string) => label)
    .replace(/[*_#]/g, '')
    .trim();
}
