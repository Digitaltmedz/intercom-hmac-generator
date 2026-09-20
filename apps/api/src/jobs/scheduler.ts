import type { AppContext } from "../context.js";
import { syncContext } from "../context.js";
import { reconcileGroup } from "../webbas/sync.js";

/** Kör den nattliga avstämningen vid angivet klockslag, sedan var 24:e timme. */
export function startNightlySync(ctx: AppContext): () => void {
  if (!ctx.config.WEBBAS_MEMBER_GROUP_ID) {
    ctx.logger.warn("WEBBAS_MEMBER_GROUP_ID saknas, nattlig avstämning är avstängd");
    return () => undefined;
  }
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(ctx.config.WEBBAS_SYNC_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    timer = setTimeout(async () => {
      try {
        await reconcileGroup(syncContext(ctx));
      } catch {
        // Loggas i reconcileGroup.
      }
      schedule();
    }, next.getTime() - now.getTime());
    ctx.logger.info({ nextRun: next.toISOString() }, "Nästa Webbas-avstämning schemalagd");
  };
  schedule();
  return () => timer && clearTimeout(timer);
}
