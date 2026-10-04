import { describe, expect, it } from 'vitest';
import { buildLeadFollowUp, detectSalesIntent } from '../functions/_shared/sales-intent';

describe('détection et suivi commercial', () => {
  it('repère une volonté d’achat en français, darija translittérée et arabe', () => {
    expect(detectSalesIntent('Je veux acheter cette coque')).toMatchObject({ type: 'purchase', priority: 'high' });
    expect(detectSalesIntent('Nheb nchri el coque')).toMatchObject({ type: 'purchase', priority: 'high' });
    expect(detectSalesIntent('نحب نشري هذا المنتج')).toMatchObject({ type: 'purchase', priority: 'high' });
  });

  it('classe le prix, la disponibilité et les demandes de rappel', () => {
    expect(detectSalesIntent('Combien coûte la veste ?')).toMatchObject({ type: 'price', priority: 'normal' });
    expect(detectSalesIntent('Vous avez la taille 38 en stock ?')).toMatchObject({ type: 'availability' });
    expect(detectSalesIntent('Pouvez-vous me rappeler demain ?')).toMatchObject({ type: 'appointment', priority: 'high' });
  });

  it('évite de confondre « recommander » avec « commander »', () => {
    expect(detectSalesIntent('Tu peux me recommander une coque ?')).toBeNull();
    expect(detectSalesIntent('')).toBeNull();
  });

  it('ne promet pas de relance hors canal sans moyen de contact disponible', () => {
    const followUp = buildLeadFollowUp(detectSalesIntent('Je veux acheter cette veste'), 'Je la prends', 'Site web', new Date('2026-10-03T12:00:00.000Z'));
    expect(followUp.salesStage).toBe('interested');
    expect(followUp.followUpStatus).toBeUndefined();
    expect(followUp.followUpAt).toBeUndefined();
    expect(followUp.nextAction).toMatch(/Coordonnées absentes/);
  });

  it('prépare une échéance et une prochaine action sans prétendre qu’un rappel a été effectué', () => {
    const now = new Date('2026-10-03T12:00:00.000Z');
    const followUp = buildLeadFollowUp(detectSalesIntent('Je veux acheter cette veste'), 'Je la prends', 'Instagram', now, true);
    expect(followUp).toMatchObject({
      salesStage: 'qualified',
      followUpStatus: 'pending',
      followUpAt: '2026-10-03T13:00:00.000Z',
      followUpReason: 'Intention d’achat détectée',
      nextAction: 'Confirmer la commande et les détails de livraison',
    });
    expect(followUp.followUpNote).toContain('Instagram');
  });
});
