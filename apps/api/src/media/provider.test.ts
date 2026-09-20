import { describe, it, expect } from "vitest";
import { BunnyMediaProvider, PassthroughMediaProvider } from "./provider.js";

describe("media", () => {
  it("passthrough returnerar lagrad url", () => {
    const p = new PassthroughMediaProvider();
    expect(p.sign({ kind: "pdf", provider: "external", externalId: "x", url: "https://a/b.pdf" }, { ttlSeconds: 10, now: 100 })).toEqual({
      url: "https://a/b.pdf",
      streamUrl: "https://a/b.pdf",
      expiresAt: 110,
    });
  });

  it("bunny signerar med utgångstid", () => {
    const p = new BunnyMediaProvider({
      stream: { libraryId: "1", cdnHostname: "vz-test.b-cdn.net", tokenKey: "k" },
      storage: { cdnHostname: "files.b-cdn.net", tokenKey: "k" },
    });
    const v = p.sign({ kind: "video", provider: "bunny_stream", externalId: "guid", url: null }, { ttlSeconds: 60, now: 1000 });
    expect(v.streamUrl).toMatch(/^https:\/\/vz-test\.b-cdn\.net\/guid\/playlist\.m3u8\?token=[0-9a-f]{64}&expires=1060$/);
    const f = p.sign({ kind: "pdf", provider: "bunny_storage", externalId: "docs/a.pdf", url: null }, { ttlSeconds: 60, now: 1000 });
    expect(f.url).toMatch(/^https:\/\/files\.b-cdn\.net\/docs\/a\.pdf\?token=[A-Za-z0-9_-]+&expires=1060$/);
  });
});
