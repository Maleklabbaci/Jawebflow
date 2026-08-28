import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
  text,
} from "drizzle-orm/mysql-core";

/** User model retained for the template's built-in session infrastructure. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Temporary local identity store used while Supabase credentials are not configured.
 * The adapter boundary in server/auth.ts makes this replaceable with Supabase Auth.
 */
export const jawebflowUsers = mysqlTable(
  "jawebflow_users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    subscriptionStatus: mysqlEnum("subscription_status", ["free", "active", "past_due", "canceled"]).default("free").notNull(),
    plan: varchar("plan", { length: 32 }).default("free").notNull(),
    messagesUsed: int("messages_used").default(0).notNull(),
    messagesLimit: int("messages_limit").default(100).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("jawebflow_users_email_unique").on(table.email)],
);

export const bots = mysqlTable(
  "bots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    businessName: varchar("business_name", { length: 160 }).notNull(),
    websiteUrl: varchar("website_url", { length: 512 }),
    businessCategory: varchar("business_category", { length: 160 }),
    businessDescription: text("business_description"),
    pricingServicesText: text("pricing_services_text"),
    faqText: text("faq_text"),
    specialRulesText: text("special_rules_text"),
    assistantTone: varchar("assistant_tone", { length: 32 }).default("professionnel").notNull(),
    languages: json("languages"),
    autoLeadCapture: int("auto_lead_capture").default(1).notNull(),
    bubbleTheme: varchar("bubble_theme", { length: 32 }).default("violet").notNull(),
    bubblePosition: varchar("bubble_position", { length: 32 }).default("bottom-right").notNull(),
    widgetToken: varchar("widget_token", { length: 48 }).notNull(),
    rawKnowledge: text("raw_knowledge"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("bots_widget_token_unique").on(table.widgetToken),
    index("bots_user_id_idx").on(table.userId),
  ],
);

export const knowledgeItems = mysqlTable(
  "knowledge_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("bot_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    textContent: text("text_content"),
    storageKey: varchar("storage_key", { length: 512 }),
    storageUrl: varchar("storage_url", { length: 1024 }),
    mimeType: varchar("mime_type", { length: 127 }),
    sizeBytes: int("size_bytes").notNull().default(0),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    index("knowledge_items_bot_id_idx").on(table.botId),
    index("knowledge_items_user_id_idx").on(table.userId),
  ],
);

export type JawebflowUser = typeof jawebflowUsers.$inferSelect;
export type InsertJawebflowUser = typeof jawebflowUsers.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
