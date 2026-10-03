import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isQuickBooksConfigured } from "@/lib/quickbooks/config";
import {
  connectQuickBooks,
  disconnectQuickBooks,
  syncQuickBooks,
} from "@/app/(shared)/quickbooks/actions";

const notices: Record<string, string> = {
  "qbo-connected": "QuickBooks connected and synced.",
  "qbo-connected-sync-pending": "QuickBooks connected, but the first sync needs attention.",
  "qbo-synced": "QuickBooks financial data refreshed.",
  "qbo-disconnected": "QuickBooks disconnected.",
};

const errors: Record<string, string> = {
  "qbo-not-configured": "QuickBooks credentials are not configured in the portal environment.",
  "qbo-rate-limit": "Too many QuickBooks actions. Try again shortly.",
  "qbo-sync-failed": "QuickBooks sync failed. Review the connection and reconnect if needed.",
  "qbo-connect-failed": "QuickBooks authorization could not be completed.",
  "qbo-authorization-declined": "QuickBooks authorization was cancelled.",
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

type PageProps = {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function OrganizationQuickBooksPage({ params, searchParams }: PageProps) {
  const { orgId } = await params;
  const messages = await searchParams;
  await requireOrgManager(orgId);
  const supabase = await createServerSupabaseClient();

  const [{ data: organization }, { data: connection }, { data: snapshots }] = await Promise.all([
    supabase.from("organizations").select("id,name").eq("id", orgId).maybeSingle(),
    supabase
      .from("quickbooks_connections")
      .select("org_id,realm_id,company_name,status,environment,connected_at,last_synced_at,last_error")
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("quickbooks_financial_snapshots")
      .select("as_of_date,currency,revenue_mtd,net_income_mtd,revenue_ytd,gross_profit_ytd,net_income_ytd,cash_balance,accounts_receivable,accounts_payable")
      .eq("org_id", orgId)
      .order("as_of_date", { ascending: false })
      .limit(1),
  ]);

  if (!organization) notFound();
  const snapshot = snapshots?.[0] ?? null;
  const connected = connection && connection.status !== "disconnected";
  const configured = isQuickBooksConfigured();
  const currency = snapshot?.currency ?? "USD";

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">QuickBooks Online</p>
          <h1>{organization.name}</h1>
          <p>Manage the read-only accounting-data connection and financial snapshot.</p>
        </div>
        <Link className="text-action" href={`/admin/organizations/${orgId}`}>Back to organization</Link>
      </div>

      {messages.notice && notices[messages.notice] ? <p className="notice" role="status">{notices[messages.notice]}</p> : null}
      {messages.error && errors[messages.error] ? <p className="form-error alert-box" role="alert">{errors[messages.error]}</p> : null}

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="panel-heading">
            <h2>Connection</h2>
            <p>The portal requests QuickBooks accounting access for reporting and does not create or modify accounting transactions.</p>
          </div>

          {connected ? (
            <dl className="definition-list">
              <div><dt>Status</dt><dd>{connection.status === "active" ? "Connected" : "Needs attention"}</dd></div>
              <div><dt>Company</dt><dd>{connection.company_name || "QuickBooks company"}</dd></div>
              <div><dt>Environment</dt><dd>{connection.environment}</dd></div>
              <div><dt>Last sync</dt><dd>{connection.last_synced_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.last_synced_at)) : "Not yet synced"}</dd></div>
            </dl>
          ) : (
            <p>No QuickBooks company is connected.</p>
          )}

          {connection?.last_error ? <p className="form-error">{connection.last_error}</p> : null}

          <div className="button-row">
            {configured ? (
              <form action={connectQuickBooks}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="view" value="admin" />
                <button className="button" type="submit">{connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}</button>
              </form>
            ) : (
              <span className="muted-text">Waiting for Intuit app credentials.</span>
            )}
            {connected ? (
              <form action={syncQuickBooks}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="view" value="admin" />
                <button className="button button--small" type="submit">Refresh now</button>
              </form>
            ) : null}
            {connected ? (
              <form action={disconnectQuickBooks}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="view" value="admin" />
                <button className="text-button" type="submit">Disconnect</button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-heading">
            <h2>Data policy</h2>
            <p>OAuth tokens are encrypted before storage. Client-facing tables expose connection status and financial summaries only.</p>
          </div>
          <dl className="definition-list">
            <div><dt>Access model</dt><dd>Read-only accounting data</dd></div>
            <div><dt>Sync</dt><dd>Manual plus scheduled refresh</dd></div>
            <div><dt>System of record</dt><dd>QuickBooks Online</dd></div>
          </dl>
        </div>
      </section>

      {snapshot ? (
        <section className="admin-panel">
          <div className="panel-heading"><h2>Latest snapshot</h2><p>As of {snapshot.as_of_date}.</p></div>
          <div className="dashboard-grid">
            <div className="dashboard-card"><span className="dashboard-card__label">Revenue MTD</span><strong className="dashboard-card__metric">{money(snapshot.revenue_mtd, currency)}</strong></div>
            <div className="dashboard-card"><span className="dashboard-card__label">Net income MTD</span><strong className="dashboard-card__metric">{money(snapshot.net_income_mtd, currency)}</strong></div>
            <div className="dashboard-card"><span className="dashboard-card__label">Cash</span><strong className="dashboard-card__metric">{money(snapshot.cash_balance, currency)}</strong></div>
            <div className="dashboard-card"><span className="dashboard-card__label">A/R</span><strong className="dashboard-card__metric">{money(snapshot.accounts_receivable, currency)}</strong></div>
            <div className="dashboard-card"><span className="dashboard-card__label">A/P</span><strong className="dashboard-card__metric">{money(snapshot.accounts_payable, currency)}</strong></div>
            <div className="dashboard-card"><span className="dashboard-card__label">Revenue YTD</span><strong className="dashboard-card__metric">{money(snapshot.revenue_ytd, currency)}</strong></div>
          </div>
        </section>
      ) : null}
    </>
  );
}
