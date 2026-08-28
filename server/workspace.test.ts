import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bot, KnowledgeItem } from "../drizzle/schema";
import type { JawebflowServices } from "./adapters/contracts";
import { appRouter } from "./routers";
import { setJawebflowServicesForTesting } from "./services";
import type { TrpcContext } from "./_core/context";

const merchantA = { id: "4f5e5958-9000-4d89-99c0-000000000001", email: "a@business.dz", name: "a", subscriptionStatus: "active" as const, plan: "pro", messagesUsed: 12, messagesLimit: 100 };
const merchantB = { id: "4f5e5958-9000-4d89-99c0-000000000002", email: "b@business.dz", name: "b", subscriptionStatus: "active" as const, plan: "pro", messagesUsed: 0, messagesLimit: 100 };
const merchantC = { id: "4f5e5958-9000-4d89-99c0-000000000003", email: "c@business.dz", name: "c", subscriptionStatus: "free" as const, plan: "free", messagesUsed: 0, messagesLimit: 100 };
const tokenA = "merchant-a-session-token-0001";
const tokenB = "merchant-b-session-token-0002";
const tokenC = "merchant-c-session-token-0003";
const botA: Bot = {
  id: "9944f460-e0a4-435f-8e44-000000000001",
  userId: merchantA.id,
  businessName: "Atelier Amel",
  widgetToken: "a3d2c1b5ef67d38b7c4d1a9e6f852a01",
  rawKnowledge: "Livraison à Alger.",
  createdAt: new Date("2026-08-27T00:00:00Z"),
  updatedAt: new Date("2026-08-27T00:00:00Z"),
};

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createServices(): JawebflowServices {
  const knowledge: KnowledgeItem[] = [];
  let usageA = merchantA.messagesUsed;
  return {
    auth: {
      register: vi.fn(),
      login: vi.fn(),
      getSessionUser: vi.fn(async token => {
        if (token === tokenA) return merchantA;
        if (token === tokenB) return merchantB;
        if (token === tokenC) return merchantC;
        throw new Error("Session invalide");
      }),
    },
    workspace: {
      getOverview: vi.fn(async userId => userId === merchantA.id ? { bot: botA, knowledge, metrics: { messagesUsed: usageA, messagesLimit: merchantA.messagesLimit, knowledgeCount: knowledge.length, botCount: 1 }, subscription: { status: merchantA.subscriptionStatus, plan: merchantA.plan, apiEnabled: true } } : { bot: undefined, knowledge: [], metrics: { messagesUsed: 0, messagesLimit: 100, knowledgeCount: 0, botCount: 0 }, subscription: { status: userId === merchantC.id ? merchantC.subscriptionStatus : merchantB.subscriptionStatus, plan: userId === merchantC.id ? merchantC.plan : merchantB.plan, apiEnabled: userId !== merchantC.id } }),
      saveBot: vi.fn(async input => {
        if (![merchantA.id, merchantC.id].includes(input.userId)) throw new Error("Accès refusé");
        const savedBot = { ...botA, userId: input.userId, businessName: input.businessName, bubbleTheme: input.bubbleTheme, bubblePosition: input.bubblePosition, rawKnowledge: input.rawKnowledge || null };
        return { bot: savedBot, knowledge };
      }),
      getWidget: vi.fn(async (userId, botId) => userId === merchantA.id && botId === botA.id ? botA : undefined),
      recordMessage: vi.fn(async ({ userId }) => userId === merchantA.id ? { messagesUsed: ++usageA, messagesLimit: merchantA.messagesLimit } : { messagesUsed: 1, messagesLimit: merchantC.messagesLimit }),
      recordWidgetMessage: vi.fn(async ({ botId, widgetToken }) => botId === botA.id && widgetToken === botA.widgetToken ? { messagesUsed: ++usageA, messagesLimit: merchantA.messagesLimit } : { messagesUsed: 1, messagesLimit: merchantC.messagesLimit }),
    },
  };
}

afterEach(() => setJawebflowServicesForTesting(null));

describe("workspace procedures", () => {
  it("returns only the signed-in merchant’s bot overview", async () => {
    setJawebflowServicesForTesting(createServices());
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.overview({ token: tokenA })).resolves.toMatchObject({ bot: { id: botA.id, userId: merchantA.id } });
    await expect(caller.workspace.overview({ token: tokenB })).resolves.toMatchObject({ bot: undefined, knowledge: [] });
  });

  it("creates the exact individual widget snippet after saving the bot", async () => {
    setJawebflowServicesForTesting(createServices());
    const caller = appRouter.createCaller(createContext());

    const result = await caller.workspace.saveBot({
      token: tokenA,
      businessName: "Atelier Amel",
      businessCategory: "Services & Agence",
      businessDescription: "Agence de services pour entreprises algériennes.",
      rawKnowledge: "Prix : 3 500 DA.",
      bubbleTheme: "cyan",
      bubblePosition: "bottom-left",
      files: [],
    });

    expect(result.widgetSnippet).toContain('data-theme="cyan" data-position="bottom-left"');
  });

  it("blocks access to another merchant’s widget", async () => {
    setJawebflowServicesForTesting(createServices());
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.getWidget({ token: tokenB, botId: botA.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not issue a widget script for a free account", async () => {
    setJawebflowServicesForTesting(createServices());
    const caller = appRouter.createCaller(createContext());

    const result = await caller.workspace.saveBot({ token: tokenC, businessName: "Studio C", businessCategory: "Services & Agence", businessDescription: "Studio de services digitaux pour entreprises.", rawKnowledge: "", files: [] });

    expect(result.widgetSnippet).toBeNull();
    expect(result.subscriptionRequired).toBe(true);
  });

  it("blocks API widget access for a free account", async () => {
    setJawebflowServicesForTesting(createServices());
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.getWidget({ token: tokenC, botId: botA.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records a message for an active account", async () => {
    const services = createServices();
    setJawebflowServicesForTesting(services);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.recordMessage({ token: tokenA, botId: botA.id, message: "Bonjour" })).resolves.toEqual({ messagesUsed: merchantA.messagesUsed + 1, messagesLimit: merchantA.messagesLimit });
    expect(services.workspace.recordMessage).toHaveBeenCalledWith({ userId: merchantA.id, botId: botA.id, message: "Bonjour" });
  });

  it("records a public widget message with the widget credentials", async () => {
    const services = createServices();
    setJawebflowServicesForTesting(services);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.recordWidgetMessage({ botId: botA.id, widgetToken: botA.widgetToken, message: "Je souhaite un devis" })).resolves.toEqual({ messagesUsed: merchantA.messagesUsed + 1, messagesLimit: merchantA.messagesLimit });
    expect(services.workspace.recordWidgetMessage).toHaveBeenCalledWith({ botId: botA.id, widgetToken: botA.widgetToken, message: "Je souhaite un devis" });
  });

  it("reflects widget consumption in the next overview", async () => {
    const services = createServices();
    setJawebflowServicesForTesting(services);
    const caller = appRouter.createCaller(createContext());

    await caller.workspace.recordWidgetMessage({ botId: botA.id, widgetToken: botA.widgetToken, message: "Bonjour" });
    await expect(caller.workspace.overview({ token: tokenA })).resolves.toMatchObject({ metrics: { messagesUsed: merchantA.messagesUsed + 1 } });
  });

  it("rejects unsupported knowledge file types before persistence", async () => {
    const services = createServices();
    setJawebflowServicesForTesting(services);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.workspace.saveBot({
      token: tokenA,
      businessName: "Atelier Amel",
      businessCategory: "Services & Agence",
      businessDescription: "Agence de services pour entreprises algériennes.",
      rawKnowledge: "",
      files: [{ name: "catalogue.pdf", type: "application/pdf", size: 7, base64: "Zm9vYmFy" }],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.workspace.saveBot).not.toHaveBeenCalled();
  });
});
