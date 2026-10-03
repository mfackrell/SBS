import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { syncQuickBooksOrg } from "@/lib/quickbooks/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function isDue(connection: {
  last_synced_at: string | null;
  sync_requested_at: string | null;
}) {
  if (!connection.last_synced_at) return true;
  const lastSync = new Date(connection.last_synced_at).getTime();
  if (lastSync <= Date.now() - 20 * 60 * 60 * 1000) return true;
  if (connection.sync_requested_at) {
    return new Date(connection.sync_requested_at).getTime() > lastSync;
  }
  return false;
}

export async function GET(request: Request) {
  const env = getServerEnv();
  if (!env.CRON_SECRET) return new NextResponse(null, { status: 404 });

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: connections, error } = await admin
    .from("quickbooks_connections")
    .select("org_id,last_synced_at,sync_requested_at,status")
    .in("status", ["active", "error"])
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: "connection_query_failed" }, { status: 503 });
  }

  const due = (connections ?? []).filter(isDue);
  let synced = 0;
  let failed = 0;

  for (const connection of due) {
    try {
      await syncQuickBooksOrg(connection.org_id, null);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, synced, failed });
}
