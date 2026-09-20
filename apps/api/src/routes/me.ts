import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pushTokens, sessions, users } from "../db/schema.js";
import type { AppContext } from "../context.js";
import { syncContext } from "../context.js";
import { refreshUserFromWebbas } from "../webbas/sync.js";
import { requireUser } from "../plugins/auth.js";

export async function meRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/me", { preHandler: requireUser }, async (req) => {
    const u = req.user!;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      entitled: u.entitled,
      acceptedTerms: u.acceptedTermsAt !== null,
    };
  });

  /** Tvingar en färsk kontroll mot Webbas, t.ex. när kunden just betalat. */
  app.post("/me/refresh-entitlement", { preHandler: requireUser }, async (req) => {
    if (!ctx.config.WEBBAS_MEMBER_GROUP_ID) return { entitled: req.user!.entitled };
    const { active } = await refreshUserFromWebbas(syncContext(ctx), req.user!.email);
    return { entitled: active || req.user!.role === "admin" };
  });

  app.post("/me/accept-terms", { preHandler: requireUser }, async (req) => {
    await ctx.db.update(users).set({ acceptedTermsAt: new Date() }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  app.patch("/me", { preHandler: requireUser }, async (req) => {
    const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    await ctx.db.update(users).set({ name: body.name, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  app.post("/me/push-token", { preHandler: requireUser }, async (req) => {
    const body = z.object({ token: z.string().min(10), platform: z.enum(["ios", "android"]) }).parse(req.body);
    await ctx.db
      .insert(pushTokens)
      .values({ userId: req.user!.id, token: body.token, platform: body.platform })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.user!.id, platform: body.platform } });
    return { ok: true };
  });

  /** Radera konto (krav från Apple: appen måste erbjuda kontoradering). */
  app.delete("/me", { preHandler: requireUser }, async (req, reply) => {
    await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, req.user!.id));
    await ctx.db.delete(users).where(eq(users.id, req.user!.id));
    return reply.send({ ok: true });
  });
}
