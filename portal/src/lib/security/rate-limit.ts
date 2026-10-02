import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getServerEnv } from "@/lib/env/server";
import { requestIp, requestUserAgent } from "@/lib/security/request-context";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function rateLimitWindowStart(now: Date, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

export function portalRateLimitFingerprint(input: {
  ip: string | null;
  userAgent: string;
  subject: string;
  salt: string;
}) {
  return createHmac("sha256", input.salt)
    .update(`${input.ip ?? "unknown"}|${input.userAgent.slice(0, 300)}|${input.subject.trim().toLowerCase()}`)
    .digest("hex");
}

export async function consumePortalRateLimit(
  scope: string,
  subject: string,
  options?: { maxAttempts?: number; windowSeconds?: number },
) {
  const env = getServerEnv();
  const requestHeaders = await headers();
  const windowSeconds = options?.windowSeconds ?? env.RATE_LIMIT_WINDOW_SECONDS;
  const maxAttempts = options?.maxAttempts ?? env.RATE_LIMIT_MAX_REQUESTS;
  const fingerprint = portalRateLimitFingerprint({
    ip: requestIp(requestHeaders),
    userAgent: requestUserAgent(requestHeaders),
    subject,
    salt: env.SECURITY_RATE_LIMIT_SALT ?? env.LEAD_RATE_LIMIT_SALT,
  });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("consume_portal_rate_limit", {
    p_scope: scope,
    p_fingerprint_hash: fingerprint,
    p_window_start: rateLimitWindowStart(new Date(), windowSeconds),
    p_max_attempts: maxAttempts,
  });

  if (error) {
    console.error("security_rate_limit_failed", {
      scope,
      reason: error.message,
    });
    return false;
  }

  return data === true;
}
