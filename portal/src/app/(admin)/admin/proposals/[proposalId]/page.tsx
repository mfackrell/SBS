import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createProposalVersion, sendProposal } from "./actions";
import { ProposalBuilder } from "./proposal-builder";

type AdminProposalPageProps = {
  params: Promise<{ proposalId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  created: "Proposal draft created.",
  sent: "Proposal sent to the client portal.",
  "version-created": "New draft version created.",
};

const errors: Record<string, string> = {
  "line-items-required": "Add at least one line item before sending.",
  "send-failed": "The proposal could not be sent.",
  "version-failed": "A new version could not be created.",
};

function money(cents: number | null, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.trim(),
  }).format((cents ?? 0) / 100);
}

export default async function AdminProposalPage({ params, searchParams }: AdminProposalPageProps) {
  const { proposalId } = await params;
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*,organizations(name)")
    .eq("id", proposalId)
    .maybeSingle();

  if (error) throw new Error("Unable to load proposal.");
  if (!proposal) notFound();

  await requireOrgManager(proposal.org_id);

  const [{ data: lineItems }, { data: acceptance }, { data: versions }] = await Promise.all([
    supabase.from("proposal_line_items").select("*").eq("proposal_id", proposalId).order("position"),
    supabase.from("proposal_acceptances").select("*").eq("proposal_id", proposalId).maybeSingle(),
    supabase
      .from("proposals")
      .select("id,version,status,created_at")
      .eq("proposal_series_id", proposal.proposal_series_id)
      .order("version", { ascending: false }),
  ]);

  const editable = proposal.status === "draft";
  const canVersion = ["sent", "viewed", "declined", "expired"].includes(proposal.status);

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">Proposal · {proposal.organizations?.name ?? "Organization"}</p>
          <h1>{proposal.title}</h1>
          <p>Version {proposal.version} · {money(proposal.subtotal_cents, proposal.currency)} · <span className="status-chip">{proposal.status}</span></p>
        </div>
        <Link className="text-action" href="/admin/proposals">All proposals</Link>
      </div>

      {messages.notice && notices[messages.notice] ? <p className="notice" role="status">{notices[messages.notice]}</p> : null}
      {messages.error && errors[messages.error] ? <p className="form-error alert-box" role="alert">{errors[messages.error]}</p> : null}

      {editable ? (
        <>
          <section className="admin-panel">
            <div className="panel-heading">
              <h2>Proposal builder</h2>
              <p>Drafts are editable. Sending locks this version; later changes require a new version.</p>
            </div>
            <ProposalBuilder proposal={proposal} lineItems={lineItems ?? []} />
          </section>

          <section className="admin-panel proposal-send-panel">
            <div>
              <h2>Send this version</h2>
              <p>Sending makes the proposal visible to client members of {proposal.organizations?.name ?? "this organization"} and locks this version from editing.</p>
            </div>
            <form action={sendProposal}>
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <button className="button" type="submit">Send proposal</button>
            </form>
          </section>
        </>
      ) : (
        <section className="admin-panel">
          <div className="panel-heading">
            <h2>Locked version</h2>
            <p>This proposal version is no longer editable. Its line items and terms are shown below exactly as stored.</p>
          </div>
          <div className="proposal-document">
            <div className="proposal-lines">
              {(lineItems ?? []).map((item) => (
                <div className="proposal-line" key={item.id}>
                  <div><strong>{item.label}</strong>{item.description ? <span>{item.description}</span> : null}</div>
                  <span>{Number(item.quantity)}</span>
                  <span>{money(item.unit_price_cents, proposal.currency)}</span>
                  <strong>{money(item.amount_cents, proposal.currency)}</strong>
                </div>
              ))}
            </div>
            <div className="proposal-total"><span>Total</span><strong>{money(proposal.subtotal_cents, proposal.currency)}</strong></div>
            <div className="proposal-terms"><h3>Terms</h3><p>{proposal.terms_text || "No additional terms text."}</p></div>
          </div>

          {canVersion ? (
            <form className="proposal-version-action" action={createProposalVersion}>
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <button className="button button--secondary" type="submit">Create new version</button>
            </form>
          ) : null}
        </section>
      )}

      {acceptance ? (
        <section className="admin-panel">
          <div className="panel-heading">
            <h2>Acceptance record</h2>
            <p>Acceptance is retained as an immutable snapshot separate from the editable proposal tables.</p>
          </div>
          <dl className="detail-list">
            <div><dt>Accepted by</dt><dd>{acceptance.accepted_name}</dd></div>
            <div><dt>Email</dt><dd>{acceptance.accepted_email}</dd></div>
            <div><dt>Accepted at</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long" }).format(new Date(acceptance.accepted_at))}</dd></div>
            <div><dt>Acceptance statement</dt><dd>{acceptance.acceptance_text_snapshot}</dd></div>
          </dl>
        </section>
      ) : null}

      {(versions ?? []).length > 1 ? (
        <section className="admin-panel">
          <div className="panel-heading"><h2>Version history</h2></div>
          <div className="record-list">
            {(versions ?? []).map((version) => (
              <Link className="record-row" href={`/admin/proposals/${version.id}`} key={version.id}>
                <span><strong>Version {version.version}</strong><small>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(version.created_at))}</small></span>
                <span className="status-chip">{version.status}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
