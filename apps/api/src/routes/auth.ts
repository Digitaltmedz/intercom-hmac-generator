import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { otpCodes, sessions, users } from "../db/schema.js";
import { generateOtpCode, generateSessionToken, hashSecret, secretsMatch } from "../auth/tokens.js";
import { normalizeEmail } from "../webbas/client.js";
import { refreshUserFromWebbas } from "../webbas/sync.js";
import { syncContext, type AppContext } from "../context.js";
import { requireUser } from "../plugins/auth.js";

const MAX_ATTEMPTS = 5;

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * Steg 1: begär engångskod. Svarar alltid 200 så att ingen kan lista
   * vilka e-postadresser som finns. Koden skickas bara om personen finns
   * som medlem i Webbas-gruppen (eller redan är användare i appen).
   */
  app.post(
    "/auth/request-code",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const email = normalizeEmail(body.email);

      let eligible = false;
      const [existing] = await ctx.db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));
      if (existing) eligible = true;
      if (!eligible && ctx.config.WEBBAS_MEMBER_GROUP_ID) {
        try {
          const { active } = await refreshUserFromWebbas(syncContext(ctx), email);
          eligible = active;
        } catch (e) {
          ctx.logger.warn({ err: e }, "Kunde inte slå upp e-post i Webbas vid inloggning");
        }
      }

      if (eligible) {
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + ctx.config.OTP_TTL_MINUTES * 60_000);
        await ctx.db.insert(otpCodes).values({ email, codeHash: hashSecret(code, ctx.config.AUTH_SECRET), expiresAt });
        await ctx.email.send({
          to: email,
          subject: `${code} är din inloggningskod till ${ctx.config.APP_NAME}`,
          text: `Din inloggningskod är ${code}. Den gäller i ${ctx.config.OTP_TTL_MINUTES} minuter.\n\nHar du inte försökt logga in kan du ignorera det här mejlet.`,
        });
      } else {
        ctx.logger.info({ email }, "Inloggningsförsök för e-post utan aktivt medlemskap");
      }

      return reply.send({ ok: true, message: "Om adressen har ett aktivt medlemskap har vi skickat en kod." });
    },
  );

  /** Steg 2: verifiera kod och få sessionstoken. */
  app.post(
    "/auth/verify-code",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = z
        .object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/), deviceName: z.string().max(100).optional() })
        .parse(req.body);
      const email = normalizeEmail(body.email);
      const now = new Date();

      const [otp] = await ctx.db
        .select()
        .from(otpCodes)
        .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

      if (!otp || otp.attempts >= MAX_ATTEMPTS) {
        return reply.code(400).send({ error: "invalid_code", message: "Koden är fel eller har gått ut. Begär en ny." });
      }
      if (!secretsMatch(otp.codeHash, hashSecret(body.code, ctx.config.AUTH_SECRET))) {
        await ctx.db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
        return reply.code(400).send({ error: "invalid_code", message: "Fel kod. Försök igen." });
      }
      await ctx.db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, otp.id));

      let [user] = await ctx.db.select().from(users).where(eq(users.email, email));
      if (!user) {
        [user] = await ctx.db.insert(users).values({ email }).returning();
      }
      await ctx.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user!.id));

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + ctx.config.SESSION_TTL_DAYS * 86_400_000);
      await ctx.db.insert(sessions).values({
        userId: user!.id,
        tokenHash: hashSecret(token, ctx.config.AUTH_SECRET),
        deviceName: body.deviceName ?? null,
        expiresAt,
      });

      return reply.send({ token, expiresAt: expiresAt.toISOString() });
    },
  );

  app.post("/auth/logout", { preHandler: requireUser }, async (req, reply) => {
    await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.user!.sessionId));
    return reply.send({ ok: true });
  });
}
