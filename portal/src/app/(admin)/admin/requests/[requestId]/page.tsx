import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentDownloadButton } from "@/app/(shared)/document-download-button";
import { DocumentUploader } from "@/app/(shared)/document-uploader";
import { requireOrgManager } from "@/lib/auth/guards";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteDocument, updateDocumentRequestStatus } from "./actions";

type RequestDetailProps = {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  created: "Document request created.",
  "status-updated": "Request status updated.",
  "document-deleted": "Document removed from the portal.",
};

const errors: Record<string, string> = {
  "status-failed": "The request status could not be updated.",
  "document-not-found": "The document could not be found.",
  "delete-failed": "The document could not be removed.",
};

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminRequestDetail({ params, searchParams }: RequestDetailProps) {
  const { requestId } = await params;
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: request, error } = await supabase
    .from("document_requests")
    .select("*,organizations(name)")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new Error("Unable to load document request.");
  if (!request) notFound();

  await requireOrgManager(request.org_id);

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id,document_series_id,supersedes_document_id,category,file_name,mime_type,size_bytes,revision,uploaded_by,created_at")
    .eq("request_id", request.id)
    .order("created_at", { ascending: false });

  if (documentsError) throw new Error("Unable to load request documents.");

  const maxUploadMb = getServerEnv().FILE_UPLOAD_MAX_MB;

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">{request.organizations?.name ?? "Organization"} · Document request</p>
          <h1>{request.title}</h1>
          <p>{request.description || "No additional description."}</p>
        </div>
        <Link className="text-action" href="/admin/requests">All requests</Link>
      </div>

      {messages.notice && notices[messages.notice] ? <p className="notice" role="status">{notices[messages.notice]}</p> : null}
      {messages.error && errors[messages.error] ? <p className="form-error alert-box" role="alert">{errors[messages.error]}</p> : null}

      <section className="admin-grid">
        <article className="admin-panel">
          <div className="panel-heading"><h2>Request status</h2></div>
          <dl className="detail-list">
            <div><dt>Status</dt><dd><span className="status-chip">{request.status}</span></dd></div>
            <div><dt>Due date</dt><dd>{request.due_date ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(`${request.due_date}T12:00:00Z`)) : "No due date"}</dd></div>
          </dl>
          <form className="inline-status-form" action={updateDocumentRequestStatus}>
            <input type="hidden" name="request_id" value={request.id} />
            <label className="sr-only" htmlFor="request-status">Request status</label>
            <select id="request-status" name="status" defaultValue={request.status}>
              <option value="open">Open</option>
              <option value="submitted">Submitted</option>
              <option value="closed">Closed</option>
            </select>
            <button className="button button--small" type="submit">Update status</button>
          </form>
        </article>

        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Upload deliverable</h2>
            <p>Deliverables are private to active members of this organization and are downloaded only through signed links.</p>
          </div>
          <DocumentUploader
            orgId={request.org_id}
            requestId={request.id}
            category="staff_deliverable"
            maxUploadMb={maxUploadMb}
            label="Upload deliverable"
          />
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Request documents</h2>
          <p>Every revision has its own immutable storage path, uploader, and timestamp.</p>
        </div>

        {documents?.length ? (
          <div className="document-list">
            {documents.map((document) => (
              <article className="document-row" key={document.id}>
                <div className="document-row__main">
                  <span className="document-kind">{document.category.replace("_", " ")}</span>
                  <strong>{document.file_name}</strong>
                  <small>
                    Revision {document.revision} · {formatBytes(Number(document.size_bytes))} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.created_at))}
                  </small>
                </div>
                <div className="document-row__actions">
                  <DocumentDownloadButton documentId={document.id} />
                  <DocumentUploader
                    orgId={request.org_id}
                    requestId={request.id}
                    category={document.category}
                    maxUploadMb={maxUploadMb}
                    replacesDocumentId={document.id}
                    compact
                    label="Upload revision"
                  />
                  <form action={deleteDocument}>
                    <input type="hidden" name="document_id" value={document.id} />
                    <input type="hidden" name="return_path" value={`/admin/requests/${request.id}`} />
                    <button className="text-button text-button--danger" type="submit">Delete</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><strong>No files yet</strong><p>Client uploads and staff deliverables attached to this request will appear here.</p></div>
        )}
      </section>
    </>
  );
}
