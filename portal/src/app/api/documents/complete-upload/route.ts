import { NextResponse } from "next/server";
import { documentUploadCompleteSchema } from "@/lib/contracts/documents";
import { emitInternalEvent } from "@/lib/events/internal";
import { queueVirusScanHook } from "@/lib/security/virus-scan";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, documentId: null, error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, documentId: null, error: "Invalid request." }, { status: 400 });
  }

  const parsed = documentUploadCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, documentId: null, error: "Invalid upload intent." }, { status: 400 });
  }

  const { data: documentId, error } = await supabase.rpc("complete_document_upload_intent", {
    p_intent_id: parsed.data.intentId,
  });

  if (error || typeof documentId !== "string") {
    const status = error?.code === "42501" ? 403 : 400;
    return NextResponse.json({ ok: false, documentId: null, error: "The uploaded file could not be finalized." }, { status });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id,org_id,storage_path,mime_type,size_bytes,revision")
    .eq("id", documentId)
    .maybeSingle();

  if (document) {
    await queueVirusScanHook({
      documentId: document.id,
      orgId: document.org_id,
      storagePath: document.storage_path,
      mimeType: document.mime_type,
      sizeBytes: Number(document.size_bytes),
    });

    await emitInternalEvent({
      name: "document_uploaded",
      orgId: document.org_id,
      actorUserId: authData.user.id,
      entityType: "document",
      entityId: document.id,
      metadata: { revision: document.revision },
    });
  }

  return NextResponse.json({ ok: true, documentId, error: null });
}
