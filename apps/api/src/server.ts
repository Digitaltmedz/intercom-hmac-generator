import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { connectDb } from "./db/client.js";
import { WebbasClient } from "./webbas/client.js";
import { ConsoleEmailProvider, ResendEmailProvider, type EmailProvider } from "./email/provider.js";
import { BunnyMediaProvider, PassthroughMediaProvider, type MediaProvider } from "./media/provider.js";
import { buildApp } from "./app.js";
import { startNightlySync } from "./jobs/scheduler.js";
import type { AppContext } from "./context.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const dbHandle = await connectDb(config.DATABASE_URL);
if (!config.DATABASE_URL) logger.warn("DATABASE_URL saknas, kör med PGlite i minnet (data försvinner vid omstart)");

const webbas = new WebbasClient({
  baseUrl: config.WEBBAS_API_BASE_URL ?? "https://example.invalid/api/site",
  apiKey: config.WEBBAS_API_KEY ?? "",
  userAgent: `${config.APP_NAME.replace(/\s+/g, "")}/0.1`,
});
if (!config.WEBBAS_API_BASE_URL) logger.warn("WEBBAS_API_BASE_URL saknas, Webbas-anrop kommer att misslyckas");

const email: EmailProvider =
  config.EMAIL_PROVIDER === "resend" && config.RESEND_API_KEY
    ? new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM)
    : new ConsoleEmailProvider((m) => logger.info(m));

const media: MediaProvider =
  config.MEDIA_PROVIDER === "bunny"
    ? new BunnyMediaProvider({
        stream:
          config.BUNNY_STREAM_LIBRARY_ID && config.BUNNY_STREAM_CDN_HOSTNAME && config.BUNNY_STREAM_TOKEN_KEY
            ? { libraryId: config.BUNNY_STREAM_LIBRARY_ID, cdnHostname: config.BUNNY_STREAM_CDN_HOSTNAME, tokenKey: config.BUNNY_STREAM_TOKEN_KEY }
            : undefined,
        storage:
          config.BUNNY_STORAGE_CDN_HOSTNAME && config.BUNNY_STORAGE_TOKEN_KEY
            ? { cdnHostname: config.BUNNY_STORAGE_CDN_HOSTNAME, tokenKey: config.BUNNY_STORAGE_TOKEN_KEY }
            : undefined,
      })
    : new PassthroughMediaProvider();

const ctx: AppContext = { config, db: dbHandle.db, webbas, email, media, logger };
const app = await buildApp(ctx);
const stopSync = startNightlySync(ctx);

const shutdown = async () => {
  stopSync();
  await app.close();
  await dbHandle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
