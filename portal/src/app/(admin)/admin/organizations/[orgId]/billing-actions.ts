"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { billingProfileUpdateSchema } from "@/lib/contracts/billing";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateBillingProfile(formData: FormData) {
  const parsed = billingProfileUpdateSchema.safeParse({
    orgId: formData.get("org_id"),
    qboCustomerRef: formData.get("qbo_customer_ref"),
    qboPortalUrl: formData.get("qbo_portal_url"),
    notes: formData.get("notes"),
  });

  const orgId = String(formData.get("org_id") ?? "");

  if (!parsed.success) {
    redirect(`/admin/organizations/${orgId}?error=billing-invalid`);
  }

  const context = await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { data: profileId, error } = await supabase.rpc("update_portal_billing_profile", {
    p_org_id: parsed.data.orgId,
    p_qbo_customer_ref: parsed.data.qboCustomerRef,
    p_qbo_portal_url: parsed.data.qboPortalUrl,
    p_notes: parsed.data.notes,
  });

  if (error || typeof profileId !== "string") {
    redirect(`/admin/organizations/${parsed.data.orgId}?error=billing-update-failed`);
  }

  await emitInternalEvent({
    name: "billing_profile_updated",
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    entityType: "billing_profile",
    entityId: profileId,
    metadata: {
      has_customer_ref: Boolean(parsed.data.qboCustomerRef),
      has_portal_url: Boolean(parsed.data.qboPortalUrl),
    },
  });

  revalidatePath(`/admin/organizations/${parsed.data.orgId}`);
  revalidatePath("/app/billing");
  redirect(`/admin/organizations/${parsed.data.orgId}?notice=billing-updated`);
}
