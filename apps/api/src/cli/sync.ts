/** Kör en manuell avstämning mot Webbas: pnpm sync:webbas */
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { connectDb } from "../db/client.js";
import { WebbasClient } from "../webbas/client.js";
import { reconcileGroup } from "../webbas/sync.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
if (!config.WEBBAS_API_BASE_URL || !config.WEBBAS_API_KEY || !config.WEBBAS_MEMBER_GROUP_ID) {
  throw new Error("WEBBAS_API_BASE_URL, WEBBAS_API_KEY och WEBBAS_MEMBER_GROUP_ID krävs");
}
const handle = await connectDb(config.DATABASE_URL);
const webbas = new WebbasClient({ baseUrl: config.WEBBAS_API_BASE_URL, apiKey: config.WEBBAS_API_KEY });
const result = await reconcileGroup({ db: handle.db, webbas, groupId: config.WEBBAS_MEMBER_GROUP_ID, logger });
console.log(result);
await handle.close();
