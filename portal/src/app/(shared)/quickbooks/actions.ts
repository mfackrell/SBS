"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireOrgManager, requireOrgMember } from "@/lib/auth/guards";
import { consumePortalRateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getQuickBooksAccess } from "@/lib/quickbooks/client";
import { isQuickBooksConfigured } from "@/lib/quickbooks/config";
import { buildQuickBooksAuthorizationUrl, revokeQuickBooksToken } from "@/lib/quickbooks/oauth";
import { createQuickBooksState, quickBooksReturnPath } from "@/lib/quickbooks/state";
import { syncQuickBooksOrg } from "@/lib/quickbooks/sync";

const inputSchema = z.object({
  orgId: z.string().uuid(),
  view: z.enum(["client", "admin"]),
});

function parseInput(formData: FormData) {
  return inputSchema.safeParse({
    orgId: formData.get("org_id"),
    view: formData.get("view"),
  });
}

function withMessage(path: string, key: "notice" | "error", value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function connectQuickBooks(formData: FormData) {
  const parsed = parseInput(formData);
  if (!parsed.success) redirect("/app/financials?error=qbo-invalid-request");

  const context = parsed.data.view === "admin"
    ? await requireOrgManager(parsed.data.orgId)
    : await requireOrgMember(parsed.data.orgId);
  const returnPath = quickBooksReturnPath(parsed.data);

  if (!isQuickBooksConfigured()) {
    redirect(withMessage(returnPath, "error", "qbo-not-configured"));
  }

  const allowed = await consumePortalRateLimit(
    "quickbooks_connect",
    `${context.user.id}:${parsed.data.orgId}`,
    { maxAttempts: 6 },
  );

  if (!allowed) redirect(withMessage(returnPath, "error", "qbo-rate-limit"));

  const state = createQuickBooksState({
    orgId: parsed.data.orgId,
    userId: context.user.id,
    view: parsed.data.view,
  });

  redirect(buildQuickBooksAuthorizationUrl(state));
}

export async function syncQuickBooks(formData: FormData) {
  const parsed = parseInput(formData);
  if (!parsed.success) redirect("/app/financials?error=qbo-invalid-request");

  const context = parsed.data.view === "admin"
    ? await requireOrgManager(parsed.data.orgId)
    : await requireOrgMember(parsed.data.orgId);
  const returnPath = quickBooksReturnPath(parsed.data);

  const allowed = await consumePortalRateLimit(
    "quickbooks_sync",
    `${context.user.id}:${parsed.data.orgId}`,
    { maxAttempts: 5 },
  );
  if (!allowed) redirect(withMessage(returnPath, "error", "qbo-rate-limit"));

  try {
    await syncQuickBooksOrg(parsed.data.orgId, context.user.id);
  } catch {
    redirect(withMessage(returnPath, "error", "qbo-sync-failed"));
  }

  revalidatePath("/app/financials");
  revalidatePath(`/admin/organizations/${parsed.data.orgId}/quickbooks`);
  redirect(withMessage(returnPath, "notice", "qbo-synced"));
}

export async function disconnectQuickBooks(formData: FormData) {
  const parsed = parseInput(formData);
  if (!parsed.success) redirect("/admin/organizations?error=qbo-invalid-request");

  const context = await requireOrgManager(parsed.data.orgId);
  const returnPath = quickBooksReturnPath({ ...parsed.data, view: "admin" });
  const admin = createAdminSupabaseClient();

  try {
    const access = await getQuickBooksAccess(parsed.data.orgId);
    await revokeQuickBooksToken(access.accessToken).catch(() => undefined);
  } catch {
    // Local disconnect still proceeds when the remote token is already invalid.
  }

  const { data: connection } = await admin
    .from("quickbooks_connections")
    .select("id")
    .eq("org_id", parsed.data.orgId)
    .maybeSingle();

  await admin.from("quickbooks_credentials").delete().eq("org_id", parsed.data.orgId);
  await admin
    .from("quickbooks_connections")
    .update({
      status: "disconnected",
      sync_requested_at: null,
      last_error: null,
    })
    .eq("org_id", parsed.data.orgId);

  await writeAuditLog({
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    eventType: "quickbooks.disconnected",
    entityType: "quickbooks_connection",
    entityId: connection?.id ?? null,
  });

  revalidatePath("/app/financials");
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "notice", "qbo-disconnected"));
}
