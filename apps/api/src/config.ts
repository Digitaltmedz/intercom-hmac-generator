import { z } from "zod";

/**
 * All konfiguration läses från miljövariabler. Se apps/api/.env.example.
 * Inga hemligheter får hårdkodas i koden.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),

  /** Postgres-anslutning. Lämnas tom i test, då används PGlite i minnet. */
  DATABASE_URL: z.string().optional(),

  /** Publik bas-URL för API:t, används i länkar. */
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),

  /** Webbas Website API. Bas-URL är kundens domän + /api/site. */
  WEBBAS_API_BASE_URL: z.string().url().optional(),
  WEBBAS_API_KEY: z.string().optional(),
  /** Medlemsgruppen i Webbas som ger tillgång till appen. */
  WEBBAS_MEMBER_GROUP_ID: z.coerce.number().int().positive().optional(),
  /** Hemlighet som Webbas skickar med standardwebhooks (order, kontakt m.m.). */
  WEBBAS_WEBHOOK_SECRET: z.string().optional(),
  /** Token som automationens webhook-steg i Webbas måste skicka med. */
  WEBBAS_AUTOMATION_TOKEN: z.string().optional(),
  /** Klockslag (0-23, serverns tidszon) för nattlig avstämning mot Webbas. */
  WEBBAS_SYNC_HOUR: z.coerce.number().int().min(0).max(23).default(3),

  /** Pepper för hashning av engångskoder och sessionstoken. */
  AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(90),

  /** Nyckel för adminanrop (innehållshantering, moderering). */
  ADMIN_API_KEY: z.string().optional(),

  /** E-postutskick av engångskoder. */
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("Kursappen <no-reply@example.com>"),
  RESEND_API_KEY: z.string().optional(),

  /** Media. */
  MEDIA_PROVIDER: z.enum(["passthrough", "bunny"]).default("passthrough"),
  MEDIA_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  BUNNY_STREAM_LIBRARY_ID: z.string().optional(),
  BUNNY_STREAM_CDN_HOSTNAME: z.string().optional(),
  BUNNY_STREAM_TOKEN_KEY: z.string().optional(),
  BUNNY_STORAGE_CDN_HOSTNAME: z.string().optional(),
  BUNNY_STORAGE_TOKEN_KEY: z.string().optional(),

  /** Push via Expo. */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /** Appens namn, används i mejl. */
  APP_NAME: z.string().default("Kursappen"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ogiltig konfiguration:\n${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!cfg.DATABASE_URL) missing.push("DATABASE_URL");
    if (!cfg.WEBBAS_API_BASE_URL) missing.push("WEBBAS_API_BASE_URL");
    if (!cfg.WEBBAS_API_KEY) missing.push("WEBBAS_API_KEY");
    if (!cfg.WEBBAS_MEMBER_GROUP_ID) missing.push("WEBBAS_MEMBER_GROUP_ID");
    if (!cfg.ADMIN_API_KEY) missing.push("ADMIN_API_KEY");
    if (cfg.AUTH_SECRET === "dev-only-secret-change-me-please") missing.push("AUTH_SECRET");
    if (missing.length) throw new Error(`Saknad konfiguration i produktion: ${missing.join(", ")}`);
  }
  return cfg;
}
