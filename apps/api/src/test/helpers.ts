import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { connectPglite, type DbHandle } from "../db/client.js";
import { WebbasClient, type WebbasMember } from "../webbas/client.js";
import { ConsoleEmailProvider } from "../email/provider.js";
import { PassthroughMediaProvider } from "../media/provider.js";
import { buildApp } from "../app.js";
import type { AppContext } from "../context.js";

export const GROUP_ID = 42;

/** Låtsas-Webbas i minnet: svarar som riktiga API:t på de endpoints vi använder. */
export class FakeWebbas {
  members: WebbasMember[] = [];
  calls: string[] = [];

  member(id: number, email: string, groups: number[], name = "Test Person"): WebbasMember {
    return { id, name, email, groups, registeredOn: 1_700_000_000, approved: true, contactId: id + 1000 };
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    this.calls.push(`${method} ${url.pathname}${url.search}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (url.pathname.endsWith("/members/search-by-email")) {
      const email = url.searchParams.get("email")?.toLowerCase();
      const m = this.members.find((x) => x.email.toLowerCase() === email);
      return m ? json(200, m) : json(404, { success: false, message: "Not found" });
    }
    if (url.pathname.endsWith("/members")) {
      const groupId = url.searchParams.get("groupId");
      const limit = Number(url.searchParams.get("limit") ?? 30);
      const skip = Number(url.searchParams.get("skip") ?? 0);
      const all = groupId ? this.members.filter((m) => m.groups.includes(Number(groupId))) : this.members;
      return json(200, { totalCount: all.length, limit, skip, items: all.slice(skip, skip + limit) });
    }
    const byId = url.pathname.match(/\/members\/(\d+)$/);
    if (byId) {
      const m = this.members.find((x) => x.id === Number(byId[1]));
      return m ? json(200, m) : json(404, { success: false, message: "Not found" });
    }
    if (url.pathname.endsWith("/member-groups")) return json(200, [{ id: GROUP_ID, name: "Medlemmar", link: "" }]);
    if (url.pathname.endsWith("/webhooks")) return json(200, []);
    return json(404, { success: false, message: `Okänd endpoint ${url.pathname}` });
  };
}

export interface TestEnv {
  ctx: AppContext;
  app: Awaited<ReturnType<typeof buildApp>>;
  webbas: FakeWebbas;
  email: ConsoleEmailProvider;
  handle: DbHandle;
  close: () => Promise<void>;
}

export async function createTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<TestEnv> {
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    AUTH_SECRET: "test-secret-that-is-long-enough",
    ADMIN_API_KEY: "admin-key",
    WEBBAS_API_BASE_URL: "https://kund.example/api/site",
    WEBBAS_API_KEY: "webbas-key",
    WEBBAS_MEMBER_GROUP_ID: String(GROUP_ID),
    WEBBAS_WEBHOOK_SECRET: "hook-secret",
    WEBBAS_AUTOMATION_TOKEN: "automation-token",
    ...overrides,
  });
  const logger = createLogger("silent");
  const handle = await connectPglite();
  const webbas = new FakeWebbas();
  const client = new WebbasClient({ baseUrl: config.WEBBAS_API_BASE_URL!, apiKey: config.WEBBAS_API_KEY!, fetchImpl: webbas.fetch, retries: 0 });
  const email = new ConsoleEmailProvider(() => undefined);
  const ctx: AppContext = { config, db: handle.db, webbas: client, email, media: new PassthroughMediaProvider(), logger };
  const app = await buildApp(ctx);
  await app.ready();
  return {
    ctx,
    app,
    webbas,
    email,
    handle,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

/** Loggar in via kodflödet och returnerar sessionstoken. */
export async function loginAs(env: TestEnv, email: string): Promise<string> {
  const r1 = await env.app.inject({ method: "POST", url: "/auth/request-code", payload: { email } });
  if (r1.statusCode !== 200) throw new Error(`request-code ${r1.statusCode}: ${r1.body}`);
  const mail = env.email.sent.filter((m) => m.to === email.toLowerCase()).at(-1);
  if (!mail) throw new Error(`Ingen kod skickad till ${email}`);
  const code = mail.subject.match(/(\d{6})/)![1]!;
  const r2 = await env.app.inject({ method: "POST", url: "/auth/verify-code", payload: { email, code } });
  if (r2.statusCode !== 200) throw new Error(`verify-code ${r2.statusCode}: ${r2.body}`);
  return r2.json().token as string;
}

/** Väntar på att bakgrundsbehandling av webhooks hunnit klart. */
export async function flush(ms = 50) {
  await new Promise((r) => setTimeout(r, ms));
}
