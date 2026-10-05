import { describe, expect, it } from 'vitest';
import { DEAL_NEXT_ACTIONS, DEAL_STEPS, buildDealRecap, buildLeadFollowUp, createPendingOrderRequest, dealKindLabel, dealKindOf, dealStatusLabel, detectConfirmationQuestionKind, detectConfirmedDealKind, detectDealKind, detectSalesIntent, isAffirmative, isExplicitOrderConfirmation, isOrderConfirmationQuestion } from '../functions/_shared/sales-intent';

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

  it('ne crée une commande qu’après une confirmation explicite ou un oui au brouillon', () => {
    expect(isExplicitOrderConfirmation('Je confirme la commande')).toBe(true);
    expect(isExplicitOrderConfirmation('Je la prends')).toBe(false);
    expect(isOrderConfirmationQuestion('Souhaitez-vous confirmer la commande ?')).toBe(true);
    expect(isAffirmative('Oui, je confirme')).toBe(true);
    expect(isAffirmative('Oui, mais je voudrais encore voir une autre couleur')).toBe(false);
    expect(createPendingOrderRequest({ id: 'web_message-1234', channel: 'Site web', summary: 'Une veste', now: new Date('2026-10-04T10:00:00.000Z') })).toMatchObject({
      id: 'web_message-1234', status: 'pending_merchant_confirmation', totalAmount: null,
      createdAt: '2026-10-04T10:00:00.000Z',
    });
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

describe('ce que le client valide : commande, visite, rendez-vous, réservation, devis', () => {
  it('nomme la bonne nature à partir du message du client', () => {
    expect(detectDealKind('Je veux visiter l’appartement')).toBe('visit');
    expect(detectDealKind('On peut fixer un rendez-vous ?')).toBe('appointment');
    expect(detectDealKind('Je réserve une table')).toBe('booking');
    expect(detectDealKind('Envoyez-moi un devis')).toBe('quote');
    expect(detectDealKind('Je passe commande')).toBe('order');
  });

  it('« oui je valide la visite » est une VISITE, pas une commande', () => {
    expect(detectConfirmedDealKind('Oui, je valide la visite')).toBe('visit');
    expect(detectConfirmedDealKind('oui je valide le rendez-vous')).toBe('appointment');
    expect(detectConfirmedDealKind('je confirme la réservation')).toBe('booking');
    expect(detectConfirmedDealKind('je valide le devis')).toBe('quote');
    expect(isExplicitOrderConfirmation('Oui, je valide la visite')).toBe(true);
  });

  it('« oui j’achète celle-là » reste une COMMANDE', () => {
    expect(detectConfirmedDealKind('Oui j’achète celle-là')).toBe('order');
    expect(detectConfirmedDealKind('je confirme la commande')).toBe('order');
    expect(detectConfirmedDealKind('Je la prends')).toBeNull();
    expect(isExplicitOrderConfirmation('Je la prends')).toBe(false);
  });

  it('la question du bot donne la nature du brouillon, et rien sur une question hors vente', () => {
    expect(detectConfirmationQuestionKind('Confirmez-vous cette visite ?')).toBe('visit');
    expect(detectConfirmationQuestionKind('Souhaitez-vous confirmer ce rendez-vous ?')).toBe('appointment');
    expect(detectConfirmationQuestionKind('Confirmez-vous cette commande ?')).toBe('order');
    expect(isOrderConfirmationQuestion('Confirmez-vous cette commande ?')).toBe(true);
    expect(detectConfirmationQuestionKind('Confirmez-vous votre adresse de livraison ?')).toBeNull();
  });

  it('la demande enregistrée porte sa nature et son libellé', () => {
    const visit = createPendingOrderRequest({
      id: 'ig_visit-1', channel: 'Instagram', summary: 'Appartement 3 pièces, Hydra',
      kind: 'visit', now: new Date('2026-10-04T10:00:00.000Z'),
    });
    expect(visit).toMatchObject({ kind: 'visit', kindLabel: 'Visite', status: 'pending_merchant_confirmation' });
    expect(dealKindLabel(visit.kind)).toBe('Visite');
    const legacy = createPendingOrderRequest({ id: 'web_x', channel: 'Site web', summary: 'Veste' });
    expect(legacy).toMatchObject({ kind: 'order', kindLabel: 'Commande' });
  });

  it('repère la visite et la réservation comme intentions à suivre', () => {
    expect(detectSalesIntent('Je veux visiter l’appartement')).toMatchObject({ type: 'visit', priority: 'high' });
    expect(detectSalesIntent('Je voudrais réserver pour samedi')).toMatchObject({ type: 'booking', priority: 'high' });
    expect(buildLeadFollowUp(detectSalesIntent('Je veux visiter l’appartement'), 'visite', 'Instagram', new Date('2026-10-04T10:00:00.000Z'), true))
      .toMatchObject({ followUpReason: 'Visite demandée par le client' });
  });
});

describe('suivi affiché chez le marchand, selon la nature de la demande', () => {
  it('une commande garde son parcours complet, une visite s’arrête à « réalisée »', () => {
    expect(DEAL_STEPS.order).toEqual(['pending_merchant_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered']);
    expect(DEAL_STEPS.visit).toEqual(['pending_merchant_confirmation', 'confirmed', 'delivered']);
    expect(DEAL_NEXT_ACTIONS.order.confirmed.map((a) => a.status)).toEqual(['preparing', 'cancelled']);
    expect(DEAL_NEXT_ACTIONS.visit.confirmed.map((a) => a.status)).toEqual(['delivered', 'cancelled']);
    expect(DEAL_NEXT_ACTIONS.appointment.pending_merchant_confirmation[0].label).toBe('Confirmer le rendez-vous');
  });

  it('le libellé d’état dépend de la nature, et les anciennes demandes restent des commandes', () => {
    expect(dealStatusLabel('visit', 'confirmed')).toBe('Visite confirmée');
    expect(dealStatusLabel('appointment', 'delivered')).toBe('RDV honoré');
    expect(dealStatusLabel('order', 'shipped')).toBe('Expédiée');
    expect(dealKindOf({ reference: 'JF-ANCIEN' })).toBe('order');
    expect(dealStatusLabel(undefined, 'pending_merchant_confirmation')).toBe('À confirmer par la boutique');
  });
});

describe('validations en darija et en arabe', () => {
  it('« nvalidi la visite » / « waf9t 3la rdv » sont reconnus comme le français', () => {
    expect(detectConfirmedDealKind('safi nvalidi la visite')).toBe('visit');
    expect(detectConfirmedDealKind('waf9t 3la rdv')).toBe('appointment');
    expect(detectConfirmedDealKind('nconfirmi la commande')).toBe('order');
    expect(isExplicitOrderConfirmation('nvalidi la visite')).toBe(true);
  });

  it('la question du bot en darija prépare le bon brouillon', () => {
    expect(detectConfirmationQuestionKind('Wach tconfirmi la visite ?')).toBe('visit');
    expect(detectConfirmationQuestionKind('Nconfirou la commande ?')).toBe('order');
    expect(isOrderConfirmationQuestion('Wach tconfirmi la visite ?')).toBe(true);
  });

  it('l’arabe confirme aussi la bonne nature', () => {
    expect(detectConfirmedDealKind('نعم أوافق على الموعد')).toBe('appointment');
    expect(detectConfirmedDealKind('اؤكد الطلبية')).toBe('order');
  });
});

describe('la réponse proposée par le bot est bien comprise comme un oui', () => {
  it('« Oui, confirme la modification » valide la modification demandée', () => {
    expect(isAffirmative('Oui, confirme la modification')).toBe(true);
    expect(isAffirmative('confirme la modification')).toBe(true);
    expect(isAffirmative('Oui, annuler')).toBe(false); // l'annulation a sa propre confirmation explicite
    expect(isAffirmative('non')).toBe(false);
  });
});

describe('résumé court d’une demande pour la liste', () => {
  it('jette la discussion et ne garde que l’information utile', () => {
    const transcript = [
      'Client : Oui demain', 'Assistant : C’est noté !', 'Client : Oui oui',
      'Client : Oui nimporte quel heure', 'Assistant : Parfait.', 'Client : Je valide la commande',
    ].join('\n');
    const recap = buildDealRecap(transcript);
    expect(recap).toContain('demain');
    expect(recap).toContain('nimporte quel heure');
    expect(recap).not.toContain('Assistant');
    expect(recap).not.toContain('C’est noté');
    expect(recap).not.toContain('Je valide la commande');
  });

  it('un résumé déjà court est rendu tel quel', () => {
    expect(buildDealRecap('Veste noire, taille M')).toBe('Veste noire, taille M');
    expect(buildDealRecap('')).toBe('');
  });
});
