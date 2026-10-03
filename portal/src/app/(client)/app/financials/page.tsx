import Link from "next/link";
import { requireClientUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isQuickBooksConfigured } from "@/lib/quickbooks/config";
import { connectQuickBooks, syncQuickBooks } from "@/app/(shared)/quickbooks/actions";

const notices: Record<string, string> = {
  "qbo-connected": "QuickBooks connected and the financial snapshot was refreshed.",
  "qbo-connected-sync-pending": "QuickBooks connected. The first financial refresh still needs attention.",
  "qbo-synced": "QuickBooks financial data refreshed.",
};

const errors: Record<string, string> = {
  "qbo-not-configured": "QuickBooks connection is not enabled yet.",
  "qbo-rate-limit": "Too many QuickBooks actions. Try again in a few minutes.",
  "qbo-sync-failed": "QuickBooks could not be refreshed. Reconnect if the issue continues.",
  "qbo-connect-failed": "QuickBooks could not be connected. Try again or contact SBS.",
  "qbo-authorization-declined": "QuickBooks authorization was cancelled.",
  "qbo-callback-invalid": "QuickBooks returned an incomplete authorization response.",
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

type FinancialsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function ClientFinancialsPage({ searchParams }: FinancialsPageProps) {
  const context = await requireClientUser();
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();
  const orgIds = context.memberships
    .filter((membership) => membership.role === "client")
    .map((membership) => membership.org_id);

  const [{ data: organizations }, { data: connections }, { data: snapshots }] = await Promise.all([
    supabase.from("organizations").select("id,name").in("id", orgIds).order("name"),
    supabase
      .from("quickbooks_connections")
      .select("org_id,company_name,status,last_synced_at,last_error,environment")
      .in("org_id", orgIds),
    supabase
      .from("quickbooks_financial_snapshots")
      .select("org_id,as_of_date,fiscal_ytd_start,currency,revenue_mtd,gross_profit_mtd,net_income_mtd,revenue_ytd,gross_profit_ytd,operating_income_ytd,net_income_ytd,cash_balance,total_assets,total_liabilities,accounts_receivable,accounts_payable,source_updated_at")
      .in("org_id", orgIds)
      .order("as_of_date", { ascending: false }),
  ]);

  const connectionMap = new Map((connections ?? []).map((row) => [row.org_id, row]));
  const snapshotMap = new Map<string, NonNullable<typeof snapshots>[number]>();
  for (const snapshot of snapshots ?? []) {
    if (!snapshotMap.has(snapshot.org_id)) snapshotMap.set(snapshot.org_id, snapshot);
  }
  const configured = isQuickBooksConfigured();

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Financials</p>
        <h1>QuickBooks financial snapshot</h1>
        <p>See the latest accounting information SBS has synced from your QuickBooks Online company.</p>
      </div>

      {messages.notice && notices[messages.notice] ? (
        <p className="notice" role="status">{notices[messages.notice]}</p>
      ) : null}
      {messages.error && errors[messages.error] ? (
        <p className="form-error alert-box" role="alert">{errors[messages.error]}</p>
      ) : null}

      {(organizations ?? []).map((organization) => {
        const connection = connectionMap.get(organization.id);
        const snapshot = snapshotMap.get(organization.id);
        const currency = snapshot?.currency ?? "USD";
        const connected = connection && connection.status !== "disconnected";

        return (
          <section className="admin-panel" key={organization.id} aria-labelledby={`financials-${organization.id}`}>
            <div className="panel-heading">
              <p className="portal-eyebrow">{organization.name}</p>
              <h2 id={`financials-${organization.id}`}>{connection?.company_name || "QuickBooks Online"}</h2>
              {connected ? (
                <p>
                  <span className="status-chip">{connection.status === "active" ? "Connected" : "Needs attention"}</span>
                  {connection.last_synced_at
                    ? ` Last refreshed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.last_synced_at))}.`
                    : " Waiting for the first refresh."}
                </p>
              ) : (
                <p>Connect the QuickBooks Online company SBS uses for this organization.</p>
              )}
            </div>

            {!connected ? (
              configured ? (
                <form action={connectQuickBooks}>
                  <input type="hidden" name="org_id" value={organization.id} />
                  <input type="hidden" name="view" value="client" />
                  <button className="button" type="submit">Connect QuickBooks</button>
                </form>
              ) : (
                <p className="muted-text">QuickBooks connection is being enabled by SBS.</p>
              )
            ) : (
              <div className="button-row">
                <form action={syncQuickBooks}>
                  <input type="hidden" name="org_id" value={organization.id} />
                  <input type="hidden" name="view" value="client" />
                  <button className="button button--small" type="submit">Refresh QuickBooks</button>
                </form>
                {connection.status === "error" && configured ? (
                  <form action={connectQuickBooks}>
                    <input type="hidden" name="org_id" value={organization.id} />
                    <input type="hidden" name="view" value="client" />
                    <button className="text-button" type="submit">Reconnect</button>
                  </form>
                ) : null}
              </div>
            )}

            {connection?.last_error ? <p className="form-error">{connection.last_error}</p> : null}

            {snapshot ? (
              <>
                <div className="dashboard-grid" aria-label={`${organization.name} financial snapshot`}>
                  <div className="dashboard-card"><span className="dashboard-card__label">Revenue this month</span><strong className="dashboard-card__metric">{money(snapshot.revenue_mtd, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Net income this month</span><strong className="dashboard-card__metric">{money(snapshot.net_income_mtd, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Cash</span><strong className="dashboard-card__metric">{money(snapshot.cash_balance, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Accounts receivable</span><strong className="dashboard-card__metric">{money(snapshot.accounts_receivable, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Accounts payable</span><strong className="dashboard-card__metric">{money(snapshot.accounts_payable, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Revenue fiscal YTD</span><strong className="dashboard-card__metric">{money(snapshot.revenue_ytd, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Gross profit fiscal YTD</span><strong className="dashboard-card__metric">{money(snapshot.gross_profit_ytd, currency)}</strong></div>
                  <div className="dashboard-card"><span className="dashboard-card__label">Net income fiscal YTD</span><strong className="dashboard-card__metric">{money(snapshot.net_income_ytd, currency)}</strong></div>
                </div>
                <p className="muted-text">
                  As of {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(`${snapshot.as_of_date}T12:00:00Z`))}. Accrual basis. QuickBooks remains the system of record.
                </p>
              </>
            ) : connected ? (
              <div className="empty-state"><strong>No financial snapshot yet</strong><p>Use Refresh QuickBooks to load the first snapshot.</p></div>
            ) : null}
          </section>
        );
      })}

      <p className="muted-text">Need a full report or something adjusted? <Link href="/app/messages">Message SBS</Link>.</p>
    </>
  );
}
