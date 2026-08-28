import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { localAuthRouter } from "./routers/localAuth";
import { workspaceRouter } from "./routers/workspace";

export const appRouter = router({
  system: systemRouter,
  auth: localAuthRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
