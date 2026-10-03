import Link from "next/link";
import { requireClientUser } from "@/lib/auth/guards";
import { getUnreadMessageCount } from "@/lib/messages/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { relatedName } from "@/lib/data/relations";

const closeStatusLabels: Record<string, string> = {
  pending_records: "Pending records",
  in_progress: "In progress",
  in_review: "In review",
  delivered: "Delivered",
};

function money(value: number | string | null, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

export default async function ClientDashboardPage() {
  await requireClientUser();
  const supabase = await createServerSupabaseClient();

  const [
    { count: openRequestCount, error: requestError },
    unreadMessages,
    { data: proposalRows, error: proposalError },
    { data: closeRows, error: closeError },
    { data: financialRows, error: financialError },
  ] = await Promise.all([
    supabase
      .from("document_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    getUnreadMessageCount(),
    supabase
      .from("proposals")
      .select("id,title,status,version,created_at,organizations(name)")
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("close_periods")
      .select("id,period_label,status,notes,period_start,organizations(name)")
      .order("period_start", { ascending: false })
      .limit(1),
    supabase
      .from("quickbooks_financial_snapshots")
      .select("as_of_date,currency,revenue_mtd,cash_balance")
      .order("as_of_date", { ascending: false })
      .limit(1),
  ]);

  if (requestError || proposalError || closeError || financialError) {
    throw new Error("Unable to load dashboard status.");
  }

  const latestProposal = proposalRows?.[0] ?? null;
  const latestClose = closeRows?.[0] ?? null;
  const latestFinancials = financialRows?.[0] ?? null;

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Client workspace</p>
        <h1>Dashboard</h1>
        <p>Your current requests, messages, financial snapshot, proposal status, and monthly close status in one place.</p>
      </div>

      <section className="dashboard-grid" aria-label="Client workspace summary">
        <Link className="dashboard-card" href="/app/requests">
          <span className="dashboard-card__label">Open requests</span>
          <strong className="dashboard-card__metric">{openRequestCount ?? 0}</strong>
          <span className="dashboard-card__action">View document requests</span>
        </Link>

        <Link className="dashboard-card" href="/app/messages">
          <span className="dashboard-card__label">Unread messages</span>
          <strong className="dashboard-card__metric">{unreadMessages}</strong>
          <span className="dashboard-card__action">Open messages</span>
        </Link>

        <Link className="dashboard-card" href="/app/financials">
          <span className="dashboard-card__label">QuickBooks financials</span>
          {latestFinancials ? (
            <>
              <strong className="dashboard-card__metric">{money(latestFinancials.revenue_mtd, latestFinancials.currency)}</strong>
              <small>Revenue this month · Cash {money(latestFinancials.cash_balance, latestFinancials.currency)}</small>
              <span className="dashboard-card__action">Open financial snapshot</span>
            </>
          ) : (
            <>
              <strong>No snapshot yet</strong>
              <small>Connect QuickBooks to bring your accounting snapshot into SBS.</small>
              <span className="dashboard-card__action">Open Financials</span>
            </>
          )}
        </Link>

        <Link className="dashboard-card" href={latestProposal ? `/app/proposals/${latestProposal.id}` : "/app/proposals"}>
          <span className="dashboard-card__label">Latest proposal</span>
          {latestProposal ? (
            <>
              <strong>{latestProposal.title}</strong>
              <span className="status-chip">{latestProposal.status}</span>
              <small>{relatedName(latestProposal.organizations) ?? "Your organization"} · Version {latestProposal.version}</small>
            </>
          ) : (
            <>
              <strong>No proposal yet</strong>
              <small>Sent proposals will appear here.</small>
            </>
          )}
        </Link>

        <Link className="dashboard-card" href="/app/close-status">
          <span className="dashboard-card__label">Close status</span>
          {latestClose ? (
            <>
              <strong>{latestClose.period_label}</strong>
              <span className="status-chip">{closeStatusLabels[latestClose.status] ?? latestClose.status}</span>
              <small>{relatedName(latestClose.organizations) ?? "Your organization"}</small>
            </>
          ) : (
            <>
              <strong>No close period yet</strong>
              <small>Monthly close status will appear here.</small>
            </>
          )}
        </Link>
      </section>
    </>
  );
}
