"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteDocumentSchema,
  documentRequestStatusSchema,
} from "@/lib/contracts/documents";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireOrgManager } from "@/lib/auth/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function loadManagedRequest(requestId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: request, error } = await supabase
    .from("document_requests")
    .select("id,org_id,status")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !request) {
    redirect("/admin/requests?error=request-not-found");
  }

  const context = await requireOrgManager(request.org_id);
  return { supabase, request, context };
}

export async function updateDocumentRequestStatus(formData: FormData) {
  const parsed = documentRequestStatusSchema.safeParse({
    requestId: formData.get("request_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) redirect("/admin/requests?error=invalid-status");

  const { supabase, request, context } = await loadManagedRequest(parsed.data.requestId);
  const { error } = await supabase.rpc("update_portal_document_request_status", {
    p_request_id: parsed.data.requestId,
    p_status: parsed.data.status,
  });

  if (error) {
    redirect(`/admin/requests/${parsed.data.requestId}?error=status-failed`);
  }

  await emitInternalEvent({
    name: "document_request_status_changed",
    orgId: request.org_id,
    actorUserId: context.user.id,
    entityType: "document_request",
    entityId: request.id,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${parsed.data.requestId}`);
  redirect(`/admin/requests/${parsed.data.requestId}?notice=status-updated`);
}

export async function deleteDocument(formData: FormData) {
  const parsed = deleteDocumentSchema.safeParse({
    documentId: formData.get("document_id"),
    returnPath: formData.get("return_path"),
  });

  if (!parsed.success) redirect("/admin/requests?error=invalid-document");

  const supabase = await createServerSupabaseClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,org_id,storage_path,revision")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (documentError || !document) {
    redirect(`${parsed.data.returnPath}?error=document-not-found`);
  }

  const context = await requireOrgManager(document.org_id);
  const { data: storagePath, error: deleteError } = await supabase.rpc("soft_delete_portal_document", {
    p_document_id: document.id,
  });

  if (deleteError || typeof storagePath !== "string") {
    redirect(`${parsed.data.returnPath}?error=delete-failed`);
  }

  const admin = createAdminSupabaseClient();
  const { error: storageError } = await admin.storage
    .from("private-documents")
    .remove([storagePath]);

  await emitInternalEvent({
    name: storageError ? "document_storage_cleanup_failed" : "document_deleted",
    orgId: document.org_id,
    actorUserId: context.user.id,
    entityType: "document",
    entityId: document.id,
    metadata: {
      revision: document.revision,
      storage_cleanup_ok: !storageError,
      storage_error: storageError?.message ?? null,
    },
  });

  revalidatePath(parsed.data.returnPath);
  revalidatePath("/admin/requests");
  redirect(`${parsed.data.returnPath}?notice=document-deleted`);
}
