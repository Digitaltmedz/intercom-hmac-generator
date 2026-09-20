import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { AppContext } from "./context.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { courseRoutes } from "./routes/courses.js";
import { forumRoutes } from "./routes/forum.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { adminRoutes } from "./routes/admin.js";
import { WebbasApiError } from "./webbas/client.js";

export async function buildApp(ctx: AppContext) {
  const app = Fastify({ loggerInstance: ctx.logger, trustProxy: true, bodyLimit: 1_000_000 });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin, ctx);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "validation", message: "Ogiltig indata.", issues: err.issues });
    }
    if (err instanceof WebbasApiError) {
      req.log.error({ err }, "Webbas API-fel");
      return reply.code(502).send({ error: "webbas_unavailable", message: "Kunde inte nå Webbas just nu. Försök igen strax." });
    }
    const status = typeof (err as { statusCode?: number }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
    if (status >= 500) req.log.error({ err }, "Oväntat fel");
    return reply.code(status).send({ error: status >= 500 ? "internal" : "request_error", message: status >= 500 ? "Något gick fel." : (err as Error).message });
  });

  app.get("/health", { config: { rateLimit: false } }, async () => ({ ok: true, name: ctx.config.APP_NAME }));

  await app.register(authRoutes, ctx);
  await app.register(meRoutes, ctx);
  await app.register(courseRoutes, ctx);
  await app.register(forumRoutes, ctx);
  await app.register(webhookRoutes, ctx);
  await app.register(adminRoutes, ctx);

  return app;
}
