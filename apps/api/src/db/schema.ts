import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Användare i appen. E-post är nyckeln mot Webbas. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
    webbasMemberId: integer("webbas_member_id"),
    webbasContactId: integer("webbas_contact_id"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedReason: text("banned_reason"),
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_webbas_member_id_idx").on(t.webbasMemberId),
  ],
);

/** Rättighet till appen, speglar medlemskap i en Webbas-medlemsgrupp. */
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    webbasGroupId: integer("webbas_group_id").notNull(),
    active: boolean("active").notNull().default(false),
    source: text("source", { enum: ["sync", "webhook", "manual"] }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("entitlements_user_group_idx").on(t.userId, t.webbasGroupId)],
);

/** Engångskoder för inloggning via e-post. */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_codes_email_idx").on(t.email)],
);

/** Inloggade sessioner. Token lagras bara hashad. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    deviceName: text("device_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_tokens_token_idx").on(t.token)],
);

/** Mediafiler: video (Bunny Stream), ljud och PDF (lagring/CDN). */
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["video", "audio", "pdf", "image"] }).notNull(),
  provider: text("provider", { enum: ["bunny_stream", "bunny_storage", "external"] }).notNull(),
  /** Bunny Stream video-guid eller sökväg i lagringen. */
  externalId: text("external_id").notNull(),
  /** Färdig URL för external-providern. */
  url: text("url"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  durationSeconds: integer("duration_seconds"),
  ...timestamps,
});

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(false),
    /** Om satt krävs just denna Webbas-grupp; annars räcker appens standardgrupp. */
    requiredGroupId: integer("required_group_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("courses_slug_idx").on(t.slug)],
);

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("modules_course_idx").on(t.courseId)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Brödtext i markdown, visas under spelaren. */
    body: text("body"),
    kind: text("kind", { enum: ["video", "audio", "pdf", "text"] }).notNull(),
    assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    /** Extra bilagor, t.ex. PDF till en videolektion. */
    attachmentAssetIds: jsonb("attachment_asset_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    durationSeconds: integer("duration_seconds"),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("lessons_module_idx").on(t.moduleId)],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    positionSeconds: integer("position_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const forumCategories = pgTable("forum_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const forumThreads = pgTable(
  "forum_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => forumCategories.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("forum_threads_category_idx").on(t.categoryId, t.lastPostAt)],
);

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull().references(() => forumThreads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forum_posts_thread_idx").on(t.threadId, t.createdAt)],
);

/** Rapporter från användare (krav från Apple för användarskapat innehåll). */
export const forumReports = pgTable("forum_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").references(() => forumPosts.id, { onDelete: "cascade" }),
  threadId: uuid("thread_id").references(() => forumThreads.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Blockeringar mellan användare (krav från Apple). */
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** Alla inkommande webhooks sparas rått, för felsökning och omkörning. */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source", { enum: ["webbas_standard", "webbas_automation"] }).notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  webbasGroupId: integer("webbas_group_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  membersSeen: integer("members_seen").notNull().default(0),
  activated: integer("activated").notNull().default(0),
  deactivated: integer("deactivated").notNull().default(0),
  error: text("error"),
});

export const schema = {
  users,
  entitlements,
  otpCodes,
  sessions,
  pushTokens,
  mediaAssets,
  courses,
  modules,
  lessons,
  lessonProgress,
  forumCategories,
  forumThreads,
  forumPosts,
  forumReports,
  userBlocks,
  webhookEvents,
  syncRuns,
};
