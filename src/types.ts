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
  category: 'general' | 'services' | 'tarifs' | 'livraison' | 'faq' | 'politiques' | 'contact' | 'custom';
  enabled: boolean;
  source?: 'scanned' | 'manual';
  updatedAt?: string;
  createdAt?: string;
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

