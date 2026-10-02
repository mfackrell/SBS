import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type LeadsPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const filters = ["new", "contacted", "converted", "not_fit"] as const;
type LeadStatus = (typeof filters)[number];

function isLeadStatus(value: string | undefined): value is LeadStatus {
  return Boolean(value && filters.includes(value as LeadStatus));
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  await requireStaffUser();
  const params = await searchParams;
  const status = isLeadStatus(params.status) ? params.status : undefined;
  const admin = createAdminSupabaseClient();

  let query = admin
    .from("leads")
    .select("id,status,name,email,company,revenue_range,routing_outcome,suggested_tier,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: leads, error } = await query;

  if (error) {
    throw new Error("Unable to load leads.");
  }

  const { data: countsRows, error: countsError } = await admin
    .from("leads")
    .select("status");

  if (countsError) {
    throw new Error("Unable to load lead counts.");
  }

  const counts = filters.reduce<Record<LeadStatus, number>>(
    (result, item) => {
      result[item] = (countsRows ?? []).filter((row) => row.status === item).length;
      return result;
    },
    { new: 0, contacted: 0, converted: 0, not_fit: 0 },
  );

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Lead intake</p>
        <h1>Leads</h1>
        <p>Review inquiries received from the public Month-End Close Review form.</p>
      </div>

      <nav className="filter-tabs" aria-label="Lead status filters">
        <Link href="/admin/leads" aria-current={!status ? "page" : undefined}>
          All
        </Link>
        {filters.map((filter) => (
          <Link
            href={`/admin/leads?status=${filter}`}
            aria-current={status === filter ? "page" : undefined}
            key={filter}
          >
            {filter.replace("_", " ")} <span>{counts[filter]}</span>
          </Link>
        ))}
      </nav>

      <section className="admin-panel">
        {leads?.length ? (
          <div className="data-table-wrap">
            <table className="data-table leads-table">
              <thead>
                <tr>
                  <th scope="col">Lead</th>
                  <th scope="col">Company</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Suggested path</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link className="table-link" href={`/admin/leads/${lead.id}`}>
                        {lead.name}
                      </Link>
                      <small>{lead.email}</small>
                    </td>
                    <td>{lead.company}</td>
                    <td>{lead.revenue_range || "—"}</td>
                    <td>{lead.suggested_tier || lead.routing_outcome?.replace("_", " ") || "—"}</td>
                    <td><span className="status-chip">{lead.status.replace("_", " ")}</span></td>
                    <td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(lead.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No leads in this view</strong>
            <p>New submissions will appear here after the marketing-site ingestion endpoint is configured.</p>
          </div>
        )}
      </section>
    </>
  );
}
