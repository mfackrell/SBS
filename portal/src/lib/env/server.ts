import "server-only";

import { z } from "zod";
import { getPublicEnv } from "./public";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  INVITE_EXPIRES_MINUTES: z.coerce.number().int().positive().max(10080).default(60),
  LEAD_INGEST_SHARED_SECRET: z.string().min(32),
  LEAD_RATE_LIMIT_SALT: z.string().min(32),
  SECURITY_RATE_LIMIT_SALT: z.string().min(32).optional(),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
  FILE_UPLOAD_MAX_MB: z.coerce.number().positive().default(25),
  ALLOWED_MIME_TYPES: z.string().default(
    "application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg",
  ),
  QBO_BILLING_BASE_URL: z.string().url().optional().or(z.literal("")),
  FEATURE_FLAGS: z.string().optional(),
});

export function getServerEnv() {
  const server = serverEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || undefined,
    INVITE_EXPIRES_MINUTES: process.env.INVITE_EXPIRES_MINUTES,
    LEAD_INGEST_SHARED_SECRET: process.env.LEAD_INGEST_SHARED_SECRET,
    LEAD_RATE_LIMIT_SALT: process.env.LEAD_RATE_LIMIT_SALT,
    SECURITY_RATE_LIMIT_SALT: process.env.SECURITY_RATE_LIMIT_SALT || undefined,
    RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
    FILE_UPLOAD_MAX_MB: process.env.FILE_UPLOAD_MAX_MB,
    ALLOWED_MIME_TYPES: process.env.ALLOWED_MIME_TYPES,
    QBO_BILLING_BASE_URL: process.env.QBO_BILLING_BASE_URL,
    FEATURE_FLAGS: process.env.FEATURE_FLAGS,
  });

  return {
    ...getPublicEnv(),
    ...server,
    allowedMimeTypes: server.ALLOWED_MIME_TYPES.split(",").map((value) => value.trim()).filter(Boolean),
    featureFlags: (server.FEATURE_FLAGS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  };
}
