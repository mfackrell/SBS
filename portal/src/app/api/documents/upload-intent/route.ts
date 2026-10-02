import { NextResponse } from "next/server";
import { documentUploadIntentSchema } from "@/lib/contracts/documents";
import { getServerEnv } from "@/lib/env/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/security/csrf";
import { logSecurityFailure } from "@/lib/security/events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    logSecurityFailure("document_upload_intent_csrf_rejected");
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "Request origin was not accepted." },
      { status: 403 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "Authentication required." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "Invalid request." },
      { status: 400 },
    );
  }

  const parsed = documentUploadIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "File type or upload details are not allowed." },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  const maxSizeBytes = Math.floor(env.FILE_UPLOAD_MAX_MB * 1024 * 1024);

  if (!env.allowedMimeTypes.includes(parsed.data.mimeType)) {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "This file type is disabled by portal configuration." },
      { status: 400 },
    );
  }

  if (parsed.data.sizeBytes > maxSizeBytes) {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: `Files must be ${env.FILE_UPLOAD_MAX_MB} MB or smaller.` },
      { status: 413 },
    );
  }

  const { data, error } = await supabase.rpc("create_document_upload_intent", {
    p_org_id: parsed.data.orgId,
    p_request_id: parsed.data.requestId,
    p_category: parsed.data.category,
    p_file_name: parsed.data.fileName,
    p_mime_type: parsed.data.mimeType,
    p_size_bytes: parsed.data.sizeBytes,
    p_replaces_document_id: parsed.data.replacesDocumentId,
    p_max_size_bytes: maxSizeBytes,
  });

  const intent = Array.isArray(data) ? data[0] : null;

  if (
    error ||
    !intent ||
    typeof intent.intent_id !== "string" ||
    typeof intent.document_id !== "string" ||
    typeof intent.storage_path !== "string"
  ) {
    const status = error?.code === "42501" ? 403 : 400;
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "The upload could not be authorized." },
      { status },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: signedUpload, error: signedError } = await admin.storage
    .from("private-documents")
    .createSignedUploadUrl(intent.storage_path, { upsert: false });

  if (signedError || !signedUpload?.token) {
    return NextResponse.json(
      { ok: false, intentId: null, documentId: null, path: null, token: null, error: "The upload token could not be created." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    intentId: intent.intent_id,
    documentId: intent.document_id,
    path: intent.storage_path,
    token: signedUpload.token,
    error: null,
  });
}
