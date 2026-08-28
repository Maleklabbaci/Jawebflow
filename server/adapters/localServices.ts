import { randomUUID } from "crypto";

import {
  authenticateLocalUser,
  createLocalUser,
  createSessionToken,
  makeWidgetToken,
  verifySessionToken,
} from "../auth";
import {
  addKnowledgeItem,
  getBotByWidgetCredentials,
  getJawebflowUserById,
  getOwnedBot,
  incrementMessageUsage,
  getPrimaryBotForUser,
  listKnowledgeItems,
  savePrimaryBot,
} from "../db";
import { storagePut } from "../storage";
import type { AuthenticationAdapter, JawebflowServices, SessionUser, SubscriptionStatus, WorkspaceAdapter } from "./contracts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const allowedTypes = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);

function toSessionUser(user: {
  id: string;
  email: string;
  subscriptionStatus?: SubscriptionStatus | null;
  plan?: string | null;
  messagesUsed?: number | null;
  messagesLimit?: number | null;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.email.split("@")[0] || "Marchand",
    subscriptionStatus: user.subscriptionStatus ?? "free",
    plan: user.plan ?? "free",
    messagesUsed: user.messagesUsed ?? 0,
    messagesLimit: user.messagesLimit ?? 100,
  };
}

function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

const localAuthAdapter: AuthenticationAdapter = {
  async register(email, password) {
    const user = await createLocalUser(email, password);
    return { token: await createSessionToken(user), user: toSessionUser(user) };
  },
  async login(email, password) {
    const user = await authenticateLocalUser(email, password);
    return { token: await createSessionToken(user), user: toSessionUser(user) };
  },
  async getSessionUser(token) {
    const session = await verifySessionToken(token);
    const user = await getJawebflowUserById(session.id);
    if (!user || user.email !== session.email) throw new Error("Session invalide.");
    return toSessionUser(user);
  },
};

const localWorkspaceAdapter: WorkspaceAdapter = {
  async getOverview(userId) {
    const [user, bot] = await Promise.all([getJawebflowUserById(userId), getPrimaryBotForUser(userId)]);
    if (!user) throw new Error("Compte introuvable.");
    const knowledge = bot ? await listKnowledgeItems(userId, bot.id) : [];
    const apiEnabled = user.subscriptionStatus === "active";
    return {
      bot,
      knowledge,
      metrics: {
        messagesUsed: user.messagesUsed,
        messagesLimit: user.messagesLimit,
        knowledgeCount: knowledge.length,
        botCount: bot ? 1 : 0,
      },
      subscription: {
        status: user.subscriptionStatus,
        plan: user.plan,
        apiEnabled,
      },
    };
  },

  async saveBot({ userId, businessName, websiteUrl, businessCategory, businessDescription, pricingServicesText, faqText, specialRulesText, assistantTone, languages, autoLeadCapture, bubbleTheme, bubblePosition, rawKnowledge, files }) {
    const previous = await getPrimaryBotForUser(userId);
    const { bot } = await savePrimaryBot({
      id: previous?.id ?? randomUUID(),
      userId,
      businessName,
      websiteUrl,
      businessCategory,
      businessDescription,
      pricingServicesText,
      faqText,
      specialRulesText,
      assistantTone,
      languages,
      autoLeadCapture,
      bubbleTheme,
      bubblePosition,
      widgetToken: previous?.widgetToken ?? makeWidgetToken(),
      rawKnowledge: rawKnowledge || null,
    });
    const savedBot = await getPrimaryBotForUser(userId);
    if (!savedBot) throw new Error("Impossible de relire le bot enregistré.");

    if (rawKnowledge && rawKnowledge !== previous?.rawKnowledge) {
      await addKnowledgeItem({
        id: randomUUID(),
        botId: savedBot.id,
        userId,
        kind: "text",
        title: "Notes commerciales",
        textContent: rawKnowledge,
        sizeBytes: Buffer.byteLength(rawKnowledge, "utf8"),
        metadata: { source: "dashboard" },
      });
    }

    for (const file of files) {
      if (!allowedTypes.has(file.type)) throw new Error("Formats acceptés : TXT, Markdown, CSV et JSON.");
      const bytes = Buffer.from(file.base64, "base64");
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error("Un fichier est vide ou dépasse 5 Mo.");
      const stored = await storagePut(`jawebflow/${userId}/${bot.id}/${safeFileName(file.name)}`, bytes, file.type);
      await addKnowledgeItem({
        id: randomUUID(),
        botId: savedBot.id,
        userId,
        kind: "file",
        title: file.name,
        storageKey: stored.key,
        storageUrl: stored.url,
        mimeType: file.type,
        sizeBytes: bytes.length,
        metadata: { source: "dashboard" },
      });
    }

    return { bot: savedBot, knowledge: await listKnowledgeItems(userId, savedBot.id) };
  },

  async getWidget(userId, botId) {
    return getOwnedBot(userId, botId);
  },

  async recordMessage({ userId, botId, message }) {
    const [user, bot] = await Promise.all([getJawebflowUserById(userId), getOwnedBot(userId, botId)]);
    if (!user) throw new Error("Compte introuvable.");
    if (!bot) throw new Error("Bot introuvable.");
    if (user.subscriptionStatus !== "active") throw new Error("Active un abonnement pour utiliser l’API chatbot.");
    if (user.messagesUsed >= user.messagesLimit) throw new Error("Le quota de messages de votre plan est atteint.");
    if (!message.trim()) throw new Error("Le message ne peut pas être vide.");
    return incrementMessageUsage(userId);
  },

  async recordWidgetMessage({ botId, widgetToken, message }) {
    const bot = await getBotByWidgetCredentials(botId, widgetToken);
    if (!bot) throw new Error("Identifiants widget invalides.");
    return this.recordMessage({ userId: bot.userId, botId, message });
  },
};

export const localServices: JawebflowServices = {
  auth: localAuthAdapter,
  workspace: localWorkspaceAdapter,
};
