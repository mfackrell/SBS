import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { exchangeQuickBooksAuthorizationCode } from "@/lib/quickbooks/oauth";
import { storeQuickBooksCredentials } from "@/lib/quickbooks/client";
import { getQuickBooksConfig } from "@/lib/quickbooks/config";
import { quickBooksReturnPath, verifyQuickBooksState } from "@/lib/quickbooks/state";
import { syncQuickBooksOrg } from "@/lib/quickbooks/sync";

export const runtime = "nodejs";

function go(path: string, key: "notice" | "error", value: string) {
  const target = new URL(path, getQuickBooksConfig().appUrl);
  target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = verifyQuickBooksState(url.searchParams.get("state") ?? "");
  if (!state) return go("/login", "error", "qbo-invalid-state");

  const returnPath = quickBooksReturnPath(state);
  if (url.searchParams.get("error")) {
    return go(returnPath, "error", "qbo-authorization-declined");
  }

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  if (!code || !realmId) return go(returnPath, "error", "qbo-callback-invalid");

  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user || authData.user.id !== state.userId) {
    return go("/login", "error", "qbo-session-required");
  }

  const admin = createAdminSupabaseClient();
  const { data: membership } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("org_id", state.orgId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return go("/login", "error", "qbo-not-authorized");

  try {
    const tokens = await exchangeQuickBooksAuthorizationCode(code);
    const config = getQuickBooksConfig();
    const { error: connectionError } = await admin
      .from("quickbooks_connections")
      .upsert({
        org_id: state.orgId,
        realm_id: realmId,
        environment: config.environment,
        status: "active",
        connected_by: authData.user.id,
        connected_at: new Date().toISOString(),
        sync_requested_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: "org_id" });
    if (connectionError) throw new Error(connectionError.message);

    await storeQuickBooksCredentials({ orgId: state.orgId, tokens });
    try {
      await syncQuickBooksOrg(state.orgId, authData.user.id);
      return go(returnPath, "notice", "qbo-connected");
    } catch {
      return go(returnPath, "notice", "qbo-connected-sync-pending");
    }
  } catch {
    return go(returnPath, "error", "qbo-connect-failed");
  }
}
