import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import { entitlements, sessions, users } from "../db/schema.js";
import { hashSecret } from "../auth/tokens.js";
import type { AppContext } from "../context.js";

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  role: "member" | "admin";
  bannedAt: Date | null;
  acceptedTermsAt: Date | null;
  entitled: boolean;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthedUser | null;
    isAdminKey: boolean;
  }
}

export const authPlugin = fp(async (app, ctx: AppContext) => {
  app.decorateRequest("user", null);
  app.decorateRequest("isAdminKey", false);

  app.addHook("onRequest", async (req) => {
    req.user = null;
    req.isAdminKey = false;

    const adminKey = req.headers["x-admin-key"];
    if (typeof adminKey === "string" && ctx.config.ADMIN_API_KEY && adminKey === ctx.config.ADMIN_API_KEY) {
      req.isAdminKey = true;
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return;
    const token = auth.slice(7).trim();
    if (!token) return;
    const tokenHash = hashSecret(token, ctx.config.AUTH_SECRET);
    const now = new Date();

    const [row] = await ctx.db
      .select({
        sessionId: sessions.id,
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        bannedAt: users.bannedAt,
        acceptedTermsAt: users.acceptedTermsAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
    if (!row) return;

    const groupId = ctx.config.WEBBAS_MEMBER_GROUP_ID;
    let entitled = row.role === "admin";
    if (!entitled && groupId) {
      const [ent] = await ctx.db
        .select({ active: entitlements.active })
        .from(entitlements)
        .where(and(eq(entitlements.userId, row.id), eq(entitlements.webbasGroupId, groupId)));
      entitled = ent?.active ?? false;
    }

    req.user = { ...row, entitled };
    // Uppdatera "senast sedd" högst en gång per timme för att spara skrivningar.
    void ctx.db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, row.sessionId))
      .catch(() => undefined);
  });
});

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: "unauthorized", message: "Du behöver logga in." });
  if (req.user.bannedAt) return reply.code(403).send({ error: "banned", message: "Kontot är avstängt." });
}

export async function requireEntitled(req: FastifyRequest, reply: FastifyReply) {
  await requireUser(req, reply);
  if (reply.sent) return;
  if (!req.user!.entitled) {
    return reply.code(403).send({
      error: "not_entitled",
      message: "Din prenumeration är inte aktiv. Kontakta kursarrangören om du tror att det är fel.",
    });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.isAdminKey || req.user?.role === "admin") return;
  return reply.code(403).send({ error: "forbidden", message: "Kräver adminbehörighet." });
}
