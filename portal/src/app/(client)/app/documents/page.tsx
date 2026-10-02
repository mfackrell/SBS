import { DocumentDownloadButton } from "@/app/(shared)/document-download-button";
import { requireClientUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ClientDocumentsPage() {
  await requireClientUser();
  const supabase = await createServerSupabaseClient();

  const { data: documents, error } = await supabase
    .from("documents")
    .select("id,org_id,category,file_name,mime_type,size_bytes,revision,created_at,organizations(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load documents.");

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Files</p>
        <h1>Documents</h1>
        <p>Private files available to your organization. Downloads use short-lived signed links rather than public storage URLs.</p>
      </div>

      <section className="admin-panel">
        {documents?.length ? (
          <div className="document-list">
            {documents.map((document) => (
              <article className="document-row" key={document.id}>
                <div className="document-row__main">
                  <span className="document-kind">{document.category === "staff_deliverable" ? "SBS deliverable" : document.category.replace("_", " ")}</span>
                  <strong>{document.file_name}</strong>
                  <small>
                    {document.organizations?.name ?? "Your organization"} · Revision {document.revision} · {formatBytes(Number(document.size_bytes))} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(document.created_at))}
                  </small>
                </div>
                <div className="document-row__actions">
                  <DocumentDownloadButton documentId={document.id} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><strong>No documents yet</strong><p>Uploaded records and SBS deliverables will appear here.</p></div>
        )}
      </section>
    </>
  );
}
