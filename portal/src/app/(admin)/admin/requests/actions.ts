"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { documentRequestCreateSchema } from "@/lib/contracts/documents";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireOrgManager, requireStaffUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createDocumentRequest(formData: FormData) {
  await requireStaffUser();

  const parsed = documentRequestCreateSchema.safeParse({
    orgId: formData.get("org_id"),
    title: formData.get("title"),
    description: formData.get("description") || "",
    dueDate: formData.get("due_date"),
  });

  if (!parsed.success) {
    redirect("/admin/requests?error=invalid-request");
  }

  const context = await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_portal_document_request", {
    p_org_id: parsed.data.orgId,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_due_date: parsed.data.dueDate,
  });

  if (error || typeof data !== "string") {
    redirect("/admin/requests?error=create-failed");
  }

  await emitInternalEvent({
    name: "document_request_created",
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    entityType: "document_request",
    entityId: data,
  });

  revalidatePath("/admin/requests");
  redirect(`/admin/requests/${data}?notice=created`);
}
