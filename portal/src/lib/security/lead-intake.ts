import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

export function verifyLeadIngestSecret(candidate: string | null) {
  const env = getServerEnv();
  if (!candidate) return false;

  const expected = Buffer.from(env.LEAD_INGEST_SHARED_SECRET);
  const received = Buffer.from(candidate);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function leadFingerprint(clientIp: string, userAgent: string) {
  const env = getServerEnv();

  return createHmac("sha256", env.LEAD_RATE_LIMIT_SALT)
    .update(`${clientIp.trim()}|${userAgent.slice(0, 300)}`)
    .digest("hex");
}

export function leadDedupeHash(input: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export function rateLimitWindowStart(now: Date, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}
