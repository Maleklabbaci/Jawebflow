export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp?: string;
  isAiVerified?: boolean;
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
