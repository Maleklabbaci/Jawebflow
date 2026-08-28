import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

import {
  bots,
  jawebflowUsers,
  knowledgeItems,
  type Bot,
  type InsertUser,
  type JawebflowUser,
  type KnowledgeItem,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("La base de données est indisponible.");
  return db;
}

/** Retained for the template's built-in OAuth implementation. */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getJawebflowUserById(id: string): Promise<JawebflowUser | undefined> {
  const db = requireDb(await getDb());
  const result = await db.select().from(jawebflowUsers).where(eq(jawebflowUsers.id, id)).limit(1);
  return result[0];
}

export async function getPrimaryBotForUser(userId: string): Promise<Bot | undefined> {
  const db = requireDb(await getDb());
  const result = await db
    .select()
    .from(bots)
    .where(eq(bots.userId, userId))
    .orderBy(desc(bots.updatedAt))
    .limit(1);
  return result[0];
}

export async function getBotByWidgetCredentials(botId: string, widgetToken: string): Promise<Bot | undefined> {
  const db = requireDb(await getDb());
  const result = await db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.widgetToken, widgetToken))).limit(1);
  return result[0];
}

export async function getOwnedBot(userId: string, botId: string): Promise<Bot | undefined> {
  const db = requireDb(await getDb());
  const result = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .limit(1);
  return result[0];
}

export async function savePrimaryBot(input: {
  id: string;
  userId: string;
  businessName: string;
  websiteUrl?: string | null;
  businessCategory?: string | null;
  businessDescription?: string | null;
  pricingServicesText?: string | null;
  faqText?: string | null;
  specialRulesText?: string | null;
  assistantTone?: string;
  languages?: Record<string, boolean> | null;
  autoLeadCapture?: boolean;
  bubbleTheme?: string;
  bubblePosition?: string;
  widgetToken: string;
  rawKnowledge: string | null;
}) {
  const db = requireDb(await getDb());
  const existing = await getPrimaryBotForUser(input.userId);
  if (existing) {
    const updateValues = {
      businessName: input.businessName,
      websiteUrl: input.websiteUrl ?? null,
      businessCategory: input.businessCategory ?? null,
      businessDescription: input.businessDescription ?? null,
      pricingServicesText: input.pricingServicesText ?? null,
      faqText: input.faqText ?? null,
      specialRulesText: input.specialRulesText ?? null,
      assistantTone: input.assistantTone ?? "professionnel",
      languages: input.languages ?? null,
      autoLeadCapture: input.autoLeadCapture === false ? 0 : 1,
      bubbleTheme: input.bubbleTheme ?? "violet",
      bubblePosition: input.bubblePosition ?? "bottom-right",
      rawKnowledge: input.rawKnowledge,
    };
    await db.update(bots).set(updateValues).where(and(eq(bots.id, existing.id), eq(bots.userId, input.userId)));
    return { bot: { ...existing, ...updateValues }, created: false };
  }
  const insertValues = {
    id: input.id,
    userId: input.userId,
    businessName: input.businessName,
    websiteUrl: input.websiteUrl ?? null,
    businessCategory: input.businessCategory ?? null,
    businessDescription: input.businessDescription ?? null,
    pricingServicesText: input.pricingServicesText ?? null,
    faqText: input.faqText ?? null,
    specialRulesText: input.specialRulesText ?? null,
    assistantTone: input.assistantTone ?? "professionnel",
    languages: input.languages ?? null,
    autoLeadCapture: input.autoLeadCapture === false ? 0 : 1,
    bubbleTheme: input.bubbleTheme ?? "violet",
    bubblePosition: input.bubblePosition ?? "bottom-right",
    widgetToken: input.widgetToken,
    rawKnowledge: input.rawKnowledge,
  };
  await db.insert(bots).values(insertValues);
  return { bot: insertValues, created: true };
}

export async function addKnowledgeItem(input: {
  id: string;
  botId: string;
  userId: string;
  kind: "text" | "file";
  title: string;
  textContent?: string | null;
  storageKey?: string | null;
  storageUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDb());
  await db.insert(knowledgeItems).values({
    ...input,
    textContent: input.textContent ?? null,
    storageKey: input.storageKey ?? null,
    storageUrl: input.storageUrl ?? null,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? 0,
    metadata: input.metadata ?? {},
  });
}

export async function listKnowledgeItems(userId: string, botId: string): Promise<KnowledgeItem[]> {
  const db = requireDb(await getDb());
  return db
    .select()
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.userId, userId), eq(knowledgeItems.botId, botId)))
    .orderBy(desc(knowledgeItems.createdAt));
}

export async function incrementMessageUsage(userId: string) {
  const db = requireDb(await getDb());
  await db.update(jawebflowUsers)
    .set({ messagesUsed: sql`${jawebflowUsers.messagesUsed} + 1` })
    .where(eq(jawebflowUsers.id, userId));
  const user = await getJawebflowUserById(userId);
  if (!user) throw new Error("Compte introuvable.");
  return { messagesUsed: user.messagesUsed, messagesLimit: user.messagesLimit };
}
