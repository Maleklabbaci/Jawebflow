import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router } from "../_core/trpc";
import { getJawebflowServices } from "../services";

const credentialsSchema = z.object({
  email: z.string().trim().email("Saisis une adresse email valide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(128),
});
const sessionSchema = z.object({ token: z.string().min(24) });

export async function requireLocalUser(token: string) {
  try {
    return await getJawebflowServices().auth.getSessionUser(token);
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ta session a expiré. Connecte-toi de nouveau." });
  }
}

export const localAuthRouter = router({
  register: publicProcedure.input(credentialsSchema).mutation(async ({ input }) => {
    try {
      return await getJawebflowServices().auth.register(input.email, input.password);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Impossible de créer le compte." });
    }
  }),
  login: publicProcedure.input(credentialsSchema).mutation(async ({ input }) => {
    try {
      return await getJawebflowServices().auth.login(input.email, input.password);
    } catch (error) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Connexion impossible." });
    }
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true as const };
  }),
  me: publicProcedure.input(sessionSchema.optional()).query(async ({ input }) => {
    if (!input?.token) return null;
    try {
      return await getJawebflowServices().auth.getSessionUser(input.token);
    } catch {
      return null;
    }
  }),
});
