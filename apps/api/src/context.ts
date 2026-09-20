import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { EmailProvider } from "./email/provider.js";
import type { Logger } from "./logger.js";
import type { MediaProvider } from "./media/provider.js";
import type { WebbasClient } from "./webbas/client.js";
import type { SyncContext } from "./webbas/sync.js";

export interface AppContext {
  config: Config;
  db: Db;
  webbas: WebbasClient;
  email: EmailProvider;
  media: MediaProvider;
  logger: Logger;
}

export function syncContext(ctx: AppContext): SyncContext {
  const groupId = ctx.config.WEBBAS_MEMBER_GROUP_ID;
  if (!groupId) throw new Error("WEBBAS_MEMBER_GROUP_ID saknas");
  return { db: ctx.db, webbas: ctx.webbas, groupId, logger: ctx.logger };
}
