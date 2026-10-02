"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { proposalCreateSchema } from "@/lib/contracts/proposals";
import { requireOrgManager, requireStaffUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function expiresAtFromDate(value: string | null) {
  return value ? `${value}T23:59:59.999Z` : null;
}

export async function createProposal(formData: FormData) {
  await requireStaffUser();

  const parsed = proposalCreateSchema.safeParse({
    orgId: formData.get("org_id"),
    leadId: formData.get("lead_id"),
    title: formData.get("title"),
    currency: formData.get("currency") || "USD",
    termsText: formData.get("terms_text") || "",
    expiresOn: formData.get("expires_on"),
  });

  if (!parsed.success) {
    redirect("/admin/proposals?error=invalid-proposal");
  }

  await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_portal_proposal", {
    p_org_id: parsed.data.orgId,
    p_lead_id: parsed.data.leadId,
    p_title: parsed.data.title,
    p_currency: parsed.data.currency,
    p_terms_text: parsed.data.termsText,
    p_expires_at: expiresAtFromDate(parsed.data.expiresOn),
  });

  if (error || typeof data !== "string") {
    redirect("/admin/proposals?error=create-failed");
  }

  revalidatePath("/admin/proposals");
  redirect(`/admin/proposals/${data}?notice=created`);
}
