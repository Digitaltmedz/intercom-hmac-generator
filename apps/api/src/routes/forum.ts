import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { forumCategories, forumPosts, forumReports, forumThreads, userBlocks, users } from "../db/schema.js";
import type { AppContext } from "../context.js";
import { requireEntitled } from "../plugins/auth.js";

const PAGE = 30;

export async function forumRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Användare som den inloggade blockerat, deras inlägg filtreras bort. */
  async function blockedIds(userId: string): Promise<string[]> {
    const rows = await ctx.db.select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.blockerId, userId));
    return rows.map((r) => r.id);
  }

  async function requireTerms(req: Parameters<typeof requireEntitled>[0], reply: Parameters<typeof requireEntitled>[1]) {
    await requireEntitled(req, reply);
    if (reply.sent) return;
    if (!req.user!.acceptedTermsAt) {
      return reply.code(403).send({ error: "terms_required", message: "Du behöver godkänna forumets regler först." });
    }
  }

  app.get("/forum/categories", { preHandler: requireEntitled }, async () => {
    const rows = await ctx.db
      .select({
        id: forumCategories.id,
        title: forumCategories.title,
        description: forumCategories.description,
        threadCount: sql<number>`(select count(*) from ${forumThreads} where ${forumThreads.categoryId} = ${forumCategories.id} and ${forumThreads.hiddenAt} is null)`.mapWith(Number),
      })
      .from(forumCategories)
      .orderBy(asc(forumCategories.sortOrder));
    return { categories: rows };
  });

  app.get("/forum/categories/:id/threads", { preHandler: requireEntitled }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ before: z.string().datetime().optional() }).parse(req.query);
    const blocked = await blockedIds(req.user!.id);
    const rows = await ctx.db
      .select({
        id: forumThreads.id,
        title: forumThreads.title,
        pinned: forumThreads.pinned,
        locked: forumThreads.locked,
        createdAt: forumThreads.createdAt,
        lastPostAt: forumThreads.lastPostAt,
        author: { id: users.id, name: users.name },
        postCount: sql<number>`(select count(*) from ${forumPosts} where ${forumPosts.threadId} = ${forumThreads.id} and ${forumPosts.hiddenAt} is null)`.mapWith(Number),
      })
      .from(forumThreads)
      .innerJoin(users, eq(users.id, forumThreads.authorId))
      .where(
        and(
          eq(forumThreads.categoryId, id),
          isNull(forumThreads.hiddenAt),
          blocked.length ? notInArray(forumThreads.authorId, blocked) : undefined,
          q.before ? lt(forumThreads.lastPostAt, new Date(q.before)) : undefined,
        ),
      )
      .orderBy(desc(forumThreads.pinned), desc(forumThreads.lastPostAt))
      .limit(PAGE);
    return { threads: rows, nextBefore: rows.length === PAGE ? rows[rows.length - 1]!.lastPostAt.toISOString() : null };
  });

  app.post("/forum/categories/:id/threads", { preHandler: requireTerms }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(1).max(10_000) }).parse(req.body);
    const [cat] = await ctx.db.select({ id: forumCategories.id }).from(forumCategories).where(eq(forumCategories.id, id));
    if (!cat) return reply.code(404).send({ error: "not_found" });
    const [thread] = await ctx.db
      .insert(forumThreads)
      .values({ categoryId: id, authorId: req.user!.id, title: body.title })
      .returning();
    await ctx.db.insert(forumPosts).values({ threadId: thread!.id, authorId: req.user!.id, body: body.body });
    return reply.code(201).send({ id: thread!.id });
  });

  app.get("/forum/threads/:id", { preHandler: requireEntitled }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [thread] = await ctx.db
      .select({
        id: forumThreads.id,
        title: forumThreads.title,
        pinned: forumThreads.pinned,
        locked: forumThreads.locked,
        categoryId: forumThreads.categoryId,
        createdAt: forumThreads.createdAt,
        author: { id: users.id, name: users.name },
      })
      .from(forumThreads)
      .innerJoin(users, eq(users.id, forumThreads.authorId))
      .where(and(eq(forumThreads.id, id), isNull(forumThreads.hiddenAt)));
    if (!thread) return reply.code(404).send({ error: "not_found" });
    const blocked = await blockedIds(req.user!.id);
    const posts = await ctx.db
      .select({
        id: forumPosts.id,
        body: forumPosts.body,
        createdAt: forumPosts.createdAt,
        editedAt: forumPosts.editedAt,
        author: { id: users.id, name: users.name },
      })
      .from(forumPosts)
      .innerJoin(users, eq(users.id, forumPosts.authorId))
      .where(and(eq(forumPosts.threadId, id), isNull(forumPosts.hiddenAt), blocked.length ? notInArray(forumPosts.authorId, blocked) : undefined))
      .orderBy(asc(forumPosts.createdAt));
    return { ...thread, posts, me: req.user!.id };
  });

  app.post("/forum/threads/:id/posts", { preHandler: requireTerms }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ body: z.string().trim().min(1).max(10_000) }).parse(req.body);
    const [thread] = await ctx.db.select().from(forumThreads).where(and(eq(forumThreads.id, id), isNull(forumThreads.hiddenAt)));
    if (!thread) return reply.code(404).send({ error: "not_found" });
    if (thread.locked) return reply.code(403).send({ error: "locked", message: "Tråden är låst." });
    const now = new Date();
    const [post] = await ctx.db.insert(forumPosts).values({ threadId: id, authorId: req.user!.id, body: body.body }).returning();
    await ctx.db.update(forumThreads).set({ lastPostAt: now, updatedAt: now }).where(eq(forumThreads.id, id));
    return reply.code(201).send({ id: post!.id });
  });

  app.patch("/forum/posts/:id", { preHandler: requireTerms }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ body: z.string().trim().min(1).max(10_000) }).parse(req.body);
    const res = await ctx.db
      .update(forumPosts)
      .set({ body: body.body, editedAt: new Date() })
      .where(and(eq(forumPosts.id, id), eq(forumPosts.authorId, req.user!.id), isNull(forumPosts.hiddenAt)))
      .returning({ id: forumPosts.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  /** Egna inlägg kan tas bort (döljs). */
  app.delete("/forum/posts/:id", { preHandler: requireEntitled }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const res = await ctx.db
      .update(forumPosts)
      .set({ hiddenAt: new Date(), hiddenReason: "removed_by_author" })
      .where(and(eq(forumPosts.id, id), eq(forumPosts.authorId, req.user!.id), isNull(forumPosts.hiddenAt)))
      .returning({ id: forumPosts.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  /** Rapportera inlägg eller tråd. */
  app.post("/forum/reports", { preHandler: requireEntitled }, async (req, reply) => {
    const body = z
      .object({ postId: z.string().uuid().optional(), threadId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(1000) })
      .refine((b) => b.postId || b.threadId, { message: "postId eller threadId krävs" })
      .parse(req.body);
    await ctx.db.insert(forumReports).values({ reporterId: req.user!.id, postId: body.postId ?? null, threadId: body.threadId ?? null, reason: body.reason });
    return reply.code(201).send({ ok: true, message: "Tack, vi tittar på rapporten inom 24 timmar." });
  });

  /** Blockera användare: hens trådar och inlägg döljs för mig. */
  app.post("/forum/blocks/:userId", { preHandler: requireEntitled }, async (req, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    if (userId === req.user!.id) return reply.code(400).send({ error: "bad_request" });
    await ctx.db.insert(userBlocks).values({ blockerId: req.user!.id, blockedId: userId }).onConflictDoNothing();
    return { ok: true };
  });

  app.delete("/forum/blocks/:userId", { preHandler: requireEntitled }, async (req) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    await ctx.db.delete(userBlocks).where(and(eq(userBlocks.blockerId, req.user!.id), eq(userBlocks.blockedId, userId)));
    return { ok: true };
  });

  app.get("/forum/blocks", { preHandler: requireEntitled }, async (req) => {
    const rows = await ctx.db
      .select({ id: users.id, name: users.name })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, req.user!.id));
    return { blocked: rows };
  });

  // Tystar oanvänd import-varning för `or` i vissa TS-lägen.
  void or;
}
