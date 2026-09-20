import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestEnv, flush, GROUP_ID, loginAs, type TestEnv } from "../test/helpers.js";

describe("API", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    env.webbas.members = [env.webbas.member(1, "anna@example.com", [GROUP_ID], "Anna"), env.webbas.member(2, "utan@example.com", [])];
  });
  afterEach(async () => {
    await env.close();
  });

  describe("inloggning", () => {
    it("skickar kod bara till aktiva medlemmar men svarar likadant", async () => {
      const ok = await env.app.inject({ method: "POST", url: "/auth/request-code", payload: { email: "anna@example.com" } });
      const nope = await env.app.inject({ method: "POST", url: "/auth/request-code", payload: { email: "utan@example.com" } });
      expect(ok.statusCode).toBe(200);
      expect(nope.statusCode).toBe(200);
      expect(ok.json()).toEqual(nope.json());
      expect(env.email.sent.map((m) => m.to)).toEqual(["anna@example.com"]);
    });

    it("loggar in med rätt kod och nekar fel kod", async () => {
      await env.app.inject({ method: "POST", url: "/auth/request-code", payload: { email: "anna@example.com" } });
      const bad = await env.app.inject({ method: "POST", url: "/auth/verify-code", payload: { email: "anna@example.com", code: "000000" } });
      expect(bad.statusCode).toBe(400);
      const token = await loginAs(env, "anna@example.com");
      const me = await env.app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ email: "anna@example.com", name: "Anna", entitled: true });
    });

    it("spärrar koden efter fem felaktiga försök", async () => {
      await env.app.inject({ method: "POST", url: "/auth/request-code", payload: { email: "anna@example.com" } });
      for (let i = 0; i < 5; i++) {
        await env.app.inject({ method: "POST", url: "/auth/verify-code", payload: { email: "anna@example.com", code: "111111" } });
      }
      const code = env.email.sent.at(-1)!.subject.match(/(\d{6})/)![1];
      const r = await env.app.inject({ method: "POST", url: "/auth/verify-code", payload: { email: "anna@example.com", code } });
      expect(r.statusCode).toBe(400);
    });

    it("utloggning gör token ogiltig", async () => {
      const token = await loginAs(env, "anna@example.com");
      await env.app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: `Bearer ${token}` } });
      const me = await env.app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(401);
    });
  });

  describe("kurser och rättigheter", () => {
    it("stänger ute den som tappat sin prenumeration", async () => {
      const token = await loginAs(env, "anna@example.com");
      expect((await env.app.inject({ method: "GET", url: "/courses", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);

      env.webbas.members[0]!.groups = [];
      await env.app.inject({ method: "POST", url: "/webhooks/webbas/membership?action=removed&token=automation-token", payload: { email: "anna@example.com" } });
      await flush();

      const r = await env.app.inject({ method: "GET", url: "/courses", headers: { authorization: `Bearer ${token}` } });
      expect(r.statusCode).toBe(403);
      expect(r.json().error).toBe("not_entitled");
    });

    it("levererar kursträd och lektion med medialänk, och sparar framsteg", async () => {
      const admin = { "x-admin-key": "admin-key" };
      const course = (await env.app.inject({ method: "POST", url: "/admin/courses", headers: admin, payload: { slug: "grund", title: "Grundkursen", published: true } })).json();
      const mod = (await env.app.inject({ method: "POST", url: `/admin/courses/${course.id}/modules`, headers: admin, payload: { title: "Modul 1" } })).json();
      const asset = (
        await env.app.inject({ method: "POST", url: "/admin/assets", headers: admin, payload: { kind: "video", provider: "external", externalId: "v1", url: "https://cdn.example/v1.m3u8" } })
      ).json();
      const lesson = (
        await env.app.inject({ method: "POST", url: `/admin/modules/${mod.id}/lessons`, headers: admin, payload: { title: "Välkommen", kind: "video", assetId: asset.id, durationSeconds: 300 } })
      ).json();

      const token = await loginAs(env, "anna@example.com");
      const auth = { authorization: `Bearer ${token}` };
      const list = (await env.app.inject({ method: "GET", url: "/courses", headers: auth })).json();
      expect(list.courses).toHaveLength(1);

      const detail = (await env.app.inject({ method: "GET", url: `/courses/${course.id}`, headers: auth })).json();
      expect(detail.modules[0].lessons[0]).toMatchObject({ id: lesson.id, kind: "video", completed: false });

      const l = (await env.app.inject({ method: "GET", url: `/lessons/${lesson.id}`, headers: auth })).json();
      expect(l.media.url).toBe("https://cdn.example/v1.m3u8");

      await env.app.inject({ method: "PUT", url: `/lessons/${lesson.id}/progress`, headers: auth, payload: { positionSeconds: 120, completed: true } });
      const detail2 = (await env.app.inject({ method: "GET", url: `/courses/${course.id}`, headers: auth })).json();
      expect(detail2.modules[0].lessons[0]).toMatchObject({ completed: true, positionSeconds: 120 });
    });

    it("admin kräver nyckel", async () => {
      const r = await env.app.inject({ method: "GET", url: "/admin/courses" });
      expect(r.statusCode).toBe(403);
    });
  });

  describe("webhooks", () => {
    it("avvisar fel hemlighet", async () => {
      const r = await env.app.inject({ method: "POST", url: "/webhooks/webbas/standard?secret=fel", payload: { email: "x@y.se" } });
      expect(r.statusCode).toBe(401);
      const r2 = await env.app.inject({ method: "POST", url: "/webhooks/webbas/membership", payload: {} });
      expect(r2.statusCode).toBe(401);
    });

    it("sparar och behandlar standardwebhook", async () => {
      const r = await env.app.inject({
        method: "POST",
        url: "/webhooks/webbas/standard",
        headers: { "x-webhook-secret": "hook-secret" },
        payload: { customerEmail: "anna@example.com", invoiceNo: 1, paid: true },
      });
      expect(r.statusCode).toBe(200);
      await flush();
      const events = (await env.app.inject({ method: "GET", url: "/admin/webhook-events", headers: { "x-admin-key": "admin-key" } })).json().events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ eventType: "order_updated", error: null });
      expect(events[0].processedAt).toBeTruthy();
    });
  });

  describe("forum", () => {
    it("kräver godkända regler, stöder trådar, svar, rapport och blockering", async () => {
      env.webbas.members.push(env.webbas.member(3, "bosse@example.com", [GROUP_ID], "Bosse"));
      const admin = { "x-admin-key": "admin-key" };
      const cat = (await env.app.inject({ method: "POST", url: "/admin/forum/categories", headers: admin, payload: { title: "Allmänt" } })).json();

      const anna = { authorization: `Bearer ${await loginAs(env, "anna@example.com")}` };
      const bosse = { authorization: `Bearer ${await loginAs(env, "bosse@example.com")}` };

      const denied = await env.app.inject({ method: "POST", url: `/forum/categories/${cat.id}/threads`, headers: anna, payload: { title: "Hej allihopa", body: "Första inlägget" } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error).toBe("terms_required");

      await env.app.inject({ method: "POST", url: "/me/accept-terms", headers: anna });
      await env.app.inject({ method: "POST", url: "/me/accept-terms", headers: bosse });

      const thread = (await env.app.inject({ method: "POST", url: `/forum/categories/${cat.id}/threads`, headers: anna, payload: { title: "Hej allihopa", body: "Första inlägget" } })).json();
      const reply = await env.app.inject({ method: "POST", url: `/forum/threads/${thread.id}/posts`, headers: bosse, payload: { body: "Hej Anna!" } });
      expect(reply.statusCode).toBe(201);

      let view = (await env.app.inject({ method: "GET", url: `/forum/threads/${thread.id}`, headers: anna })).json();
      expect(view.posts).toHaveLength(2);

      const report = await env.app.inject({ method: "POST", url: "/forum/reports", headers: anna, payload: { postId: reply.json().id, reason: "Olämpligt" } });
      expect(report.statusCode).toBe(201);
      const reports = (await env.app.inject({ method: "GET", url: "/admin/forum/reports", headers: admin })).json().reports;
      expect(reports).toHaveLength(1);

      const bosseId = view.posts[1].author.id;
      await env.app.inject({ method: "POST", url: `/forum/blocks/${bosseId}`, headers: anna });
      view = (await env.app.inject({ method: "GET", url: `/forum/threads/${thread.id}`, headers: anna })).json();
      expect(view.posts).toHaveLength(1);

      await env.app.inject({ method: "POST", url: `/admin/forum/posts/${reply.json().id}/hide`, headers: admin, payload: { reason: "spam" } });
      const bosseView = (await env.app.inject({ method: "GET", url: `/forum/threads/${thread.id}`, headers: bosse })).json();
      expect(bosseView.posts).toHaveLength(1);
    });
  });
});
