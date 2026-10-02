import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDocumentRequest } from "./actions";

type RequestsPageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

const statuses = ["open", "submitted", "closed"] as const;
type RequestStatus = (typeof statuses)[number];

function isRequestStatus(value: string | undefined): value is RequestStatus {
  return Boolean(value && statuses.includes(value as RequestStatus));
}

export default async function AdminRequestsPage({ searchParams }: RequestsPageProps) {
  const context = await requireStaffUser();
  const params = await searchParams;
  const status = isRequestStatus(params.status) ? params.status : undefined;
  const managedOrgIds = context.memberships
    .filter((membership) => membership.role === "owner" || membership.role === "staff")
    .map((membership) => membership.org_id);

  const supabase = await createServerSupabaseClient();

  const { data: organizations, error: orgError } = managedOrgIds.length
    ? await supabase.from("organizations").select("id,name").in("id", managedOrgIds).order("name")
    : { data: [], error: null };

  if (orgError) throw new Error("Unable to load request organizations.");

  let query = supabase
    .from("document_requests")
    .select("id,org_id,title,description,due_date,status,created_at,organizations(name)")
    .in("org_id", managedOrgIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data: requests, error: requestsError } = managedOrgIds.length
    ? await query
    : { data: [], error: null };

  if (requestsError) throw new Error("Unable to load document requests.");

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Documents</p>
        <h1>Document requests</h1>
        <p>Request records from clients, review submissions, and deliver completed files back through the private portal.</p>
      </div>

      {params.error ? <p className="form-error alert-box" role="alert">The request could not be created. Check the organization and request details.</p> : null}

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Create request</h2>
          <p>Clients with active membership in the selected organization will see the request in their portal.</p>
        </div>

        {organizations?.length ? (
          <form className="request-create-grid" action={createDocumentRequest}>
            <div className="field">
              <label htmlFor="request-org">Organization</label>
              <select id="request-org" name="org_id" required>
                <option value="">Select organization</option>
                {organizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>{organization.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="request-title">Request title</label>
              <input id="request-title" name="title" required minLength={2} maxLength={180} />
            </div>
            <div className="field">
              <label htmlFor="request-due">Due date (optional)</label>
              <input id="request-due" name="due_date" type="date" />
            </div>
            <div className="field request-create-grid__description">
              <label htmlFor="request-description">Description</label>
              <textarea id="request-description" name="description" rows={4} maxLength={4000} />
            </div>
            <button className="button" type="submit">Create request</button>
          </form>
        ) : (
          <div className="empty-state"><strong>No managed organizations</strong></div>
        )}
      </section>

      <nav className="filter-tabs" aria-label="Document request status filters">
        <Link href="/admin/requests" aria-current={!status ? "page" : undefined}>All</Link>
        {statuses.map((item) => (
          <Link href={`/admin/requests?status=${item}`} aria-current={status === item ? "page" : undefined} key={item}>{item}</Link>
        ))}
      </nav>

      <section className="admin-panel">
        {requests?.length ? (
          <div className="record-list">
            {requests.map((request) => (
              <Link className="record-row" href={`/admin/requests/${request.id}`} key={request.id}>
                <span>
                  <strong>{request.title}</strong>
                  <small>
                    {request.organizations?.name ?? "Organization"}
                    {request.due_date ? ` · due ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${request.due_date}T12:00:00Z`))}` : ""}
                  </small>
                </span>
                <span className="status-chip">{request.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state"><strong>No requests in this view</strong></div>
        )}
      </section>
    </>
  );
}
