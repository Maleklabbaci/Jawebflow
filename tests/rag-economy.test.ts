import { describe, expect, it } from 'vitest';
import {
  CACHE_MIN_CHARS,
  CACHE_MIN_TOKENS,
  KB_CACHE_BUDGET_CHARS,
  cacheableChars,
  cacheableText,
  cacheDiagnostic,
  estimateTokens,
  fitPieces,
  ragReport,
  selectKnowledgeSections,
  splitKnowledgeSections,
} from '../functions/_shared/rag';
import { buildCacheKnowledgeBlock, buildSalesSystemPrompt } from '../functions/_shared/prompt';
import { buildSiteChatPrompt, DEFAULT_SITE_CHAT, DEFAULT_SITE_KNOWLEDGE } from '../functions/_shared/site-chat';

const note = (title: string, content: string, category = 'produit', extra: Record<string, unknown> = {}) => ({
  title,
  content,
  category,
  enabled: true,
  approvalStatus: 'active',
  ...extra,
});

describe('estimation et plancher de cache', () => {
  it('estime 4 caractères par jeton', () => {
    expect(estimateTokens(400)).toBe(100);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
  });

  it('refuse le cache sous le plancher Google (4 096 jetons = 16 384 caractères)', () => {
    expect(CACHE_MIN_TOKENS).toBe(4_096);
    expect(CACHE_MIN_CHARS).toBe(16_384);
    expect(cacheableChars(CACHE_MIN_CHARS)).toBe(true);
    expect(cacheableChars(CACHE_MIN_CHARS - 1)).toBe(false);
    // Le prompt d'un commerçant normal (consignes + base) reste très en dessous.
    expect(cacheableText('x'.repeat(7_200), 'y'.repeat(3_000))).toBe(false);
  });

  it('accepte le cache quand consignes + base complète dépassent le plancher', () => {
    const notes = Array.from({ length: 40 }, (_, i) => note(`Article ${i}`, 'Descriptif détaillé du produit avec ses variantes et son prix. '.repeat(10)));
    const block = buildCacheKnowledgeBlock(notes);
    expect(block.length).toBeGreaterThan(CACHE_MIN_CHARS - 7_500);
    expect(cacheableText(buildSalesSystemPrompt({ businessName: 'Boutique Test' }), block)).toBe(true);
  });
});

describe('sélection RAG', () => {
  it('envoie une base courte en entier (aucune perte)', () => {
    const selection = selectKnowledgeSections(DEFAULT_SITE_KNOWLEDGE, 'combien ça coûte ?');
    expect(selection.mode).toBe('full');
    expect(selection.text).toBe(DEFAULT_SITE_KNOWLEDGE);
    expect(selection.omittedChars).toBe(0);
  });

  it('découpe une base en sections (puces de premier niveau, titres, lignes vides)', () => {
    const sections = splitKnowledgeSections(DEFAULT_SITE_KNOWLEDGE);
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.join('\n')).toContain('Formules');
    const byBlank = splitKnowledgeSections('## Livraison\n48 wilayas.\n\n## Paiement\nBaridiMob, CCP ou virement.');
    expect(byBlank).toHaveLength(2);
  });

  it('ne garde que les sections utiles à la question, dans le budget', () => {
    const filler = 'Section sans rapport avec la question posée. '.repeat(14); // ~660 car.
    const knowledge = [
      'TARIFS ET FORMULES',
      'Basic : 10 $ par mois pour 500 conversations. Pro : 20 $ par mois pour 1 500 conversations.',
      'LIVRAISON ET INSTALLATION',
      'Le widget s’installe avec une ligne de code, compatible WordPress et Shopify.',
      filler,
      filler,
      filler,
    ].join('\n\n');
    expect(knowledge.length).toBeGreaterThan(2_000);

    const selection = selectKnowledgeSections(knowledge, 'les tarifs svp', { budgetChars: 900 });
    expect(selection.chars).toBeLessThanOrEqual(900);
    expect(selection.chars).toBeGreaterThan(0);
    expect(selection.text).toMatch(/10 \$|500 conversations/);
    expect(selection.text).not.toContain('sans rapport');
    expect(selection.mode).toBe('relevance');
  });

  it('garde les informations vitales (contact, horaires) même sur une question vague', () => {
    const knowledge = [
      'CONTACT',
      'Téléphone : 0555 00 00 00 — WhatsApp et adresse à Alger.',
      'PRODUITS',
      'Catalogue de produits divers. '.repeat(20),
      'DIVERS',
      'Texte de remplissage sans intérêt. '.repeat(30),
    ].join('\n\n');
    const selection = selectKnowledgeSections(knowledge, 'bonjour', { budgetChars: 700 });
    expect(selection.chars).toBeGreaterThan(0); // jamais un prompt vide
    expect(selection.text).toContain('0555 00 00 00');
  });

  it('une question totalement hors sujet garde le début de la base plutôt que rien', () => {
    const knowledge = Array.from({ length: 8 }, (_, i) => `BLOC ${i}\n${'contenu générique. '.repeat(40)}`).join('\n\n');
    const selection = selectKnowledgeSections(knowledge, 'zzz', { budgetChars: 600 });
    expect(selection.mode).toBe('head');
    expect(selection.chars).toBeGreaterThan(0);
    expect(selection.dropped.length).toBeGreaterThan(0);
  });

  it('réduit réellement ce qui part à chaque message quand la base est grosse', () => {
    const big = `${DEFAULT_SITE_KNOWLEDGE}\n\n${DEFAULT_SITE_KNOWLEDGE.replace('JAWEBFLOW — l’essentiel', 'CATALOGUE DÉTAILLÉ')}\n\n${'DIVERS\n' + 'Information de remplissage. '.repeat(60)}`;
    const selection = selectKnowledgeSections(big, 'combien ça coûte ?', { budgetChars: 2_600 });
    const grandChat = { ...DEFAULT_SITE_CHAT, ai: { ...DEFAULT_SITE_CHAT.ai, knowledge: big } };
    // 🧩 Les instructions système ne portent QUE les règles : elles ne changent
    // plus avec la base (c'est le contexte du tour qui la transporte).
    const regles = buildSiteChatPrompt(grandChat);
    expect(regles).not.toContain('BASIC');           // aucune donnée du commerce dans les règles
    // Un prompt de RÈGLES seulement : ~1 000 jetons, et surtout il ne bouge
    // plus d'un message à l'autre (donc cacheable tel quel).
    expect(regles.length).toBeLessThan(4_500);

    // Ce qui part réellement chez Google à chaque message = règles + contexte du tour.
    const before = regles.length + big.length;                     // avant : la base entière
    const trimmed = regles.length + selection.text.length;          // maintenant : la sélection
    expect(selection.chars).toBeLessThanOrEqual(2_600);
    expect(before).toBeGreaterThan(8_000);           // la base entière envoyée à chaque message…
    expect(trimmed).toBeLessThan(before);            // …contre la sélection utile seulement
    expect(before - trimmed).toBeGreaterThan(2_600); // l'économie du tour
    expect(selection.text).toMatch(/Basic|500 conversations/); // et les tarifs restent là
  });
});

describe('assemblage budgété des blocs', () => {
  it('garde l’ordre d’importance et écarte ce qui dépasse le budget', () => {
    const selection = fitPieces(
      [
        { name: 'fiches', text: 'A'.repeat(900) },
        { name: 'faq', text: 'B'.repeat(900) },
        { name: 'tarifs', text: 'C'.repeat(900) },
      ],
      2_000,
    );
    expect(selection.kept).toEqual(['fiches', 'faq']);
    expect(selection.dropped).toEqual(['tarifs']);
    expect(selection.chars).toBe(1_800);
    expect(selection.omittedChars).toBe(900);
    expect(selection.estimatedTokens).toBe(450);
    expect(selection.text.indexOf('A')).toBeLessThan(selection.text.indexOf('B'));
  });

  it('coupe proprement un bloc trop long au lieu de le jeter', () => {
    const selection = fitPieces([{ name: 'fiches', text: ['ligne '.repeat(40), 'ligne '.repeat(40)].join('\n') }], 300);
    expect(selection.chars).toBeLessThanOrEqual(300);
    expect(selection.kept).toEqual(['fiches']);
    expect(selection.dropped[0]).toContain('fin coupée');
  });

  it('ignore les blocs vides et borne le budget', () => {
    const selection = fitPieces([{ name: 'fiches', text: '' }, { name: 'faq', text: '   ' }], 1_000);
    expect(selection.text).toBe('');
    expect(selection.kept).toEqual([]);
    expect(selection.chars).toBe(0);
  });
});

describe('bloc « cache » de la base de connaissance', () => {
  it('exclut les fiches refusées, en attente ou désactivées', () => {
    const block = buildCacheKnowledgeBlock([
      note('Coque rouge', 'Coque rouge en silicone, 1 900 DA.'),
      note('Masquée', 'Contenu masqué', 'produit', { enabled: false }),
      note('En attente', 'Contenu non validé', 'produit', { approvalStatus: 'pending_review' }),
      note('Refusée', 'Contenu refusé', 'produit', { approvalStatus: 'rejected' }),
    ]);
    expect(block).toContain('Coque rouge');
    expect(block).not.toContain('Contenu masqué');
    expect(block).not.toContain('non validé');
    expect(block).not.toContain('Contenu refusé');
  });

  it('met les informations vitales en tête et respecte le budget', () => {
    const notes = [
      note('Produit 1', 'Description. '.repeat(30)),
      note('Livraison', 'Livraison 48 wilayas en 48 h.', 'livraison'),
      note('Produit 2', 'Description. '.repeat(30)),
      note('Produit 3', 'Description. '.repeat(30)),
    ];
    const block = buildCacheKnowledgeBlock(notes, 1_800);
    expect(block.indexOf('Livraison')).toBeLessThan(block.indexOf('Produit 1'));
    expect(block.replace(/^.*BASE DE CONNAISSANCE.*$/m, '').length).toBeLessThanOrEqual(1_800 + 80);
  });

  it('renvoie une chaîne vide sans fiche exploitable', () => {
    expect(buildCacheKnowledgeBlock([])).toBe('');
    expect(buildCacheKnowledgeBlock([note('X', '   ')])).toBe('');
    expect(buildCacheKnowledgeBlock([note('X', 'contenu', 'produit', { enabled: false })])).toBe('');
  });

  it('le budget de cache reste borné (stockage facturé à l’heure)', () => {
    expect(KB_CACHE_BUDGET_CHARS).toBeLessThanOrEqual(20_000);
    expect(estimateTokens(KB_CACHE_BUDGET_CHARS)).toBeLessThanOrEqual(5_000);
  });
});

describe('rapports lisibles', () => {
  it('affiche l’économie en pourcentage', () => {
    const report = ragReport({
      text: 'x'.repeat(400),
      kept: ['fiches'],
      dropped: ['faq'],
      chars: 400,
      omittedChars: 600,
      estimatedTokens: 100,
    });
    expect(report).toContain('400/1000');
    expect(report).toContain('60 %');
    expect(report).toContain('faq');
  });

  it('explique le cache en une phrase', () => {
    expect(cacheDiagnostic(5_100, true)).toMatch(/cache Gemini réutilisé/i);
    expect(cacheDiagnostic(5_100, true)).toMatch(/10 %/);
    expect(cacheDiagnostic(1_300, false)).toMatch(/envoyée en entier/i);
  });
});
