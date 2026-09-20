import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Sexsiffrig engångskod. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashSecret(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Opak sessionstoken som lagras hashad i databasen. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
