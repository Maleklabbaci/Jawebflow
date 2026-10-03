import type { KnowledgeNote } from '../types';

export const KNOWLEDGE_GROUPS = [
  { id: 'products', label: 'Produits & services', category: 'services' },
  { id: 'pricing', label: 'Prix & promos', category: 'tarifs' },
  { id: 'delivery', label: 'Livraison & paiement', category: 'livraison' },
  { id: 'practical', label: 'Infos pratiques', category: 'contact' },
  { id: 'faq', label: 'Questions fréquentes & garanties', category: 'faq' },
] as const;

export type KnowledgeGroupId = (typeof KNOWLEDGE_GROUPS)[number]['id'];

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Convertit les anciennes catégories métier vers les cinq catégories qui
 * marchent pour un commerce, un grossiste, une agence, l'immobilier, etc.
 */
export function normalizeKnowledgeCategory(category: unknown, context = ''): string {
  const value = normalizeText(String(category || ''));
  const text = normalizeText(`${category || ''} ${context}`);

  if (/prix|tarif|price|pricing|promo|promotion|remise|discount|solde/.test(value)) return 'tarifs';
  if (/livraison|shipping|paiement|payment|commande|delivery|expedition/.test(value)) return 'livraison';
  if (/contact|lien|links|adresse|horaire|pratique|info|social/.test(value)) return 'contact';
  if (/faq|question|garantie|warranty|politique|policy|learned|appris|condition|retour|annulation/.test(value)) return 'faq';
  if (/produit|service|catalogue|catalog|offre|bien immobilier|immobilier|voyage|sejour|propriete|general|custom/.test(value)) return 'services';

  // Plusieurs imports anciens n'avaient pas de catégorie exploitable ; on
  // déduit alors le groupe du titre/contenu sans enfermer l'entreprise dans
  // un secteur donné.
  if (/prix|tarif|promo|promotion|remise|discount|solde|budget/.test(text)) return 'tarifs';
  if (/livraison|shipping|paiement|payment|expedition|commande|retrait/.test(text)) return 'livraison';
  if (/contact|adresse|horaire|telephone|whatsapp|email|e mail|lien|instagram/.test(text)) return 'contact';
  if (/faq|question|garantie|warranty|politique|condition|retour|remboursement|visa|annulation/.test(text)) return 'faq';
  return 'services';
}

export function knowledgeGroupId(category: unknown, context = ''): KnowledgeGroupId {
  const canonical = normalizeKnowledgeCategory(category, context);
  if (canonical === 'tarifs') return 'pricing';
  if (canonical === 'livraison') return 'delivery';
  if (canonical === 'contact') return 'practical';
  if (canonical === 'faq') return 'faq';
  return 'products';
}

export function isKnowledgePending(note: Partial<KnowledgeNote> & { status?: string; approvalStatus?: string }): boolean {
  const status = String(note.approvalStatus || note.status || '').toLowerCase();
  if (status === 'pending_review' || status === 'pending') return true;
  const source = String(note.source || '').toLowerCase();
  const isLearned = /learn|appris|conversation|auto/.test(source) || normalizeKnowledgeCategory(note.category) === 'faq' && source === 'learned';
  return isLearned && status !== 'approved' && status !== 'active';
}

export function knowledgeSourceLabel(note: Partial<KnowledgeNote> & { status?: string; approvalStatus?: string }): string {
  if (isKnowledgePending(note)) return 'Appris · à valider';
  const source = String(note.source || '').toLowerCase();
  if (/learn|appris|conversation|auto/.test(source)) return 'Appris';
  if (/quick/.test(source)) return 'Ajout éclair';
  if (/scan|site|extract/.test(source)) return 'Site';
  if (/import/.test(source)) return 'Importé';
  return 'Manuel';
}
