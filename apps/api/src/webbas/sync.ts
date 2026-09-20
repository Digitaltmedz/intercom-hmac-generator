import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { entitlements, syncRuns, users } from "../db/schema.js";
import { normalizeEmail, type WebbasClient, type WebbasMember } from "./client.js";
import type { Logger } from "../logger.js";

export interface SyncContext {
  db: Db;
  webbas: WebbasClient;
  /** Medlemsgruppen i Webbas som ger tillgång till appen. */
  groupId: number;
  logger: Logger;
}

export interface ReconcileResult {
  membersSeen: number;
  activated: number;
  deactivated: number;
}

/**
 * Fullständig avstämning: hämtar hela medlemsgruppen från Webbas och gör
 * appens rättigheter identiska med den. Körs varje natt och vid behov manuellt.
 */
export async function reconcileGroup(ctx: SyncContext): Promise<ReconcileResult> {
  const { db, webbas, groupId, logger } = ctx;
  const [run] = await db.insert(syncRuns).values({ webbasGroupId: groupId }).returning();
  try {
    const members = await webbas.listAllMembersInGroup(groupId);
    let activated = 0;
    const seenUserIds: string[] = [];

    for (const m of members) {
      const { userId, changed } = await upsertActiveMember(db, m, groupId, "sync");
      seenUserIds.push(userId);
      if (changed) activated++;
    }

    const toDeactivate = await db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.webbasGroupId, groupId),
          eq(entitlements.active, true),
          seenUserIds.length ? notInArray(entitlements.userId, seenUserIds) : sql`true`,
        ),
      );
    if (toDeactivate.length) {
      await db
        .update(entitlements)
        .set({ active: false, deactivatedAt: new Date(), source: "sync", updatedAt: new Date() })
        .where(
          inArray(
            entitlements.id,
            toDeactivate.map((r) => r.id),
          ),
        );
    }

    const result = { membersSeen: members.length, activated, deactivated: toDeactivate.length };
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), ...result })
      .where(eq(syncRuns.id, run!.id));
    logger.info(result, "Webbas-avstämning klar");
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(syncRuns).set({ finishedAt: new Date(), error: message }).where(eq(syncRuns.id, run!.id));
    logger.error({ err: e }, "Webbas-avstämning misslyckades");
    throw e;
  }
}

/**
 * Riktad uppdatering av en enskild person: slår upp e-posten i Webbas och
 * sätter rättigheten därefter. Används vid inloggning och vid webhooks.
 */
export async function refreshUserFromWebbas(ctx: SyncContext, email: string): Promise<{ active: boolean }> {
  const normalized = normalizeEmail(email);
  const member = await ctx.webbas.findMemberByEmail(normalized);
  if (member && member.groups.includes(ctx.groupId)) {
    await upsertActiveMember(ctx.db, member, ctx.groupId, "webhook");
    return { active: true };
  }
  await deactivateByEmail(ctx.db, normalized, ctx.groupId, "webhook");
  return { active: false };
}

export type MembershipAction = "added" | "removed" | "unknown";

export interface MembershipChange {
  action: MembershipAction;
  email?: string;
  memberId?: number;
}

/**
 * Tolkar en webhook från ett automationssteg i Webbas. Formatet på det
 * automationen skickar är inte dokumenterat, så tolkningen är avsiktligt
 * tolerant: e-post och medlems-id letas upp i vanliga nycklar, och åtgärden
 * kan anges i webhookens URL (?action=added|removed) så att en automation
 * per utlösare räcker.
 */
export function parseMembershipChange(payload: unknown, queryAction?: string): MembershipChange {
  const email = findString(payload, ["email", "Email", "e-mail", "contact.email", "member.email", "contact_email"]);
  const memberIdRaw = findString(payload, ["memberId", "member_id", "member.id", "id"]);
  const memberId = memberIdRaw && /^\d+$/.test(memberIdRaw) ? Number(memberIdRaw) : undefined;

  let action: MembershipAction = "unknown";
  const q = queryAction?.toLowerCase();
  if (q === "added" || q === "removed") action = q;
  else {
    const hint = findString(payload, ["action", "event", "type", "trigger", "status"])?.toLowerCase() ?? "";
    if (/(added|join|tillagd|lagts till)/.test(hint)) action = "added";
    else if (/(removed|left|borttagen|tagits bort)/.test(hint)) action = "removed";
  }
  return { action, email: email ? normalizeEmail(email) : undefined, memberId };
}

/**
 * Tillämpar en medlemsförändring. Litar aldrig blint på webhookens innehåll:
 * personens faktiska gruppmedlemskap hämtas alltid från Webbas API innan
 * rättigheten ändras. Saknas både e-post och medlems-id görs en full avstämning.
 */
export async function applyMembershipChange(ctx: SyncContext, change: MembershipChange): Promise<{ handled: string }> {
  let email = change.email;
  if (!email && change.memberId) {
    const member = await ctx.webbas.getMember(change.memberId);
    email = member?.email ? normalizeEmail(member.email) : undefined;
  }
  if (!email) {
    await reconcileGroup(ctx);
    return { handled: "full-reconcile" };
  }
  const { active } = await refreshUserFromWebbas(ctx, email);
  return { handled: active ? "activated" : "deactivated" };
}

/**
 * Standardwebhooks från Webbas (Webbplatsinställningar > Integrationer).
 * contact_updated fångar e-postbyten. Orderhändelser triggar en riktad
 * kontroll av köparens rättighet, så att ett nytt köp slår igenom snabbt.
 */
export async function handleStandardWebhook(
  ctx: SyncContext,
  eventType: string,
  payload: unknown,
): Promise<{ handled: string }> {
  if (eventType === "contact_updated") {
    const memberId = findString(payload, ["memberId"]);
    const email = findString(payload, ["email"]);
    if (memberId && email && /^\d+$/.test(memberId)) {
      const normalized = normalizeEmail(email);
      const [existing] = await ctx.db.select().from(users).where(eq(users.webbasMemberId, Number(memberId)));
      if (existing && existing.email !== normalized) {
        const [collision] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, normalized));
        if (!collision) {
          await ctx.db.update(users).set({ email: normalized, updatedAt: new Date() }).where(eq(users.id, existing.id));
          return { handled: "email-updated" };
        }
        ctx.logger.warn({ memberId, email: normalized }, "E-postbyte krockar med befintlig användare");
        return { handled: "email-collision" };
      }
    }
    return { handled: "ignored" };
  }

  if (eventType === "order_created" || eventType === "order_updated") {
    const email = findString(payload, ["customerEmail"]);
    if (email) {
      const { active } = await refreshUserFromWebbas(ctx, email);
      return { handled: active ? "activated" : "deactivated" };
    }
    return { handled: "ignored" };
  }

  return { handled: "ignored" };
}

// Hjälpfunktioner

async function upsertActiveMember(
  db: Db,
  m: WebbasMember,
  groupId: number,
  source: "sync" | "webhook",
): Promise<{ userId: string; changed: boolean }> {
  const email = normalizeEmail(m.email);
  const now = new Date();

  const [user] = await db
    .insert(users)
    .values({ email, name: m.name || null, webbasMemberId: m.id, webbasContactId: m.contactId ?? null })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: sql`coalesce(excluded.name, ${users.name})`,
        webbasMemberId: m.id,
        webbasContactId: m.contactId ?? null,
        updatedAt: now,
      },
    })
    .returning({ id: users.id });

  const [existing] = await db
    .select({ id: entitlements.id, active: entitlements.active })
    .from(entitlements)
    .where(and(eq(entitlements.userId, user!.id), eq(entitlements.webbasGroupId, groupId)));

  if (!existing) {
    await db.insert(entitlements).values({
      userId: user!.id,
      webbasGroupId: groupId,
      active: true,
      source,
      activatedAt: now,
    });
    return { userId: user!.id, changed: true };
  }
  if (!existing.active) {
    await db
      .update(entitlements)
      .set({ active: true, source, activatedAt: now, deactivatedAt: null, updatedAt: now })
      .where(eq(entitlements.id, existing.id));
    return { userId: user!.id, changed: true };
  }
  return { userId: user!.id, changed: false };
}

async function deactivateByEmail(db: Db, email: string, groupId: number, source: "sync" | "webhook") {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) return;
  await db
    .update(entitlements)
    .set({ active: false, source, deactivatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(entitlements.userId, user.id), eq(entitlements.webbasGroupId, groupId), eq(entitlements.active, true)));
}

/** Letar efter första förekomsten av någon av nycklarna (stöder "a.b"-sökvägar). */
function findString(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, payload);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}
