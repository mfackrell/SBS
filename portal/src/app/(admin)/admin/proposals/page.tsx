import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createProposal } from "./actions";
import { relatedName } from "@/lib/data/relations";

type ProposalsPageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

const statuses = ["draft", "sent", "viewed", "accepted", "declined", "expired"] as const;
type ProposalStatus = (typeof statuses)[number];

function isProposalStatus(value: string | undefined): value is ProposalStatus {
  return Boolean(value && statuses.includes(value as ProposalStatus));
}

function money(cents: number | null, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

export default async function ProposalsPage({ searchParams }: ProposalsPageProps) {
  const context = await requireStaffUser();
  const params = await searchParams;
  const status = isProposalStatus(params.status) ? params.status : undefined;
  const managedOrgIds = context.memberships
    .filter((membership) => membership.role === "owner" || membership.role === "staff")
    .map((membership) => membership.org_id);

  const supabase = await createServerSupabaseClient();

  const { data: organizations, error: orgError } = managedOrgIds.length
    ? await supabase.from("organizations").select("id,name").in("id", managedOrgIds).order("name")
    : { data: [], error: null };

  if (orgError) throw new Error("Unable to load proposal organizations.");

  let proposalQuery = supabase
    .from("proposals")
    .select("id,org_id,status,title,currency,subtotal_cents,version,sent_at,accepted_at,created_at,organizations(name)")
    .in("org_id", managedOrgIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) proposalQuery = proposalQuery.eq("status", status);

  const { data: proposals, error: proposalsError } = managedOrgIds.length
    ? await proposalQuery
    : { data: [], error: null };

  if (proposalsError) throw new Error("Unable to load proposals.");

  const admin = createAdminSupabaseClient();
  const { data: convertedLeads, error: leadsError } = managedOrgIds.length
    ? await admin
        .from("leads")
        .select("id,company,email,converted_org_id")
        .eq("status", "converted")
        .in("converted_org_id", managedOrgIds)
        .order("company")
    : { data: [], error: null };

  if (leadsError) throw new Error("Unable to load converted leads.");

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Proposals</p>
        <h1>Proposals</h1>
        <p>Create proposal drafts, send locked versions to clients, and track acceptance status.</p>
      </div>

      {params.error ? <p className="form-error alert-box" role="alert">The proposal could not be created. Check the organization and proposal details.</p> : null}

      <section className="admin-panel" aria-labelledby="new-proposal-title">
        <div className="panel-heading">
          <h2 id="new-proposal-title">Create proposal</h2>
          <p>Create the draft shell here, then add line items and terms in the proposal builder.</p>
        </div>

        {organizations?.length ? (
          <form className="proposal-create-grid" action={createProposal}>
            <div className="field">
              <label htmlFor="proposal-org">Organization</label>
              <select id="proposal-org" name="org_id" required>
                <option value="">Select organization</option>
                {organizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>{organization.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="proposal-title">Title</label>
              <input id="proposal-title" name="title" defaultValue="Accounting Services Proposal" required minLength={2} maxLength={180} />
            </div>

            <div className="field">
              <label htmlFor="proposal-lead">Converted lead (optional)</label>
              <select id="proposal-lead" name="lead_id">
                <option value="">No lead link</option>
                {(convertedLeads ?? []).map((lead) => (
                  <option value={lead.id} key={lead.id}>{lead.company} · {lead.email}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="proposal-expires">Expires on (optional)</label>
              <input id="proposal-expires" name="expires_on" type="date" />
            </div>

            <input type="hidden" name="currency" value="USD" />
            <input type="hidden" name="terms_text" value="" />
            <button className="button" type="submit">Create draft</button>
          </form>
        ) : (
          <div className="empty-state">
            <strong>No managed organizations</strong>
            <p>Create or join a managed organization before creating a proposal.</p>
          </div>
        )}
      </section>

      <nav className="filter-tabs" aria-label="Proposal status filters">
        <Link href="/admin/proposals" aria-current={!status ? "page" : undefined}>All</Link>
        {statuses.map((item) => (
          <Link href={`/admin/proposals?status=${item}`} aria-current={status === item ? "page" : undefined} key={item}>
            {item}
          </Link>
        ))}
      </nav>

      <section className="admin-panel">
        {proposals?.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Proposal</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Version</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td><Link className="table-link" href={`/admin/proposals/${proposal.id}`}>{proposal.title}</Link></td>
                    <td>{relatedName(proposal.organizations) ?? "—"}</td>
                    <td>v{proposal.version}</td>
                    <td>{money(proposal.subtotal_cents, proposal.currency.trim())}</td>
                    <td><span className="status-chip">{proposal.status}</span></td>
                    <td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(proposal.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No proposals in this view</strong>
            <p>Create a draft above or choose a different status filter.</p>
          </div>
        )}
      </section>
    </>
  );
}
