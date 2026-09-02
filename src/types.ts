export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp?: string;
  isAiVerified?: boolean;
}

export interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  category: 'general' | 'services' | 'tarifs' | 'livraison' | 'faq' | 'politiques' | 'contact' | 'custom' | 'learned';
  enabled: boolean;
  source?: 'scanned' | 'manual' | 'learned_conversation';
  confidenceScore?: number;
  occurrencesCount?: number;
  lastReinforcedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface LearnedInsight {
  id: string;
  topic: string;
  insight: string;
  customerPattern: string;
  recommendedResponse: string;
  channel: 'instagram' | 'widget' | 'whatsapp';
  confidence: number;
  detectedAt: string;
  status: 'active' | 'pending_review';
}

export interface KnowledgeItem {
  id: string;
  category: 'produits' | 'livraison' | 'faq' | 'politiques';
  title: string;
  content: string;
  badge?: string;
}

export interface ZoneDeliveryTarif {
  code: string;
  name: string;
  zone: string;
  domicile: number;
  stopDesk: number;
  delai: string;
}

export type PaymentPlanId = 'free' | 'basic' | 'pro' | 'enterprise';
export type PaymentCycle = 'monthly' | 'yearly';
export type PaymentMethodType = 'stripe_card' | 'slickpay_dzd' | 'baridimob_ccp';

export interface InvoiceRecord {
  id: string;
  date: string;
  amountUsd: number;
  amountDzd: number;
  planName: string;
  billingCycle: PaymentCycle;
  paymentMethod: string;
  status: 'paid' | 'pending';
  downloadUrl?: string;
  companyName?: string;
  userEmail?: string;
}

