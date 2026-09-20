import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestEnv, GROUP_ID, type TestEnv } from "../test/helpers.js";
import { applyMembershipChange, handleStandardWebhook, parseMembershipChange, reconcileGroup, refreshUserFromWebbas } from "./sync.js";
import { syncContext } from "../context.js";
import { entitlements, users } from "../db/schema.js";

describe("Webbas-synk", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  async function entitlementFor(email: string) {
    const [u] = await env.ctx.db.select().from(users).where(eq(users.email, email));
    if (!u) return null;
    const [e] = await env.ctx.db.select().from(entitlements).where(eq(entitlements.userId, u.id));
    return e ?? null;
  }

  it("aktiverar alla i gruppen och avaktiverar de som lämnat", async () => {
    env.webbas.members = [
      env.webbas.member(1, "Anna@Example.com", [GROUP_ID], "Anna"),
      env.webbas.member(2, "bertil@example.com", [GROUP_ID]),
      env.webbas.member(3, "cecilia@example.com", [99]),
    ];
    const r1 = await reconcileGroup(syncContext(env.ctx));
    expect(r1).toEqual({ membersSeen: 2, activated: 2, deactivated: 0 });
    expect((await entitlementFor("anna@example.com"))?.active).toBe(true);
    expect(await entitlementFor("cecilia@example.com")).toBeNull();

    // Bertil säger upp sig: försvinner ur gruppen i Webbas.
    env.webbas.members[1]!.groups = [];
    const r2 = await reconcileGroup(syncContext(env.ctx));
    expect(r2).toEqual({ membersSeen: 1, activated: 0, deactivated: 1 });
    expect((await entitlementFor("bertil@example.com"))?.active).toBe(false);

    // Bertil kommer tillbaka.
    env.webbas.members[1]!.groups = [GROUP_ID];
    const r3 = await reconcileGroup(syncContext(env.ctx));
    expect(r3.activated).toBe(1);
    expect((await entitlementFor("bertil@example.com"))?.active).toBe(true);
  });

  it("bläddrar igenom gruppen sida för sida", async () => {
    env.webbas.members = Array.from({ length: 120 }, (_, i) => env.webbas.member(i + 1, `m${i}@example.com`, [GROUP_ID]));
    const r = await reconcileGroup(syncContext(env.ctx));
    expect(r.membersSeen).toBe(120);
    expect(env.webbas.calls.filter((c) => c.includes("/members?")).length).toBe(3);
  });

  it("riktad uppdatering följer Webbas som facit", async () => {
    env.webbas.members = [env.webbas.member(1, "anna@example.com", [GROUP_ID])];
    expect(await refreshUserFromWebbas(syncContext(env.ctx), "anna@example.com")).toEqual({ active: true });
    env.webbas.members[0]!.groups = [];
    expect(await refreshUserFromWebbas(syncContext(env.ctx), "anna@example.com")).toEqual({ active: false });
    expect((await entitlementFor("anna@example.com"))?.active).toBe(false);
    expect(await refreshUserFromWebbas(syncContext(env.ctx), "okand@example.com")).toEqual({ active: false });
  });

  it("tolkar automationswebhooks tolerant", () => {
    expect(parseMembershipChange({ email: "A@B.se" }, "removed")).toEqual({ action: "removed", email: "a@b.se", memberId: undefined });
    expect(parseMembershipChange({ contact: { email: "a@b.se" }, event: "member_added_to_group" })).toMatchObject({ action: "added", email: "a@b.se" });
    expect(parseMembershipChange({ member_id: 17 })).toMatchObject({ action: "unknown", memberId: 17 });
    expect(parseMembershipChange("nonsense")).toEqual({ action: "unknown", email: undefined, memberId: undefined });
  });

  it("litar inte på webhookens påstående utan slår upp i Webbas", async () => {
    env.webbas.members = [env.webbas.member(1, "anna@example.com", [GROUP_ID])];
    // Webhooken säger "removed" men Webbas säger att Anna fortfarande är med.
    const r = await applyMembershipChange(syncContext(env.ctx), { action: "removed", email: "anna@example.com" });
    expect(r.handled).toBe("activated");
    expect((await entitlementFor("anna@example.com"))?.active).toBe(true);
  });

  it("slår upp e-post via medlems-id och gör full avstämning om inget finns", async () => {
    env.webbas.members = [env.webbas.member(7, "gustav@example.com", [GROUP_ID])];
    const r1 = await applyMembershipChange(syncContext(env.ctx), { action: "added", memberId: 7 });
    expect(r1.handled).toBe("activated");
    const r2 = await applyMembershipChange(syncContext(env.ctx), { action: "unknown" });
    expect(r2.handled).toBe("full-reconcile");
  });

  it("uppdaterar e-post vid contact_updated och kollar rättighet vid order", async () => {
    env.webbas.members = [env.webbas.member(5, "gammal@example.com", [GROUP_ID])];
    await reconcileGroup(syncContext(env.ctx));
    const r = await handleStandardWebhook(syncContext(env.ctx), "contact_updated", { memberId: 5, email: "Ny@Example.com" });
    expect(r.handled).toBe("email-updated");
    const [u] = await env.ctx.db.select().from(users).where(eq(users.webbasMemberId, 5));
    expect(u?.email).toBe("ny@example.com");

    env.webbas.members = [env.webbas.member(8, "kopare@example.com", [GROUP_ID])];
    const r2 = await handleStandardWebhook(syncContext(env.ctx), "order_created", { customerEmail: "kopare@example.com", paid: true });
    expect(r2.handled).toBe("activated");
    expect((await entitlementFor("kopare@example.com"))?.active).toBe(true);
  });
});
