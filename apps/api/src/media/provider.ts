import { createHash } from "node:crypto";

export interface MediaAssetRef {
  kind: "video" | "audio" | "pdf" | "image";
  provider: "bunny_stream" | "bunny_storage" | "external";
  externalId: string;
  url: string | null;
}

export interface SignedMedia {
  /** URL som appen kan spela upp eller öppna. */
  url: string;
  /** För video: HLS-manifest. För övrigt samma som url. */
  streamUrl?: string;
  expiresAt: number;
}

export interface MediaProvider {
  sign(asset: MediaAssetRef, opts: { ttlSeconds: number; now?: number }): SignedMedia;
}

/** Returnerar lagrad URL rakt av. För utveckling, eller för öppna resurser. */
export class PassthroughMediaProvider implements MediaProvider {
  sign(asset: MediaAssetRef, opts: { ttlSeconds: number; now?: number }): SignedMedia {
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    const url = asset.url ?? asset.externalId;
    return { url, streamUrl: url, expiresAt: now + opts.ttlSeconds };
  }
}

export interface BunnyOptions {
  stream?: { libraryId: string; cdnHostname: string; tokenKey: string };
  storage?: { cdnHostname: string; tokenKey: string };
}

/**
 * Bunny.net: Stream för video, Storage + CDN för ljud och PDF.
 * Signerade länkar gör att materialet inte går att dela utanför appen.
 *
 * Tokenformaten nedan följer Bunnys dokumentation för "Token authentication"
 * (Stream: SHA256(tokenKey + videoId + expires) som hex;
 *  CDN: base64url(SHA256(tokenKey + path + expires))). Verifiera mot kontots
 * inställningar vid driftsättning, formatet kan ändras av leverantören.
 */
export class BunnyMediaProvider implements MediaProvider {
  constructor(private readonly opts: BunnyOptions) {}

  sign(asset: MediaAssetRef, o: { ttlSeconds: number; now?: number }): SignedMedia {
    const now = o.now ?? Math.floor(Date.now() / 1000);
    const expires = now + o.ttlSeconds;

    if (asset.provider === "bunny_stream") {
      const s = this.opts.stream;
      if (!s) throw new Error("Bunny Stream är inte konfigurerat");
      const token = createHash("sha256").update(`${s.tokenKey}${asset.externalId}${expires}`).digest("hex");
      const base = `https://${s.cdnHostname}/${asset.externalId}`;
      const q = `?token=${token}&expires=${expires}`;
      return { url: `${base}/play_720p.mp4${q}`, streamUrl: `${base}/playlist.m3u8${q}`, expiresAt: expires };
    }

    if (asset.provider === "bunny_storage") {
      const s = this.opts.storage;
      if (!s) throw new Error("Bunny Storage är inte konfigurerat");
      const path = asset.externalId.startsWith("/") ? asset.externalId : `/${asset.externalId}`;
      const token = createHash("sha256")
        .update(`${s.tokenKey}${path}${expires}`)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const url = `https://${s.cdnHostname}${path}?token=${token}&expires=${expires}`;
      return { url, streamUrl: url, expiresAt: expires };
    }

    const url = asset.url ?? asset.externalId;
    return { url, streamUrl: url, expiresAt: expires };
  }
}
