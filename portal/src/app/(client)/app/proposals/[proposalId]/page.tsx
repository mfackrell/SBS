import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientUser, requireOrgMember } from "@/lib/auth/guards";
import { emitInternalEvent } from "@/lib/events/internal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProposalDecisionForm } from "../proposal-decision-form";

type ClientProposalPageProps = {
  params: Promise<{ proposalId: string }>;
};

type SnapshotLineItem = {
  position: number;
  label: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
};

type ProposalSnapshot = {
  title: string;
  currency: string;
  subtotal_cents: number;
  terms_text: string;
  line_items: SnapshotLineItem[];
  version: number;
};

function money(cents: number | null | undefined, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.trim(),
  }).format((cents ?? 0) / 100);
}

export default async function ClientProposalPage({ params }: ClientProposalPageProps) {
  await requireClientUser();
  const { proposalId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*,organizations(name)")
    .eq("id", proposalId)
    .maybeSingle();

  if (error) throw new Error("Unable to load proposal.");
  if (!proposal) notFound();

  const orgContext = await requireOrgMember(proposal.org_id);
  if (orgContext.orgRole !== "client") notFound();

  if (proposal.status === "sent") {
    const { data: viewedStatus, error: viewedError } = await supabase.rpc("mark_portal_proposal_viewed", {
      p_proposal_id: proposal.id,
    });

    if (!viewedError && viewedStatus === "viewed") {
      await emitInternalEvent({
        name: "proposal_viewed",
        orgId: proposal.org_id,
        actorUserId: orgContext.user.id,
        entityType: "proposal",
        entityId: proposal.id,
      });
    }
  }

  const [{ data: lineItems }, { data: acceptance }] = await Promise.all([
    supabase.from("proposal_line_items").select("*").eq("proposal_id", proposal.id).order("position"),
    supabase.from("proposal_acceptances").select("*").eq("proposal_id", proposal.id).maybeSingle(),
  ]);

  const snapshot =
    acceptance?.proposal_snapshot &&
    typeof acceptance.proposal_snapshot === "object" &&
    !Array.isArray(acceptance.proposal_snapshot)
      ? (acceptance.proposal_snapshot as unknown as ProposalSnapshot)
      : null;

  const displayTitle = snapshot?.title ?? proposal.title;
  const displayCurrency = snapshot?.currency ?? proposal.currency;
  const displaySubtotal = snapshot?.subtotal_cents ?? proposal.subtotal_cents;
  const displayTerms = snapshot?.terms_text ?? proposal.terms_text;
  const displayVersion = snapshot?.version ?? proposal.version;
  const displayLines = snapshot?.line_items ?? (lineItems ?? []);
  const nowExpired =
    proposal.status === "expired" ||
    (proposal.expires_at && new Date(proposal.expires_at).getTime() <= Date.now());
  const actionable = ["sent", "viewed"].includes(proposal.status) && !nowExpired;

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">{proposal.organizations?.name ?? "Your organization"} · Proposal</p>
          <h1>{displayTitle}</h1>
          <p>Version {displayVersion} · <span className="status-chip">{nowExpired ? "expired" : proposal.status}</span></p>
        </div>
        <Link className="text-action" href="/app/proposals">All proposals</Link>
      </div>

      <article className="client-proposal-document">
        <header className="client-proposal-document__header">
          <div>
            <span>Strategic Business Services</span>
            <strong>{displayTitle}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{money(displaySubtotal, displayCurrency)}</strong>
          </div>
        </header>

        <div className="proposal-lines proposal-lines--client">
          {displayLines.map((item) => (
            <div className="proposal-line" key={`${item.position}-${item.label}`}>
              <div><strong>{item.label}</strong>{item.description ? <span>{item.description}</span> : null}</div>
              <span>{Number(item.quantity)}</span>
              <span>{money(item.unit_price_cents, displayCurrency)}</span>
              <strong>{money(item.amount_cents, displayCurrency)}</strong>
            </div>
          ))}
        </div>

        <div className="proposal-total"><span>Total</span><strong>{money(displaySubtotal, displayCurrency)}</strong></div>

        <section className="proposal-terms">
          <h2>Terms</h2>
          <p>{displayTerms || "No additional terms text."}</p>
        </section>

        {proposal.expires_at ? (
          <p className="proposal-expiration">Expiration: {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(proposal.expires_at))}</p>
        ) : null}
      </article>

      {acceptance ? (
        <section className="admin-panel accepted-record">
          <div className="panel-heading">
            <h2>Accepted</h2>
            <p>This view is rendered from the stored acceptance snapshot.</p>
          </div>
          <dl className="detail-list">
            <div><dt>Accepted by</dt><dd>{acceptance.accepted_name}</dd></div>
            <div><dt>Accepted email</dt><dd>{acceptance.accepted_email}</dd></div>
            <div><dt>Accepted at</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long" }).format(new Date(acceptance.accepted_at))}</dd></div>
            <div><dt>Statement</dt><dd>{acceptance.acceptance_text_snapshot}</dd></div>
          </dl>
        </section>
      ) : actionable ? (
        <ProposalDecisionForm proposalId={proposal.id} />
      ) : proposal.status === "declined" ? (
        <section className="admin-panel"><strong>Proposal declined</strong>{proposal.decline_reason ? <p>{proposal.decline_reason}</p> : null}</section>
      ) : (
        <section className="admin-panel"><strong>This proposal is not open for acceptance.</strong></section>
      )}

      <p className="portal-footnote">The portal records typed acceptance and workflow evidence. It does not collect payment.</p>
    </>
  );
}
