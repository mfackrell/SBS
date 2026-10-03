import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type IntuitWebhookEvent = {
  id?: string;
  type?: string;
  time?: string;
  intuitaccountid?: string;
  data?: Record<string, unknown>;
};

function validSignature(body: string, signature: string, verifier: string) {
  const expected = createHmac("sha256", verifier).update(body, "utf8").digest("base64");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const env = getServerEnv();
  const verifier = env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  if (!verifier) return new NextResponse(null, { status: 404 });

  const body = await request.text();
  const signature = request.headers.get("intuit-signature") ?? "";
  if (!signature || !validSignature(body, signature, verifier)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let events: IntuitWebhookEvent[];
  try {
    const parsed = JSON.parse(body) as unknown;
    events = Array.isArray(parsed) ? parsed : [];
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const usable = events.filter(
    (event): event is Required<Pick<IntuitWebhookEvent, "id" | "type" | "intuitaccountid">> & IntuitWebhookEvent =>
      Boolean(event.id && event.type && event.intuitaccountid),
  );

  if (!usable.length) return NextResponse.json({ ok: true });

  const admin = createAdminSupabaseClient();
  await admin.from("quickbooks_webhook_events").upsert(
    usable.map((event) => ({
      event_id: event.id,
      realm_id: event.intuitaccountid,
      event_type: event.type,
      occurred_at: event.time ?? null,
      payload: event.data ?? {},
    })),
    { onConflict: "event_id", ignoreDuplicates: true },
  );

  const realmIds = Array.from(new Set(usable.map((event) => event.intuitaccountid)));
  await admin
    .from("quickbooks_connections")
    .update({ sync_requested_at: new Date().toISOString() })
    .in("realm_id", realmIds)
    .neq("status", "disconnected");

  return NextResponse.json({ ok: true });
}
