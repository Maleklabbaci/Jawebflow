/**
 * Détection commerciale légère (sans appel IA supplémentaire) pour créer un
 * rappel dans le CRM quand la conversation montre une intention claire.
 */
export type SalesIntentType = 'purchase' | 'quote' | 'price' | 'availability' | 'appointment' | 'visit' | 'booking';
export type SalesIntent = { type: SalesIntentType; priority: 'high' | 'normal'; nextAction: string };

/**
 * Ce que le client valide n'est PAS toujours une « commande » : un marchand qui
 * vend un appartement reçoit « oui je valide la visite », une agence reçoit
 * « oui je valide le rendez-vous », un restaurant « je réserve ». Chaque
 * validation est donc enregistrée avec sa NATURE exacte, visible telle quelle
 * dans le tableau de bord du marchand.
 */
export type DealKind = 'order' | 'visit' | 'appointment' | 'booking' | 'quote';

export const DEAL_KIND_LABELS: Record<DealKind, string> = {
  order: 'Commande',
  visit: 'Visite',
  appointment: 'Rendez-vous',
  booking: 'Réservation',
  quote: 'Devis',
};

/** Libellés lisibles des intentions (le CRM n'affiche plus « purchase » brut). */
export const SALES_INTENT_LABELS: Record<string, string> = {
  purchase: 'Intention d’achat',
  visit: 'Visite demandée',
  appointment: 'Rendez-vous / devis',
  booking: 'Réservation',
  quote: 'Devis demandé',
  price: 'Question sur un prix',
  availability: 'Question sur la disponibilité',
  human_transfer: 'Demande d’un conseiller',
};

export function isDealKind(value: unknown): value is DealKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEAL_KIND_LABELS, value);
}

/** Étapes de suivi affichées chez le marchand, selon la nature de la demande. */
export const DEAL_STEPS: Record<DealKind, string[]> = {
  order: ['pending_merchant_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered'],
  visit: ['pending_merchant_confirmation', 'confirmed', 'delivered'],
  appointment: ['pending_merchant_confirmation', 'confirmed', 'delivered'],
  booking: ['pending_merchant_confirmation', 'confirmed', 'delivered'],
  quote: ['pending_merchant_confirmation', 'confirmed', 'delivered'],
};

/** Une commande se prépare puis s'expédie ; une visite ou un rendez-vous se réalise. */
export const DEAL_STATUS_LABELS: Record<DealKind, Record<string, string>> = {
  order: {
    pending_merchant_confirmation: 'À confirmer par la boutique', confirmed: 'Confirmée',
    preparing: 'En préparation', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée',
  },
  visit: {
    pending_merchant_confirmation: 'Visite à confirmer', confirmed: 'Visite confirmée',
    delivered: 'Visite réalisée', cancelled: 'Visite annulée',
  },
  appointment: {
    pending_merchant_confirmation: 'RDV à confirmer', confirmed: 'RDV confirmé',
    delivered: 'RDV honoré', cancelled: 'RDV annulé',
  },
  booking: {
    pending_merchant_confirmation: 'Réservation à confirmer', confirmed: 'Réservation confirmée',
    delivered: 'Réservation honorée', cancelled: 'Réservation annulée',
  },
  quote: {
    pending_merchant_confirmation: 'Devis à valider', confirmed: 'Devis accepté',
    delivered: 'Devis signé', cancelled: 'Devis refusé',
  },
};

/** Actions proposées au marchand pour faire avancer chaque nature de demande. */
export const DEAL_NEXT_ACTIONS: Record<DealKind, Record<string, Array<{ status: string; label: string; destructive?: boolean }>>> = {
  order: {
    pending_merchant_confirmation: [{ status: 'confirmed', label: 'Confirmer la commande' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    confirmed: [{ status: 'preparing', label: 'Démarrer la préparation' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    preparing: [{ status: 'shipped', label: 'Marquer comme expédiée' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    shipped: [{ status: 'delivered', label: 'Marquer comme livrée' }],
    delivered: [], cancelled: [],
  },
  visit: {
    pending_merchant_confirmation: [{ status: 'confirmed', label: 'Confirmer la visite' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    confirmed: [{ status: 'delivered', label: 'Visite réalisée' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    delivered: [], cancelled: [],
  },
  appointment: {
    pending_merchant_confirmation: [{ status: 'confirmed', label: 'Confirmer le rendez-vous' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    confirmed: [{ status: 'delivered', label: 'RDV honoré' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    delivered: [], cancelled: [],
  },
  booking: {
    pending_merchant_confirmation: [{ status: 'confirmed', label: 'Confirmer la réservation' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    confirmed: [{ status: 'delivered', label: 'Réservation honorée' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    delivered: [], cancelled: [],
  },
  quote: {
    pending_merchant_confirmation: [{ status: 'confirmed', label: 'Devis accepté par le client' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
    confirmed: [{ status: 'delivered', label: 'Marquer comme signé' }],
    delivered: [], cancelled: [],
  },
};

/** Nature réelle d'une demande enregistrée (les anciennes n'ont pas de champ « kind »). */
export function dealKindOf(order: unknown): DealKind {
  const kind = (order as { kind?: unknown } | null | undefined)?.kind;
  return isDealKind(kind) ? kind : 'order';
}

/** Libellé d'état adapté à la nature de la demande. */
export function dealStatusLabel(kind: unknown, status: unknown): string {
  const labels = DEAL_STATUS_LABELS[isDealKind(kind) ? kind : 'order'];
  const key = String(status || '');
  return labels[key] || key;
}

/** Libellé lisible d'une demande validée par le client. */
export function dealKindLabel(kind: unknown): string {
  return isDealKind(kind) ? DEAL_KIND_LABELS[kind] : DEAL_KIND_LABELS.order;
}

/** Mots qui prouvent un achat / une commande (pour ne pas déclasser à tort). */
const ORDER_TERMS = [
  'commande', 'commander', 'commandes', 'acheter', 'achete', 'achat', 'livrer', 'livraison',
  'طلبية', 'الطلبية', 'طلبيتي', 'شراء', 'الشراء',
];

/** Signaux « je veux vous parler / qu'on s'appelle » : ce n'est pas un achat. */
const PHONE_TALK = [
  'telephone', 'au tel', 'appeler', 'appelle', 'rappeler', 'parler', 'تلفون', 'هاتف',
];

/**
 * Affine la nature détectée à partir de ce que dit VRAIMENT le client.
 * Un bot qui demande « Confirmez-vous votre commande ? » à quelqu'un qui veut
 * seulement « parler au téléphone » ne doit pas créer une « Commande » : on la
 * reclasse en rendez-vous tant qu'aucun mot d'achat n'est présent.
 */
export function refineDealKind(kind: DealKind | null | undefined, clientText: unknown): DealKind | null {
  if (!kind) return null;
  const t = normalize(clientText);
  if (!t) return kind;
  if (kind === 'order' && !has(t, ORDER_TERMS) && !has(t, BUY_VERBS) && has(t, PHONE_TALK)) {
    return 'appointment';
  }
  return kind;
}

/** Message envoyé au client quand le marchand confirme la demande. */
export function dealConfirmationMessage(kind: unknown, name?: unknown): string {
  const who = String(name || '').trim();
  const hello = who ? `${who}, ` : '';
  switch (isDealKind(kind) ? kind : 'order') {
    case 'visit': return `✅ ${hello}votre visite est confirmée ! Nous vous attendons avec plaisir.`;
    case 'appointment': return `✅ ${hello}votre rendez-vous est confirmé ! À très bientôt.`;
    case 'booking': return `✅ ${hello}votre réservation est confirmée ! À très bientôt.`;
    case 'quote': return `✅ ${hello}votre devis est accepté, nous nous occupons de tout !`;
    default: return `✅ ${hello}bonne nouvelle : votre commande est confirmée ! Nous vous tenons au courant pour la suite.`;
  }
}

const CLIENT_LINE = /^(?:client|visiteur|moi|me)\s*[:\-–]\s*(.+)$/i;
const ASSISTANT_LINE = /^(?:assistant|bot|ia)\s*[:\-–]/i;
const LEADING_YES = /^(?:oui+|ok+|okay|d accord|dacc|safi|waf9t|bien sur|d'accord)\b[, ]*/i;

/**
 * Résumé COURT de ce que le client a validé, pour la liste des demandes.
 * Le commerçant ne veut pas relire toute la discussion : on ne garde que les
 * messages du client qui portent une information (« demain », « la veste noire
 * taille M »), en jetant les simples acquiescements (« oui », « je valide »).
 * Si le champ n'est pas une transcription, il est déjà court : on le rend tel quel.
 */
export function buildDealRecap(summary: unknown): string {
  const text = String(summary || '').trim();
  if (!text) return '';
  // Coupe sur les vrais retours ligne ET sur la séquence littérale « \n »
  // (d'anciens brouillons ont été enregistrés avec ce séparateur échappé).
  const lines = text.split(/\\n|\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasTranscript = lines.some((l) => CLIENT_LINE.test(l) || ASSISTANT_LINE.test(l));
  const source = hasTranscript
    ? lines.filter((l) => CLIENT_LINE.test(l)).map((l) => l.replace(CLIENT_LINE, '$1'))
    : [text];
  const cleaned = source
    .map((l) => l.replace(LEADING_YES, '').trim())
    .filter((l) => l.length >= 3)
    .filter((l) => !isAffirmative(l) && !isExplicitOrderConfirmation(l))
    .map((l) => l.replace(/[.!?\s]+$/, ''))
    .filter(Boolean);
  const recap = cleaned.join(' · ');
  return recap.length > 200 ? `${recap.slice(0, 200).trimEnd()}…` : recap;
}

import { extractLeadFacts } from './lead-facts.ts';

function normalize(text: unknown): string {
  return String(text || '')
    // ⚠️ Le pliage arabe passe AVANT la décomposition : NFKD sépare « أ » en
    // « ا » + signe diacritique, et ce signe devenait une espace — « أوافق »
    // était donc lu « ا وافق » et aucune confirmation arabe n'était reconnue.
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
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

/** Formulations exactes déjà reconnues (gardées telles quelles). */
const CONFIRM_QUESTION_PHRASES = [
  'confirmez vous cette commande',
  'confirmez vous la commande',
  'souhaitez vous confirmer la commande',
  'voulez vous confirmer cette commande',
  'tu confirmes cette commande',
  'tu confirmes la commande',
  'tu veux confirmer la commande',
  'nconfirou la commande',
  'هل تؤكد الطلبية',
  'هل تؤكد الطلب',
  'هل تريد تأكيد الطلب',
];

/** Verbes de validation : « je valide », « je confirme », « j'accepte »… */
const CONFIRM_VERBS = [
  'je confirme', 'je valide', 'on confirme', 'confirme', 'confirmez', 'confirmer', 'valide',
  'validez', 'j accepte', 'je accepte', 'accepte', 'je reserve', 'je la reserve',
  'je prends rendez vous',
  // Darija (alphabet latin) : « nvalidi la visite », « waf9t 3la rdv », « nconfirmi »…
  'nconfirou', 'nvalidi', 'nvalidiw', 'nconfirmi', 'nconfirmer', 'waf9t', 'wafeqt', 'waf9na',
  'mwafe9', 'mowafe9',
  // Arabe : « أوافق », « نؤكد », « أقبل »…
  'نؤكد', 'اؤكد', 'اكد', 'نقبل', 'اقبل', 'اوافق', 'موافق', 'نوافق', 'موافقة',
];

/** « j'achète celle-là », « je l'achète »… : le client acte son achat. */
const BUY_VERBS = [
  'j achete', 'je achete', 'achete', 'nchriha', 'nchrih', 'nchri', 'نشري', 'نشريها', 'نشريه',
];

/** Le bot doit avoir explicitement demandé une confirmation juste avant. */
const CONFIRM_QUESTION_TERMS = [
  'confirmez vous', 'confirmez', 'souhaitez vous confirmer', 'voulez vous confirmer',
  'tu confirmes', 'tu veux confirmer', 'vous confirmez', 'on confirme', 'nconfirou',
  'nvalidiw',
  // Darija : « wach tconfirmi la visite ? », « nconfirou la commande ? »…
  'tconfirmi', 'tconfirmer', 'wach tconfirmi', 'wach nconfirou',
  'هل تؤكد', 'هل تريد تأكيد', 'هل اؤكد', 'واش نأكدو',
];

/**
 * Nature de ce dont parle le message : commande, visite, rendez-vous,
 * réservation ou devis. Sert à nommer correctement la validation du client.
 */
export function detectDealKind(input: unknown): DealKind | null {
  const text = normalize(input);
  if (!text) return null;
  // Les formes avec l'article arabe (« الزيارة », « الموعد »…) sont listées : la
  // détection se fait mot à mot.
  if (has(text, ['visite', 'visiter', 'visites', 'nzour', 'nzourou', 'زيارة', 'الزيارة', 'معاينة', 'المعاينة'])) return 'visit';
  if (has(text, ['rendez vous', 'rdv', 'موعد', 'الموعد', 'مواعيد', 'المواعيد', 'لقاء'])) return 'appointment';
  if (has(text, ['reservation', 'reserver', 'reserve', 'حجز', 'الحجز', 'حجوزات'])) return 'booking';
  if (has(text, ['devis', 'عرض سعر', 'عرض السعر', 'تسعيرة'])) return 'quote';
  if (has(text, ['commande', 'commander', 'commandes', 'طلبية', 'الطلبية', 'طلبيتي', 'طلب', 'الطلب', 'شراء', 'الشراء', 'achat'])) return 'order';
  return null;
}

/**
 * Le client valide quelque chose de façon explicite (« oui je valide la visite »,
 * « je confirme le rendez-vous », « j'achète celle-là »). Renvoie la NATURE de
 * ce qu'il valide, ou null s'il ne valide rien.
 */
export function detectConfirmedDealKind(input: unknown): DealKind | null {
  const text = normalize(input);
  if (!text) return null;
  if (!has(text, [...CONFIRM_VERBS, ...BUY_VERBS])) return null;
  return detectDealKind(text) || 'order';
}

/**
 * Le bot vient de demander une confirmation : on récupère la nature de la
 * demande (commande, visite, rendez-vous…) pour l'enregistrer dans le brouillon.
 * Renvoie null si le message ne demande aucune validation commerciale
 * (ex : « Confirmez-vous votre adresse ? »).
 */
export function detectConfirmationQuestionKind(input: unknown): DealKind | null {
  const text = normalize(input);
  if (!text) return null;
  if (CONFIRM_QUESTION_PHRASES.some((phrase) => text.includes(normalize(phrase)))) return detectDealKind(text) || 'order';
  if (!has(text, CONFIRM_QUESTION_TERMS)) return null;
  return detectDealKind(text);
}

/** Le bot doit avoir explicitement demandé une confirmation juste avant. */
export function isOrderConfirmationQuestion(input: unknown): boolean {
  return detectConfirmationQuestionKind(input) !== null;
}

/** Réponse courte affirmative : exploitable seulement si un brouillon attend confirmation. */
export function isAffirmative(input: unknown): boolean {
  const text = normalize(input);
  if (text.split(' ').length > 5) return false;
  return new Set([
    'oui', 'oui je confirme', 'oui confirme', 'oui bien sur', 'je confirme', 'ok je confirme', 'c est bon', 'd accord', 'ca me va', 'vas y', 'allons y', 'ok', 'okay',
    // Le bot propose « Oui, confirme la modification » : cette réponse doit être lue comme un oui.
    'oui confirme la modification', 'confirme la modification', 'oui confirmer la modification',
    'je confirme la modification', 'oui je confirme la modification',
    'yes', 'yes i confirm', 'i confirm', 'confirm', 'sure', 'go ahead', 'let s do it', 'نعم', 'نعم اؤكد', 'ايه', 'اي', 'اكيد', 'موافق', 'تمام',
  ]).has(text);
}

/** Confirmations explicites utilisables sans question précédente (toute nature). */
export function isExplicitOrderConfirmation(input: unknown): boolean {
  const text = normalize(input);
  return [
    'je passe ma commande', 'je passe commande', 'confirmez ma commande',
    'i confirm the order', 'place the order', 'confirm my order',
    'نأكد الطلبية', 'اكد طلبيتي',
  ].some((phrase) => text.includes(normalize(phrase))) || detectConfirmedDealKind(text) !== null;
}

/**
 * Recognise quelques formulations fréquentes en français, darija et arabe.
 * Ce signal sert uniquement à organiser un suivi ; il ne remplace jamais la
 * compréhension de la réponse par Gemini et ne déclenche aucune vente seul.
 */
export function detectSalesIntent(input: unknown): SalesIntent | null {
  const text = normalize(input);
  if (!text) return null;

  // Visite / rendez-vous / réservation / devis AVANT l'achat : « je veux
  // visiter l'appartement » n'est pas une commande e-commerce.
  if (has(text, ['visite', 'visiter', 'visites', 'je veux visiter', 'nzour', 'زيارة', 'معاينة'])) {
    return { type: 'visit', priority: 'high', nextAction: 'Fixer la visite avec le client et lui confirmer la date' };
  }
  if (has(text, ['reservation', 'reserver', 'reserve', 'حجز'])) {
    return { type: 'booking', priority: 'high', nextAction: 'Confirmer la réservation (date, heure et nombre de personnes)' };
  }
  if (has(text, [
    'commander', 'commande', 'je prends', 'je la prends', 'je le prends', 'je les prends', 'je veux acheter', 'acheter', 'acheter le', 'je le veux', 'je la veux',
    'i will take it', 'i want to buy', 'nchri', 'nheb nchri', 'nheb nakhod', 'bghit nchri', 'bghit nakhod', 'نحب نشري', 'نطلب', 'طلبية', 'نشري', 'نحب ناخذ', 'ناخذ',
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

export type PendingOrderRequest = {
  id: string;
  reference: string;
  status: 'pending_merchant_confirmation';
  /** Nature exacte de la validation du client : commande, visite, rendez-vous… */
  kind: DealKind;
  kindLabel: string;
  channel: string;
  summary: string;
  customerName: string;
  phone: string;
  city: string;
  totalAmount: null;
  createdAt: string;
  updatedAt: string;
};

/** Enregistre une demande uniquement après une confirmation explicite du client. */
export function createPendingOrderRequest(input: {
  id: string;
  channel: string;
  summary: string;
  customerName?: string;
  phone?: string;
  city?: string;
  kind?: DealKind | string | null;
  now?: Date;
}): PendingOrderRequest {
  const id = String(input.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  const suffix = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'NOUVEAU';
  const now = input.now || new Date();
  const timestamp = now.toISOString();
  const kind: DealKind = isDealKind(input.kind) ? input.kind : 'order';
  return {
    id,
    reference: `JF-${suffix}`,
    status: 'pending_merchant_confirmation',
    kind,
    kindLabel: DEAL_KIND_LABELS[kind],
    channel: String(input.channel || '').slice(0, 40),
    summary: String(input.summary || '').trim().slice(0, 2_000),
    customerName: String(input.customerName || '').slice(0, 120),
    phone: String(input.phone || '').slice(0, 40),
    city: String(input.city || '').slice(0, 100),
    totalAmount: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Le client répond à « c'est à quel nom ? ». On préfère un nom détecté
 * (« je m'appelle Karim »), sinon on accepte une réponse courte sans chiffre
 * ni mot de confirmation (« Karim Benali »).
 */
export function extractClientName(text: unknown): string {
  // Les apostrophes typographiques (« m’appelle ») ne cassent pas la détection.
  const raw = String(text || '').replace(/[’‘`]/g, "'").trim();
  if (!raw) return '';
  const facts = extractLeadFacts(raw);
  if (facts.name) return facts.name;
  if (raw.length <= 60 && !/\d/.test(raw) && raw.split(/\s+/).length <= 5 && !isAffirmative(raw)) {
    return raw.replace(/[.!?,;:]+$/, '').trim();
  }
  return '';
}

/** Contexte transmis à l'IA pour qu'elle annonce la BONNE nature de la demande. */
export function buildDealCreatedContext(order: PendingOrderRequest, opts: { askName?: boolean } = {}): Record<string, string> {
  const label = dealKindLabel(order.kind).toLowerCase();
  const noteByKind: Record<DealKind, string> = {
    order: 'Demande de commande enregistrée, en attente de validation humaine par la boutique. Aucune confirmation de stock, prix ou paiement.',
    visit: 'Demande de visite enregistrée, en attente de validation humaine. Aucune date ni créneau n’est encore confirmé : ne prétends pas que la visite est fixée.',
    appointment: 'Demande de rendez-vous enregistrée, en attente de validation humaine. Aucun créneau n’est encore confirmé : ne prétends pas que le rendez-vous est fixé.',
    booking: 'Réservation enregistrée, en attente de validation humaine. Aucun créneau n’est encore confirmé : ne prétends pas que la réservation est définitive.',
    quote: 'Devis demandé enregistré, en attente de validation humaine. Aucun prix n’est encore confirmé par la boutique.',
  };
  return {
    reference: order.reference,
    status: order.status,
    type: dealKindLabel(order.kind),
    note: noteByKind[order.kind] || noteByKind.order,
    instruction: `Annonce au client que sa demande de ${label} est bien enregistrée et que l'équipe va la confirmer. Ne parle pas d'une « commande » si ce n'en est pas une.${opts.askName ? " Le dossier n'a pas encore de nom : termine en demandant poliment le nom complet du client pour le compléter." : ''}`,
    ...(opts.askName ? { askClientName: 'true' } : {}),
  };
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
  const reasonByType: Record<string, string> = {
    price: 'Question sur un prix',
    availability: 'Question sur la disponibilité',
    appointment: 'Devis, rendez-vous ou rappel demandé',
    visit: 'Visite demandée par le client',
    booking: 'Réservation demandée par le client',
  };
  return {
    salesStage: hasContact && selected.priority === 'high' ? 'qualified' : 'interested',
    ...(hasContact ? { followUpStatus: 'pending', followUpAt: new Date(now.getTime() + delayMs).toISOString() } : {}),
    followUpReason: reasonByType[selected.type] || 'Intention d’achat détectée',
    followUpNote: `${channel} · ${String(message || '').trim().slice(0, 450)}`,
    nextAction: hasContact ? selected.nextAction : 'Coordonnées absentes : poursuivre dans la conversation et demander un contact seulement si nécessaire',
  };
}
