import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { webhookEvents } from "../db/schema.js";
import { secretsMatch } from "../auth/tokens.js";
import { syncContext, type AppContext } from "../context.js";
import { applyMembershipChange, handleStandardWebhook, parseMembershipChange } from "../webbas/sync.js";

/**
 * Två ingångar från Webbas:
 *  1. /webhooks/webbas/standard  – standardwebhooks som skapas under
 *     Webbplatsinställningar > Integrationer (order, kontakt, produkt m.m.).
 *     Verifieras med hemligheten som anges där.
 *  2. /webhooks/webbas/membership?action=added|removed – webhook-steget i en
 *     automation med utlösaren "Tillagd i/borttagen från medlemsgrupp".
 *     Verifieras med en token i URL:en (?token=...) eller X-Automation-Token.
 *
 * Alla anrop sparas rått i webhook_events innan de behandlas.
 */
export async function webhookRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/webhooks/webbas/standard", { config: { rateLimit: false } }, async (req, reply) => {
    const secret = ctx.config.WEBBAS_WEBHOOK_SECRET;
    if (secret) {
      const provided = headerValue(req.headers["x-webhook-secret"]) ?? headerValue(req.headers["x-secret"]) ?? queryValue(req.query, "secret");
      if (!provided || !secretsMatch(provided, secret)) return reply.code(401).send({ error: "unauthorized" });
    }
    const q = z.object({ event: z.string().optional() }).parse(req.query ?? {});
    const payload = req.body ?? {};
    const eventType = q.event ?? inferEventType(payload);
    const [row] = await ctx.db.insert(webhookEvents).values({ source: "webbas_standard", eventType, payload }).returning({ id: webhookEvents.id });

    // Svara direkt, behandla i bakgrunden. Webbas kräver 2xx inom rimlig tid.
    void process(row!.id, () => handleStandardWebhook(syncContext(ctx), eventType, payload));
    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/webbas/membership", { config: { rateLimit: false } }, async (req, reply) => {
    const expected = ctx.config.WEBBAS_AUTOMATION_TOKEN;
    if (expected) {
      const provided = headerValue(req.headers["x-automation-token"]) ?? queryValue(req.query, "token");
      if (!provided || !secretsMatch(provided, expected)) return reply.code(401).send({ error: "unauthorized" });
    }
    const q = z.object({ action: z.enum(["added", "removed"]).optional() }).parse(req.query ?? {});
    const payload = req.body ?? {};
    const change = parseMembershipChange(payload, q.action);
    const [row] = await ctx.db
      .insert(webhookEvents)
      .values({ source: "webbas_automation", eventType: `membership_${change.action}`, payload })
      .returning({ id: webhookEvents.id });

    void process(row!.id, () => applyMembershipChange(syncContext(ctx), change));
    return reply.code(200).send({ ok: true });
  });

  async function process(eventId: string, fn: () => Promise<{ handled: string }>) {
    try {
      const res = await fn();
      await ctx.db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, eventId));
      ctx.logger.info({ eventId, handled: res.handled }, "Webhook behandlad");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.db.update(webhookEvents).set({ processedAt: new Date(), error: message }).where(eq(webhookEvents.id, eventId));
      ctx.logger.error({ eventId, err: e }, "Webhook misslyckades");
    }
  }
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function queryValue(query: unknown, key: string): string | undefined {
  if (query && typeof query === "object" && key in query) {
    const v = (query as Record<string, unknown>)[key];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

/** Gissar händelsetyp från innehållet när ?event= saknas. */
function inferEventType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const p = payload as Record<string, unknown>;
  if ("invoiceNo" in p || "customerEmail" in p) return "order_updated";
  if ("formName" in p) return "form_submitted";
  if ("eventId" in p && "start" in p) return "booking_created";
  if ("variants" in p || "title" in p) return "product_updated";
  if ("email" in p) return "contact_updated";
  return "unknown";
}
