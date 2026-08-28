import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../_core/trpc";
import { getJawebflowServices } from "../services";
import { makeWidgetSnippet } from "../widget";
import { requireLocalUser } from "./localAuth";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const allowedTypes = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
const sessionInput = z.object({ token: z.string().min(24) });
const fileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(127),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  base64: z.string().min(8),
});

export const workspaceRouter = router({
  overview: publicProcedure.input(sessionInput).query(async ({ input }) => {
    const user = await requireLocalUser(input.token);
    const result = await getJawebflowServices().workspace.getOverview(user.id);
    return {
      ...result,
      widgetSnippet: result.bot && user.subscriptionStatus === "active" ? makeWidgetSnippet(result.bot.id, result.bot.widgetToken, result.bot.bubbleTheme, result.bot.bubblePosition) : null,
    };
  }),
  saveBot: publicProcedure.input(z.object({
    token: z.string().min(24),
    businessName: z.string().trim().min(2, "Indique le nom de ton business.").max(160),
    websiteUrl: z.string().trim().url("Indique une URL valide.").max(512).optional().or(z.literal("")),
    businessCategory: z.string().trim().min(2, "Indique le domaine de ton business.").max(160),
    businessDescription: z.string().trim().min(10, "Ajoute une description de ton activité.").max(12000),
    pricingServicesText: z.string().trim().max(12000).optional().default(""),
    faqText: z.string().trim().max(12000).optional().default(""),
    specialRulesText: z.string().trim().max(6000).optional().default(""),
    assistantTone: z.string().trim().max(32).optional().default("professionnel"),
    languages: z.record(z.string(), z.boolean()).optional().default({ fr: true, darija: true }),
    autoLeadCapture: z.boolean().optional().default(true),
    bubbleTheme: z.enum(["violet", "cyan", "orange", "mono"]).optional().default("violet"),
    bubblePosition: z.enum(["bottom-right", "bottom-left"]).optional().default("bottom-right"),
    rawKnowledge: z.string().trim().max(24000).optional().default(""),
    files: z.array(fileSchema).max(MAX_FILES).optional().default([]),
  })).mutation(async ({ input }) => {
    const user = await requireLocalUser(input.token);
    if (input.files.some(file => !allowedTypes.has(file.type))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Formats acceptés : TXT, Markdown, CSV et JSON." });
    }
    try {
      const result = await getJawebflowServices().workspace.saveBot({
        ...input,
        languages: input.languages as Record<string, boolean>,
        userId: user.id,
      });
      return {
        ...result,
        widgetSnippet: user.subscriptionStatus === "active" ? makeWidgetSnippet(result.bot.id, result.bot.widgetToken, result.bot.bubbleTheme, result.bot.bubblePosition) : null,
        subscriptionRequired: user.subscriptionStatus !== "active",
      };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Impossible d’enregistrer le bot." });
    }
  }),
  getWidget: publicProcedure.input(z.object({ token: z.string().min(24), botId: z.string().uuid() })).query(async ({ input }) => {
    const user = await requireLocalUser(input.token);
    if (user.subscriptionStatus !== "active") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Active un abonnement pour débloquer l’API et le script widget." });
    }
    const bot = await getJawebflowServices().workspace.getWidget(user.id, input.botId);
    if (!bot) throw new TRPCError({ code: "NOT_FOUND", message: "Bot introuvable." });
    return { botId: bot.id, widgetSnippet: makeWidgetSnippet(bot.id, bot.widgetToken, bot.bubbleTheme, bot.bubblePosition) };
  }),
  recordMessage: publicProcedure.input(z.object({
    token: z.string().min(24),
    botId: z.string().uuid(),
    message: z.string().trim().min(1).max(4000),
  })).mutation(async ({ input }) => {
    const user = await requireLocalUser(input.token);
    if (user.subscriptionStatus !== "active") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Active un abonnement pour utiliser l’API chatbot." });
    }
    try {
      return await getJawebflowServices().workspace.recordMessage({ userId: user.id, botId: input.botId, message: input.message });
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Message refusé." });
    }
  }),
  recordWidgetMessage: publicProcedure.input(z.object({
    botId: z.string().uuid(),
    widgetToken: z.string().regex(/^[a-f0-9]{32}$/),
    message: z.string().trim().min(1).max(4000),
  })).mutation(async ({ input }) => {
    try {
      return await getJawebflowServices().workspace.recordWidgetMessage(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Message refusé.";
      throw new TRPCError({ code: message.includes("abonnement") ? "FORBIDDEN" : "BAD_REQUEST", message });
    }
  }),
});
