"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClosePeriodSchema,
  monthEndFromStart,
  updateClosePeriodSchema,
} from "@/lib/contracts/close-status";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createClosePeriod(formData: FormData) {
  const rawPeriodStart = String(formData.get("period_start") ?? "");
  const periodStart = /^\d{4}-\d{2}$/.test(rawPeriodStart)
    ? `${rawPeriodStart}-01`
    : rawPeriodStart;

  const parsed = createClosePeriodSchema.safeParse({
    orgId: formData.get("org_id"),
    periodLabel: formData.get("period_label"),
    periodStart,
    notes: formData.get("notes") || "",
  });

  if (!parsed.success) {
    redirect("/admin/organizations?error=invalid-close-period");
  }

  const context = await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_portal_close_period", {
    p_org_id: parsed.data.orgId,
    p_period_label: parsed.data.periodLabel,
    p_period_start: parsed.data.periodStart,
    p_period_end: monthEndFromStart(parsed.data.periodStart),
    p_notes: parsed.data.notes,
  });

  if (error || typeof data !== "string") {
    const code = error?.code === "23505" ? "close-period-exists" : "close-period-create-failed";
    redirect(`/admin/organizations/${parsed.data.orgId}?error=${code}`);
  }

  await emitInternalEvent({
    name: "close_period_created",
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    entityType: "close_period",
    entityId: data,
    metadata: { period_start: parsed.data.periodStart },
  });

  revalidatePath(`/admin/organizations/${parsed.data.orgId}`);
  revalidatePath("/app/close-status");
  revalidatePath("/app/dashboard");
  redirect(`/admin/organizations/${parsed.data.orgId}?notice=close-period-created`);
}

export async function updateClosePeriod(formData: FormData) {
  const parsed = updateClosePeriodSchema.safeParse({
    orgId: formData.get("org_id"),
    closePeriodId: formData.get("close_period_id"),
    status: formData.get("status"),
    notes: formData.get("notes") || "",
  });

  if (!parsed.success) {
    redirect("/admin/organizations?error=invalid-close-period");
  }

  const context = await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_portal_close_period", {
    p_close_period_id: parsed.data.closePeriodId,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes,
  });

  if (error) {
    redirect(`/admin/organizations/${parsed.data.orgId}?error=close-period-update-failed`);
  }

  await emitInternalEvent({
    name: "close_period_updated",
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    entityType: "close_period",
    entityId: parsed.data.closePeriodId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath(`/admin/organizations/${parsed.data.orgId}`);
  revalidatePath("/app/close-status");
  revalidatePath("/app/dashboard");
  redirect(`/admin/organizations/${parsed.data.orgId}?notice=close-period-updated`);
}
