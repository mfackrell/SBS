import { DocumentDownloadButton } from "@/app/(shared)/document-download-button";
import { DocumentUploader } from "@/app/(shared)/document-uploader";
import { requireClientUser } from "@/lib/auth/guards";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { relatedName } from "@/lib/data/relations";

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ClientRequestsPage() {
  const context = await requireClientUser();
  const supabase = await createServerSupabaseClient();

  const { data: requests, error } = await supabase
    .from("document_requests")
    .select("id,org_id,title,description,due_date,status,created_at,organizations(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load document requests.");

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: documents, error: documentError } = requestIds.length
    ? await supabase
        .from("documents")
        .select("id,request_id,org_id,category,file_name,size_bytes,revision,uploaded_by,supersedes_document_id,created_at")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (documentError) throw new Error("Unable to load request documents.");

  const maxUploadMb = getServerEnv().FILE_UPLOAD_MAX_MB;
  const supersededIds = new Set(
    (documents ?? [])
      .map((document) => document.supersedes_document_id)
      .filter((value): value is string => typeof value === "string"),
  );

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Documents</p>
        <h1>Requests</h1>
        <p>Upload requested records and review files Strategic Business Services has returned with the request.</p>
      </div>

      {(requests ?? []).length ? (
        <div className="request-card-list">
          {(requests ?? []).map((request) => {
            const requestDocuments = (documents ?? []).filter((document) => document.request_id === request.id);
            const clientDocuments = requestDocuments.filter((document) => document.category === "client_upload");
            const deliverables = requestDocuments.filter((document) => document.category === "staff_deliverable");
            const latestOwnUploads = clientDocuments.filter(
              (document) => document.uploaded_by === context.user.id && !supersededIds.has(document.id),
            );

            return (
              <article className="request-card" key={request.id}>
                <header className="request-card__header">
                  <div>
                    <span className="status-chip">{request.status}</span>
                    <h2>{request.title}</h2>
                    <p>{relatedName(request.organizations) ?? "Your organization"}</p>
                  </div>
                  <div className="request-card__due">
                    <span>Due</span>
                    <strong>{request.due_date ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${request.due_date}T12:00:00Z`)) : "No date"}</strong>
                  </div>
                </header>

                {request.description ? <p className="request-card__description">{request.description}</p> : null}

                {request.status !== "closed" ? (
                  <DocumentUploader
                    orgId={request.org_id}
                    requestId={request.id}
                    category="client_upload"
                    maxUploadMb={maxUploadMb}
                    label="Upload requested document"
                  />
                ) : null}

                {requestDocuments.length ? (
                  <div className="document-list document-list--inside">
                    {requestDocuments.map((document) => (
                      <div className="document-row" key={document.id}>
                        <div className="document-row__main">
                          <span className="document-kind">{document.category === "staff_deliverable" ? "SBS deliverable" : "Your upload"}</span>
                          <strong>{document.file_name}</strong>
                          <small>Revision {document.revision} · {formatBytes(Number(document.size_bytes))} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(document.created_at))}</small>
                        </div>
                        <div className="document-row__actions">
                          <DocumentDownloadButton documentId={document.id} />
                          {request.status !== "closed" && latestOwnUploads.some((item) => item.id === document.id) ? (
                            <DocumentUploader
                              orgId={request.org_id}
                              requestId={request.id}
                              category="client_upload"
                              maxUploadMb={maxUploadMb}
                              replacesDocumentId={document.id}
                              compact
                              label="Upload revision"
                            />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {deliverables.length ? <p className="request-card__note">SBS deliverables are available above through signed download links.</p> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><strong>No document requests</strong><p>New requests from Strategic Business Services will appear here.</p></div>
      )}
    </>
  );
}
