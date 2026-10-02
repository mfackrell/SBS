import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { adminOpsSummarySchema } from "@/lib/contracts/admin-ops";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function total(values: Record<string, number>) {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

export default async function AdminDashboardPage() {
  await requireStaffUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("portal_admin_ops_summary");

  if (error) {
    throw new Error("Unable to load admin operations summary.");
  }

  const parsed = adminOpsSummarySchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("Admin operations summary returned an unexpected shape.");
  }

  const summary = parsed.data;
  const proposalOpen =
    summary.proposals.draft + summary.proposals.sent + summary.proposals.viewed;
  const requestActive =
    summary.document_requests.open + summary.document_requests.submitted;
  const closeActive =
    summary.close_periods.pending_records +
    summary.close_periods.in_progress +
    summary.close_periods.in_review;

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Operations</p>
        <h1>Staff dashboard</h1>
        <p>Current portal counts and workflow states across SBS operations.</p>
      </div>

      <section className="ops-metric-grid" aria-label="Portal operations summary">
        <Link className="ops-metric-card" href="/admin/organizations">
          <span>Active organizations</span>
          <strong>{summary.organizations.active}</strong>
          <small>{summary.organizations.inactive} inactive</small>
        </Link>

        <Link className="ops-metric-card" href="/admin/leads">
          <span>Open lead pipeline</span>
          <strong>{summary.leads.new + summary.leads.contacted}</strong>
          <small>{summary.leads.new} new · {summary.leads.contacted} contacted</small>
        </Link>

        <Link className="ops-metric-card" href="/admin/proposals">
          <span>Open proposals</span>
          <strong>{proposalOpen}</strong>
          <small>{summary.proposals.accepted} accepted · {summary.proposals.declined} declined</small>
        </Link>

        <Link className="ops-metric-card" href="/admin/requests">
          <span>Active document requests</span>
          <strong>{requestActive}</strong>
          <small>{summary.document_requests.open} open · {summary.document_requests.submitted} submitted</small>
        </Link>
      </section>

      <section className="ops-panel-grid">
        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Lead pipeline</h2>
            <p>{total(summary.leads)} total leads currently stored in the portal.</p>
          </div>
          <dl className="ops-breakdown">
            <div><dt>New</dt><dd>{summary.leads.new}</dd></div>
            <div><dt>Contacted</dt><dd>{summary.leads.contacted}</dd></div>
            <div><dt>Converted</dt><dd>{summary.leads.converted}</dd></div>
            <div><dt>Not fit</dt><dd>{summary.leads.not_fit}</dd></div>
          </dl>
        </article>

        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Proposal pipeline</h2>
            <p>{total(summary.proposals)} proposal versions across all workflow states.</p>
          </div>
          <dl className="ops-breakdown">
            <div><dt>Draft</dt><dd>{summary.proposals.draft}</dd></div>
            <div><dt>Sent</dt><dd>{summary.proposals.sent}</dd></div>
            <div><dt>Viewed</dt><dd>{summary.proposals.viewed}</dd></div>
            <div><dt>Accepted</dt><dd>{summary.proposals.accepted}</dd></div>
            <div><dt>Declined</dt><dd>{summary.proposals.declined}</dd></div>
            <div><dt>Expired</dt><dd>{summary.proposals.expired}</dd></div>
          </dl>
        </article>

        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Document requests</h2>
            <p>{total(summary.document_requests)} requests across the current workflow states.</p>
          </div>
          <dl className="ops-breakdown">
            <div><dt>Open</dt><dd>{summary.document_requests.open}</dd></div>
            <div><dt>Submitted</dt><dd>{summary.document_requests.submitted}</dd></div>
            <div><dt>Closed</dt><dd>{summary.document_requests.closed}</dd></div>
          </dl>
        </article>

        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Monthly close pipeline</h2>
            <p>{closeActive} close periods are still in an active workflow state.</p>
          </div>
          <dl className="ops-breakdown">
            <div><dt>Pending records</dt><dd>{summary.close_periods.pending_records}</dd></div>
            <div><dt>In progress</dt><dd>{summary.close_periods.in_progress}</dd></div>
            <div><dt>In review</dt><dd>{summary.close_periods.in_review}</dd></div>
            <div><dt>Delivered</dt><dd>{summary.close_periods.delivered}</dd></div>
          </dl>
        </article>
      </section>
    </>
  );
}
