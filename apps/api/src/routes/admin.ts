import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  courses,
  entitlements,
  forumCategories,
  forumPosts,
  forumReports,
  forumThreads,
  lessons,
  mediaAssets,
  modules,
  sessions,
  syncRuns,
  users,
  webhookEvents,
} from "../db/schema.js";
import { syncContext, type AppContext } from "../context.js";
import { reconcileGroup } from "../webbas/sync.js";
import { requireAdmin } from "../plugins/auth.js";

/**
 * Adminyta för innehåll och moderering. Skyddas med X-Admin-Key (ADMIN_API_KEY)
 * eller inloggad användare med rollen admin. Används av admin-webben.
 */
export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", requireAdmin);

  // Webbas
  app.post("/admin/webbas/sync", async () => reconcileGroup(syncContext(ctx)));
  app.get("/admin/webbas/groups", async () => ({ groups: await ctx.webbas.listMemberGroups() }));
  app.get("/admin/webbas/webhooks", async () => ({ webhooks: await ctx.webbas.listWebhooks() }));
  /** Registrerar standardwebhooken mot det här API:t i Webbas. */
  app.post("/admin/webbas/webhooks/install", async () => {
    const target = `${ctx.config.PUBLIC_API_URL}/webhooks/webbas/standard`;
    const existing = await ctx.webbas.listWebhooks();
    if (existing.some((w) => w.target === target)) return { installed: false, reason: "finns redan" };
    const hook = await ctx.webbas.createWebhook({
      target,
      secret: ctx.config.WEBBAS_WEBHOOK_SECRET,
      events: ["order_created", "order_updated", "contact_updated"],
    });
    return { installed: true, hook };
  });
  app.get("/admin/sync-runs", async () => ({ runs: await ctx.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(50) }));
  app.get("/admin/webhook-events", async () => ({
    events: await ctx.db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(100),
  }));

  // Användare
  app.get("/admin/users", async (req) => {
    const q = z.object({ email: z.string().optional() }).parse(req.query ?? {});
    const rows = await ctx.db
      .select({ user: users, entitlement: entitlements })
      .from(users)
      .leftJoin(entitlements, eq(entitlements.userId, users.id))
      .where(q.email ? eq(users.email, q.email.toLowerCase()) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(200);
    return { users: rows };
  });
  app.post("/admin/users/:id/ban", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ reason: z.string().max(500).optional(), unban: z.boolean().optional() }).parse(req.body ?? {});
    await ctx.db
      .update(users)
      .set(body.unban ? { bannedAt: null, bannedReason: null } : { bannedAt: new Date(), bannedReason: body.reason ?? null })
      .where(eq(users.id, id));
    if (!body.unban) await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
    return { ok: true };
  });
  /** Manuell rättighet, t.ex. för testkonton och Apples granskare. */
  app.post("/admin/users/:id/entitlement", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ active: z.boolean() }).parse(req.body);
    const groupId = ctx.config.WEBBAS_MEMBER_GROUP_ID ?? 0;
    const now = new Date();
    await ctx.db
      .insert(entitlements)
      .values({ userId: id, webbasGroupId: groupId, active: body.active, source: "manual", activatedAt: body.active ? now : null, deactivatedAt: body.active ? null : now })
      .onConflictDoUpdate({
        target: [entitlements.userId, entitlements.webbasGroupId],
        set: { active: body.active, source: "manual", activatedAt: body.active ? now : null, deactivatedAt: body.active ? null : now, updatedAt: now },
      });
    return { ok: true };
  });
  app.post("/admin/users", async (req, reply) => {
    const body = z.object({ email: z.string().email(), name: z.string().optional(), role: z.enum(["member", "admin"]).default("member") }).parse(req.body);
    const [u] = await ctx.db
      .insert(users)
      .values({ email: body.email.toLowerCase(), name: body.name ?? null, role: body.role })
      .onConflictDoUpdate({ target: users.email, set: { role: body.role, updatedAt: new Date() } })
      .returning();
    return reply.code(201).send(u);
  });

  // Media
  app.get("/admin/assets", async () => ({ assets: await ctx.db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(500) }));
  app.post("/admin/assets", async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(["video", "audio", "pdf", "image"]),
        provider: z.enum(["bunny_stream", "bunny_storage", "external"]),
        externalId: z.string().min(1),
        url: z.string().url().optional(),
        mimeType: z.string().optional(),
        sizeBytes: z.number().int().optional(),
        durationSeconds: z.number().int().optional(),
      })
      .parse(req.body);
    const [a] = await ctx.db.insert(mediaAssets).values({ ...body, url: body.url ?? null }).returning();
    return reply.code(201).send(a);
  });
  app.delete("/admin/assets/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    return { ok: true };
  });

  // Kurser, moduler, lektioner
  const courseInput = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    description: z.string().optional(),
    coverImageUrl: z.string().url().optional(),
    sortOrder: z.number().int().default(0),
    published: z.boolean().default(false),
    requiredGroupId: z.number().int().optional(),
  });
  app.get("/admin/courses", async () => {
    const rows = await ctx.db.select().from(courses).orderBy(asc(courses.sortOrder));
    const mods = await ctx.db.select().from(modules).orderBy(asc(modules.sortOrder));
    const les = await ctx.db.select().from(lessons).orderBy(asc(lessons.sortOrder));
    return {
      courses: rows.map((c) => ({
        ...c,
        modules: mods.filter((m) => m.courseId === c.id).map((m) => ({ ...m, lessons: les.filter((l) => l.moduleId === m.id) })),
      })),
    };
  });
  app.post("/admin/courses", async (req, reply) => {
    const body = courseInput.parse(req.body);
    const [c] = await ctx.db.insert(courses).values(body).returning();
    return reply.code(201).send(c);
  });
  app.patch("/admin/courses/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = courseInput.partial().parse(req.body);
    await ctx.db.update(courses).set({ ...body, updatedAt: new Date() }).where(eq(courses.id, id));
    return { ok: true };
  });
  app.delete("/admin/courses/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(courses).where(eq(courses.id, id));
    return { ok: true };
  });

  const moduleInput = z.object({ title: z.string().min(1), description: z.string().optional(), sortOrder: z.number().int().default(0), published: z.boolean().default(true) });
  app.post("/admin/courses/:courseId/modules", async (req, reply) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.params);
    const body = moduleInput.parse(req.body);
    const [m] = await ctx.db.insert(modules).values({ ...body, courseId }).returning();
    return reply.code(201).send(m);
  });
  app.patch("/admin/modules/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = moduleInput.partial().parse(req.body);
    await ctx.db.update(modules).set({ ...body, updatedAt: new Date() }).where(eq(modules.id, id));
    return { ok: true };
  });
  app.delete("/admin/modules/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(modules).where(eq(modules.id, id));
    return { ok: true };
  });

  const lessonInput = z.object({
    title: z.string().min(1),
    body: z.string().optional(),
    kind: z.enum(["video", "audio", "pdf", "text"]),
    assetId: z.string().uuid().nullable().optional(),
    attachmentAssetIds: z.array(z.string().uuid()).default([]),
    durationSeconds: z.number().int().optional(),
    sortOrder: z.number().int().default(0),
    published: z.boolean().default(true),
  });
  app.post("/admin/modules/:moduleId/lessons", async (req, reply) => {
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(req.params);
    const body = lessonInput.parse(req.body);
    const [l] = await ctx.db.insert(lessons).values({ ...body, moduleId }).returning();
    return reply.code(201).send(l);
  });
  app.patch("/admin/lessons/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = lessonInput.partial().parse(req.body);
    await ctx.db.update(lessons).set({ ...body, updatedAt: new Date() }).where(eq(lessons.id, id));
    return { ok: true };
  });
  app.delete("/admin/lessons/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(lessons).where(eq(lessons.id, id));
    return { ok: true };
  });

  // Forum: kategorier och moderering
  const categoryInput = z.object({ title: z.string().min(1), description: z.string().optional(), sortOrder: z.number().int().default(0) });
  app.post("/admin/forum/categories", async (req, reply) => {
    const [c] = await ctx.db.insert(forumCategories).values(categoryInput.parse(req.body)).returning();
    return reply.code(201).send(c);
  });
  app.patch("/admin/forum/categories/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.update(forumCategories).set({ ...categoryInput.partial().parse(req.body), updatedAt: new Date() }).where(eq(forumCategories.id, id));
    return { ok: true };
  });
  app.delete("/admin/forum/categories/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(forumCategories).where(eq(forumCategories.id, id));
    return { ok: true };
  });
  app.get("/admin/forum/reports", async () => {
    const rows = await ctx.db
      .select({ report: forumReports, post: forumPosts, thread: forumThreads, reporter: { id: users.id, email: users.email } })
      .from(forumReports)
      .innerJoin(users, eq(users.id, forumReports.reporterId))
      .leftJoin(forumPosts, eq(forumPosts.id, forumReports.postId))
      .leftJoin(forumThreads, eq(forumThreads.id, forumReports.threadId))
      .where(isNull(forumReports.resolvedAt))
      .orderBy(asc(forumReports.createdAt));
    return { reports: rows };
  });
  app.post("/admin/forum/reports/:id/resolve", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ resolution: z.string().max(500).default("") }).parse(req.body ?? {});
    await ctx.db.update(forumReports).set({ resolvedAt: new Date(), resolution: body.resolution }).where(eq(forumReports.id, id));
    return { ok: true };
  });
  app.post("/admin/forum/posts/:id/hide", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ reason: z.string().max(500).optional(), unhide: z.boolean().optional() }).parse(req.body ?? {});
    await ctx.db
      .update(forumPosts)
      .set(body.unhide ? { hiddenAt: null, hiddenReason: null } : { hiddenAt: new Date(), hiddenReason: body.reason ?? "moderated" })
      .where(eq(forumPosts.id, id));
    return { ok: true };
  });
  app.post("/admin/forum/threads/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional(), hidden: z.boolean().optional() }).parse(req.body ?? {});
    await ctx.db
      .update(forumThreads)
      .set({
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        ...(body.locked !== undefined ? { locked: body.locked } : {}),
        ...(body.hidden !== undefined ? { hiddenAt: body.hidden ? new Date() : null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(forumThreads.id, id)));
    return { ok: true };
  });
}
