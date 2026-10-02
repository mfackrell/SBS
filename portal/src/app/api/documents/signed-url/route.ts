import { NextResponse } from "next/server";
import { signedDocumentUrlRequestSchema } from "@/lib/contracts/documents";
import { emitInternalEvent } from "@/lib/events/internal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SIGNED_URL_SECONDS = 60;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Invalid request." }, { status: 400 });
  }

  const parsed = signedDocumentUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Invalid document." }, { status: 400 });
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,org_id,file_name,storage_path,revision")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (documentError || !document) {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Document not found." }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();
  const { data: signed, error: signedError } = await admin.storage
    .from("private-documents")
    .createSignedUrl(document.storage_path, SIGNED_URL_SECONDS, {
      download: document.file_name,
    });

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Download link could not be created." }, { status: 503 });
  }

  const { error: logError } = await supabase.rpc("log_document_download", {
    p_document_id: document.id,
  });

  if (logError) {
    return NextResponse.json({ ok: false, url: null, expiresIn: null, error: "Download authorization could not be recorded." }, { status: 503 });
  }

  await emitInternalEvent({
    name: "document_downloaded",
    orgId: document.org_id,
    actorUserId: authData.user.id,
    entityType: "document",
    entityId: document.id,
    metadata: { revision: document.revision },
  });

  return NextResponse.json({
    ok: true,
    url: signed.signedUrl,
    expiresIn: SIGNED_URL_SECONDS,
    error: null,
  });
}
