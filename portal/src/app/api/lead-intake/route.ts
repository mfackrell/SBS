import { NextResponse, type NextRequest } from "next/server";
import {
  leadIntakeRequestSchema,
  normalizeLeadForPersistence,
  type LeadIntakeResponse,
} from "@/lib/contracts/lead-intake";
import { getServerEnv } from "@/lib/env/server";
import { determineLeadRouting } from "@/lib/leads/routing";
import {
  leadDedupeHash,
  leadFingerprint,
  rateLimitWindowStart,
  verifyLeadIngestSecret,
} from "@/lib/security/lead-intake";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function response(body: LeadIntakeResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!verifyLeadIngestSecret(request.headers.get("x-sbs-lead-secret"))) {
    console.warn("lead_intake_rejected", { reason: "invalid_secret" });
    return response({ ok: false, lead_id: null }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64_000) {
    return response({ ok: false, lead_id: null }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ ok: false, lead_id: null }, 400);
  }

  const parsed = leadIntakeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return response({ ok: false, lead_id: null }, 400);
  }

  // Honeypot submissions receive a neutral success response and are not persisted.
  if (parsed.data.website_confirm) {
    return response({ ok: true, lead_id: null });
  }

  const env = getServerEnv();
  const forwardedClientIp =
    request.headers.get("x-sbs-client-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = leadFingerprint(forwardedClientIp, userAgent);
  const windowStart = rateLimitWindowStart(new Date(), env.RATE_LIMIT_WINDOW_SECONDS);

  const admin = createAdminSupabaseClient();
  const { data: allowed, error: rateError } = await admin.rpc(
    "consume_lead_intake_rate_limit",
    {
      p_fingerprint_hash: fingerprint,
      p_window_start: windowStart,
      p_max_attempts: env.RATE_LIMIT_MAX_REQUESTS,
    },
  );

  if (rateError) {
    console.error("lead_rate_limit_failed", { error: rateError.message });
    return response({ ok: false, lead_id: null }, 503);
  }

  if (allowed !== true) {
    return response({ ok: false, lead_id: null }, 429);
  }

  const serverRouting = determineLeadRouting({
    annualRevenueRange: parsed.data.annual_revenue_range,
    businessType: parsed.data.business_type,
    monthlyTransactions: parsed.data.monthly_transactions,
    legalEntities:
      parsed.data.legal_entities === 3 ? "3 or more" : String(parsed.data.legal_entities),
    salesChannelCount: parsed.data.sales_channels.length,
  });

  const payload = normalizeLeadForPersistence(
    {
      ...parsed.data,
      routing_outcome: serverRouting.outcome,
      suggested_tier: serverRouting.tier,
    },
    body,
  );
  const dedupeHash = leadDedupeHash({
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    company: payload.company,
    website: payload.website,
    revenue_range: payload.revenue_range,
    business_type: payload.business_type,
    business_type_other: payload.business_type_other,
    accounting_software: payload.accounting_software,
    monthly_transactions_range: payload.monthly_transactions_range,
    entities_count: payload.entities_count,
    channels: payload.channels,
    current_books_state: payload.current_books_state,
    start_timeline: payload.start_timeline,
    routing_outcome: payload.routing_outcome,
    suggested_tier: payload.suggested_tier,
  });

  const { data: leadId, error: ingestError } = await admin.rpc("ingest_portal_lead", {
    p_payload: payload,
    p_dedupe_hash: dedupeHash,
  });

  if (ingestError || typeof leadId !== "string") {
    console.error("lead_ingest_failed", { error: ingestError?.message ?? "missing_lead_id" });
    return response({ ok: false, lead_id: null }, 503);
  }

  return response({ ok: true, lead_id: leadId });
}
