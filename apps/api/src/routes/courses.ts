import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { courses, lessonProgress, lessons, mediaAssets, modules } from "../db/schema.js";
import type { AppContext } from "../context.js";
import { requireEntitled } from "../plugins/auth.js";

export async function courseRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/courses", { preHandler: requireEntitled }, async () => {
    const rows = await ctx.db
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        description: courses.description,
        coverImageUrl: courses.coverImageUrl,
      })
      .from(courses)
      .where(eq(courses.published, true))
      .orderBy(asc(courses.sortOrder), asc(courses.title));
    return { courses: rows };
  });

  app.get("/courses/:id", { preHandler: requireEntitled }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [course] = await ctx.db.select().from(courses).where(and(eq(courses.id, id), eq(courses.published, true)));
    if (!course) return reply.code(404).send({ error: "not_found" });

    const mods = await ctx.db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, id), eq(modules.published, true)))
      .orderBy(asc(modules.sortOrder));
    const moduleIds = mods.map((m) => m.id);
    const lessonRows = moduleIds.length
      ? await ctx.db
          .select({
            id: lessons.id,
            moduleId: lessons.moduleId,
            title: lessons.title,
            kind: lessons.kind,
            durationSeconds: lessons.durationSeconds,
            sortOrder: lessons.sortOrder,
          })
          .from(lessons)
          .where(and(inArray(lessons.moduleId, moduleIds), eq(lessons.published, true)))
          .orderBy(asc(lessons.sortOrder))
      : [];
    const progress = lessonRows.length
      ? await ctx.db
          .select({ lessonId: lessonProgress.lessonId, completed: lessonProgress.completed, positionSeconds: lessonProgress.positionSeconds })
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, req.user!.id), inArray(lessonProgress.lessonId, lessonRows.map((l) => l.id))))
      : [];
    const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverImageUrl: course.coverImageUrl,
      modules: mods.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        lessons: lessonRows
          .filter((l) => l.moduleId === m.id)
          .map((l) => ({
            id: l.id,
            title: l.title,
            kind: l.kind,
            durationSeconds: l.durationSeconds,
            completed: progressByLesson.get(l.id)?.completed ?? false,
            positionSeconds: progressByLesson.get(l.id)?.positionSeconds ?? 0,
          })),
      })),
    };
  });

  /** Lektion med signerade medialänkar. Länkarna är kortlivade. */
  app.get("/lessons/:id", { preHandler: requireEntitled }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await ctx.db
      .select({ lesson: lessons, module: modules, course: courses })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(and(eq(lessons.id, id), eq(lessons.published, true), eq(courses.published, true)));
    if (!row) return reply.code(404).send({ error: "not_found" });

    const assetIds = [row.lesson.assetId, ...row.lesson.attachmentAssetIds].filter((x): x is string => Boolean(x));
    const assets = assetIds.length ? await ctx.db.select().from(mediaAssets).where(inArray(mediaAssets.id, assetIds)) : [];
    const ttl = ctx.config.MEDIA_URL_TTL_SECONDS;
    const signed = new Map(
      assets.map((a) => [
        a.id,
        { ...ctx.media.sign({ kind: a.kind, provider: a.provider, externalId: a.externalId, url: a.url }, { ttlSeconds: ttl }), kind: a.kind, mimeType: a.mimeType, durationSeconds: a.durationSeconds },
      ]),
    );
    const [progress] = await ctx.db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, req.user!.id), eq(lessonProgress.lessonId, id)));

    return {
      id: row.lesson.id,
      title: row.lesson.title,
      body: row.lesson.body,
      kind: row.lesson.kind,
      durationSeconds: row.lesson.durationSeconds,
      course: { id: row.course.id, title: row.course.title },
      module: { id: row.module.id, title: row.module.title },
      media: row.lesson.assetId ? (signed.get(row.lesson.assetId) ?? null) : null,
      attachments: row.lesson.attachmentAssetIds.map((aid) => ({ id: aid, ...(signed.get(aid) ?? {}) })).filter((a) => "url" in a),
      progress: { positionSeconds: progress?.positionSeconds ?? 0, completed: progress?.completed ?? false },
    };
  });

  app.put("/lessons/:id/progress", { preHandler: requireEntitled }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ positionSeconds: z.number().int().min(0).optional(), completed: z.boolean().optional() }).parse(req.body);
    const now = new Date();
    await ctx.db
      .insert(lessonProgress)
      .values({
        userId: req.user!.id,
        lessonId: id,
        positionSeconds: body.positionSeconds ?? 0,
        completed: body.completed ?? false,
        completedAt: body.completed ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          ...(body.positionSeconds !== undefined ? { positionSeconds: body.positionSeconds } : {}),
          ...(body.completed !== undefined ? { completed: body.completed, completedAt: body.completed ? now : null } : {}),
          updatedAt: now,
        },
      });
    return { ok: true };
  });
}
