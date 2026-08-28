import type { Bot, KnowledgeItem } from "../../drizzle/schema";

export type SubscriptionStatus = "free" | "active" | "past_due" | "canceled";
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: SubscriptionStatus;
  plan: string;
  messagesUsed: number;
  messagesLimit: number;
};
export type KnowledgeUpload = {
  name: string;
  type: string;
  size: number;
  base64: string;
};

export interface AuthenticationAdapter {
  register(email: string, password: string): Promise<{ token: string; user: SessionUser }>;
  login(email: string, password: string): Promise<{ token: string; user: SessionUser }>;
  getSessionUser(token: string): Promise<SessionUser>;
}

export interface WorkspaceAdapter {
  getOverview(userId: string): Promise<{
    bot: Bot | undefined;
    knowledge: KnowledgeItem[];
    metrics: { messagesUsed: number; messagesLimit: number; knowledgeCount: number; botCount: number };
    subscription: { status: SubscriptionStatus; plan: string; apiEnabled: boolean };
  }>;
  saveBot(input: {
    userId: string;
    businessName: string;
    websiteUrl?: string;
    businessCategory?: string;
    businessDescription?: string;
    pricingServicesText?: string;
    faqText?: string;
    specialRulesText?: string;
    assistantTone?: string;
    languages?: Record<string, boolean>;
    autoLeadCapture?: boolean;
    bubbleTheme?: string;
    bubblePosition?: string;
    rawKnowledge: string;
    files: KnowledgeUpload[];
  }): Promise<{ bot: Bot; knowledge: KnowledgeItem[] }>;
  getWidget(userId: string, botId: string): Promise<Bot | undefined>;
  recordMessage(input: { userId: string; botId: string; message: string }): Promise<{ messagesUsed: number; messagesLimit: number }>;
  recordWidgetMessage(input: { botId: string; widgetToken: string; message: string }): Promise<{ messagesUsed: number; messagesLimit: number }>;
}

export interface JawebflowServices {
  auth: AuthenticationAdapter;
  workspace: WorkspaceAdapter;
}
