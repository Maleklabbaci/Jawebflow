import { describe, expect, it } from 'vitest';
import { processOrderChangeMessage } from '../functions/_shared/order-changes';

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  reference: 'JF-ORDER1',
  status: 'confirmed',
  channel: 'Site web',
  summary: 'Veste noire, taille S',
  customerName: 'Sara',
  phone: '0550000000',
  city: 'Blida',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

const now = new Date('2026-10-04T12:00:00.000Z');

describe('gestion des changements de commande par le client', () => {
  it('demande la raison, propose une alternative, puis annule seulement après confirmation', () => {
    const original = order();
    const request = processOrderChangeMessage({ message: 'Je veux annuler ma commande', orders: [original], now });
    expect(request.reply).toContain('Qu’est-ce qui vous pousse');
    expect(request.orderChangeDraft).toMatchObject({ type: 'cancel', status: 'awaiting_reason', orderId: 'order-1' });
    expect(original.status).toBe('confirmed');

    const reason = processOrderChangeMessage({
      message: 'Le délai de livraison est trop long', orders: [original], draft: request.orderChangeDraft, now,
    });
    expect(reason.reply).toContain('vérifier l’estimation de livraison');
    expect(reason.reply).toContain('Souhaitez-vous toujours annuler');
    expect(reason.orderChangeDraft).toMatchObject({ status: 'awaiting_confirmation', reason: 'Le délai de livraison est trop long' });
    expect(reason.orders).toBeUndefined();

    const confirmed = processOrderChangeMessage({
      message: 'Oui, annule la commande', orders: [original], draft: reason.orderChangeDraft, now,
    });
    expect(confirmed.orderChangeDraft).toBeNull();
    expect(confirmed.orders?.[0]).toMatchObject({
      status: 'cancelled', cancelledBy: 'customer', cancellationReason: 'Le délai de livraison est trop long',
      changeHistory: [{ type: 'customer_cancellation', reason: 'Le délai de livraison est trop long' }],
    });
  });

  it('conserve la commande quand le client refuse l’annulation', () => {
    const original = order();
    const request = processOrderChangeMessage({ message: 'annule ma commande', orders: [original], now });
    const declined = processOrderChangeMessage({ message: 'Non, garde la commande', orders: [original], draft: request.orderChangeDraft, now });
    expect(declined.orderChangeDraft).toBeNull();
    expect(declined.orders).toBeUndefined();
    expect(declined.reply).toContain('reste comme elle est');
  });

  it('demande les détails, récapitule, puis enregistre une modification après un oui', () => {
    const original = order();
    const request = processOrderChangeMessage({ message: 'Je veux changer ma commande', orders: [original], now });
    expect(request.orderChangeDraft?.status).toBe('awaiting_details');

    const details = processOrderChangeMessage({
      message: 'Je veux la taille M', orders: [original], draft: request.orderChangeDraft, now,
    });
    expect(details.reply).toContain('taille M');
    expect(details.reply).toContain('Confirmez-vous');
    expect(details.orderChangeDraft).toMatchObject({ status: 'awaiting_confirmation', requestedChanges: 'Je veux la taille M' });
    expect(details.orders).toBeUndefined();

    const confirmed = processOrderChangeMessage({ message: 'oui', orders: [original], draft: details.orderChangeDraft, now });
    expect(confirmed.orderChangeDraft).toBeNull();
    expect(confirmed.orders?.[0]).toMatchObject({
      status: 'confirmed',
      updatedAt: now.toISOString(),
      changeHistory: [{ type: 'customer_modification', details: 'Je veux la taille M' }],
    });
    expect(confirmed.orders?.[0].summary).toContain('Modification confirmée par le client : Je veux la taille M');
  });

  it('répercute une nouvelle ville de livraison si le client la confirme', () => {
    const original = order();
    const pending = processOrderChangeMessage({
      message: 'Je veux changer la ville de livraison à Oran', orders: [original], now,
    });
    expect(pending.orderChangeDraft?.status).toBe('awaiting_confirmation');
    const confirmed = processOrderChangeMessage({ message: 'oui', orders: [original], draft: pending.orderChangeDraft, now });
    expect(confirmed.orders?.[0].city).toBe('Oran');
  });

  it('met à jour la ville et l’adresse de livraison après confirmation', () => {
    const original = order();
    const pending = processOrderChangeMessage({
      message: 'Je veux changer l’adresse de livraison à 12 rue des Frères, Oran', orders: [original], now,
    });
    expect(pending.orderChangeDraft?.status).toBe('awaiting_confirmation');
    const confirmed = processOrderChangeMessage({ message: 'oui', orders: [original], draft: pending.orderChangeDraft, now });
    expect(confirmed.orders?.[0].city).toBe('Oran');
    expect(confirmed.orders?.[0].deliveryAddress).toBe('12 rue des Frères, Oran');
  });

  it('demande la référence si le client a plusieurs commandes actives', () => {
    const first = order();
    const second = order({ id: 'order-2', reference: 'JF-ORDER2', createdAt: '2026-10-03T10:00:00.000Z' });
    const request = processOrderChangeMessage({ message: 'Je veux modifier ma commande', orders: [first, second], now });
    expect(request.orderChangeDraft).toMatchObject({ status: 'awaiting_order_selection', orderIds: ['order-2', 'order-1'] });
    expect(request.reply).toContain('Laquelle souhaitez-vous modifier');

    const selected = processOrderChangeMessage({ message: 'JF-ORDER2', orders: [first, second], draft: request.orderChangeDraft, now });
    expect(selected.orderChangeDraft).toMatchObject({ status: 'awaiting_details', orderId: 'order-2' });
  });

  it('refuse une modification une fois la commande expédiée', () => {
    const shipped = order({ status: 'shipped' });
    const result = processOrderChangeMessage({ message: 'je veux modifier ma commande', orders: [shipped], now });
    expect(result.reply).toContain('déjà expédiée');
    expect(result.orderChangeDraft).toBeNull();
    expect(result.orders).toBeUndefined();
  });
});
