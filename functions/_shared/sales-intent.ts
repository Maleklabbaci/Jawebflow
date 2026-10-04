/**
 * Détection commerciale légère (sans appel IA supplémentaire) pour créer un
 * rappel dans le CRM quand la conversation montre une intention claire.
 */
export type SalesIntentType = 'purchase' | 'quote' | 'price' | 'availability' | 'appointment';
export type SalesIntent = { type: SalesIntentType; priority: 'high' | 'normal'; nextAction: string };

function normalize(text: unknown): string {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (text: string, terms: string[]) => {
  const padded = ` ${text} `;
  return terms.some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.length > 0 && padded.includes(` ${normalizedTerm} `);
  });
};

/**
 * Recognise quelques formulations fréquentes en français, darija et arabe.
 * Ce signal sert uniquement à organiser un suivi ; il ne remplace jamais la
 * compréhension de la réponse par Gemini et ne déclenche aucune vente seul.
 */
export function detectSalesIntent(input: unknown): SalesIntent | null {
  const text = normalize(input);
  if (!text) return null;

  if (has(text, [
    'commander', 'commande', 'je prends', 'je veux acheter', 'acheter', 'acheter le', 'je le veux', 'je la veux',
    'nchri', 'nheb nchri', 'nheb nakhod', 'bghit nchri', 'bghit nakhod', 'نحب نشري', 'نطلب', 'طلبية', 'نشري', 'نحب ناخذ', 'ناخذ',
  ])) {
    return { type: 'purchase', priority: 'high', nextAction: 'Confirmer la commande et les détails de livraison' };
  }
  if (has(text, ['devis', 'rendez vous', 'rdv', 'rappel', 'rappeler', 'rappelle', 'rappelez', 'appelez', 'appel moi', 'rappelle moi', 'call me', 'contacter moi', 'consultation', 'موعد', 'اتصلو بيا'])) {
    return { type: 'appointment', priority: 'high', nextAction: 'Recontacter le client pour confirmer son rendez-vous ou son devis' };
  }
  if (has(text, ['prix', 'tarif', 'combien', 'cout', 'price', 'how much', 'chhal', 'ch7al', 'bch7al', 'se3r', 's3er', 'قداه', 'شحال', 'بقداش', 'السعر', 'الثمن'])) {
    return { type: 'price', priority: 'normal', nextAction: 'Répondre au client sur le prix et l’aider à choisir' };
  }
  if (has(text, ['disponible', 'disponibilite', 'dispo', 'en stock', 'stock', 'taille', 'couleur', 'avez vous', 'vous avez', 'kayn', 'kayna', 'كاين', 'كاينة', 'متوفر', 'متوفرة', 'موجود'])) {
    return { type: 'availability', priority: 'normal', nextAction: 'Vérifier la disponibilité puis répondre au client' };
  }
  if (has(text, ['interesse', 'interessee', 'je suis partant', 'ca m interesse', 'me plait', 'j aimerais', 'je voudrais', 'نحب', 'مهتم', 'عجبني'])) {
    return { type: 'purchase', priority: 'normal', nextAction: 'Reprendre contact pour aider le client à finaliser son choix' };
  }
  return null;
}

export function buildLeadFollowUp(
  intent: SalesIntent | null,
  message: string,
  channel: string,
  now = new Date(),
  hasContact = false,
): Record<string, string> {
  if (!intent && !hasContact) return {};
  const selected = intent || {
    type: 'purchase' as const,
    priority: 'normal' as const,
    nextAction: 'Recontacter le client au sujet de sa demande',
  };
  const delayMs = selected.priority === 'high' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return {
    salesStage: hasContact && selected.priority === 'high' ? 'qualified' : 'interested',
    ...(hasContact ? { followUpStatus: 'pending', followUpAt: new Date(now.getTime() + delayMs).toISOString() } : {}),
    followUpReason: selected.type === 'price' ? 'Question sur un prix' : selected.type === 'availability' ? 'Question sur la disponibilité' : selected.type === 'appointment' ? 'Devis, rendez-vous ou rappel demandé' : 'Intention d’achat détectée',
    followUpNote: `${channel} · ${String(message || '').trim().slice(0, 450)}`,
    nextAction: hasContact ? selected.nextAction : 'Coordonnées absentes : poursuivre dans la conversation et demander un contact seulement si nécessaire',
  };
}
