import { describe, expect, it } from 'vitest';
import { buildCoachPlan, coachHeadline, coachPlanText } from '../functions/_shared/bot-coach';
import { buildContextBlock, normalizeBehavior, normalizeBusinessInfo } from '../functions/_shared/copilot-core';

const EMPTY = {
  businessName: 'Boutique Test',
  businessInfo: {},
  knowledgeCount: 0,
  openQuestions: [],
  rulesText: '',
  assistantTone: '',
  whatsappEscalation: '',
  widgetKey: '',
  allowedDomains: [],
};

const COMPLETE = {
  businessName: 'Boutique Test',
  websiteUrl: 'https://boutique-test.dz',
  businessInfo: { phone: '0555', address: 'Alger', hours: '9h-18h' },
  knowledgeCount: 7,
  openQuestions: [],
  rulesText: 'Tutoie toujours le client.',
  assistantTone: 'Chaleureux',
  whatsappEscalation: '+213555000000',
  widgetKey: 'wk_abc',
  allowedDomains: ['https://boutique-test.dz'],
  instagramConnected: true,
  simulatorTested: true,
};

describe('le coach du bot', () => {
  it('un assistant vide commence par la base de connaissances', () => {
    const plan = buildCoachPlan(EMPTY);
    expect(plan.next.length).toBeGreaterThan(0);
    expect(plan.next[0].id).toBe('knowledge');
    expect(plan.next[0].priority).toBe('urgent');
    expect(plan.score).toBeLessThan(50);
  });

  it('les questions sans réponse deviennent urgentes et citent la plus fréquente', () => {
    const plan = buildCoachPlan({
      ...EMPTY,
      knowledgeCount: 6,
      openQuestions: [
        { question: 'Vous livrez à Oran ?', occurrences: 2 },
        { question: 'C’est quoi le prix du jean ?', occurrences: 9 },
      ],
    });
    const step = plan.steps.find((s) => s.id === 'questions');
    expect(step?.priority).toBe('urgent');
    expect(step?.done).toBe(false);
    expect(step?.detail).toContain('prix du jean');
    expect(step?.detail).toContain('9 fois');
  });

  it('un assistant complet n’a plus rien à faire', () => {
    const plan = buildCoachPlan(COMPLETE);
    expect(plan.next).toHaveLength(0);
    expect(plan.score).toBe(100);
    expect(coachHeadline(plan)).toContain('prêt');
  });

  it('l’étape Instagram n’apparaît que si l’on connaît l’état de la connexion', () => {
    expect(buildCoachPlan(EMPTY).steps.some((s) => s.id === 'instagram')).toBe(false);
    const plan = buildCoachPlan({ ...EMPTY, instagramConnected: false });
    const step = plan.steps.find((s) => s.id === 'instagram');
    expect(step?.done).toBe(false);
  });

  it('la sécurité demande la clé ET au moins un domaine', () => {
    expect(buildCoachPlan({ ...EMPTY, widgetKey: 'wk_x' }).steps.find((s) => s.id === 'security')?.done).toBe(false);
    expect(buildCoachPlan({ ...EMPTY, widgetKey: 'wk_x', allowedDomains: 'a.dz, b.dz' }).steps.find((s) => s.id === 'security')?.done).toBe(true);
  });

  it('le texte du plan est ordonné et indique l’écran concerné', () => {
    const text = coachPlanText(buildCoachPlan(EMPTY), 3);
    const lines = text.split('\n');
    // 3 étapes listées + une ligne qui dit combien il en reste
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^1\. /);
    expect(lines[0]).toContain('écran «');
    expect(lines[3]).toMatch(/^\(\+ \d+ autre/);
    expect(coachPlanText(buildCoachPlan(COMPLETE))).toContain('Aucune amélioration');
  });

  it('« Mon IA » voit le plan dans ses données (il peut donc orienter le marchand)', () => {
    const block = buildContextBlock({
      businessName: 'Boutique Test',
      businessInfo: normalizeBusinessInfo({}),
      behavior: normalizeBehavior({}),
      notes: [],
      automations: null,
      instagram: { connected: false },
      coach: { openQuestions: [{ question: 'Vous faites la livraison ?', occurrences: 4 }] },
    });
    expect(block).toContain('CE QU’IL RESTE À AMÉLIORER');
    expect(block).toContain('Robot prêt à');
    expect(block).toContain('livraison');
  });
});
