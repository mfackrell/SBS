import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isQuickBooksConfigured } from "@/lib/quickbooks/config";

export default async function AdminQuickBooksPage() {
  await requireStaffUser();
  const supabase = await createServerSupabaseClient();

  const [{ data: organizations, error: organizationError }, { data: connections, error: connectionError }] =
    await Promise.all([
      supabase.from("organizations").select("id,name,status").eq("status", "active").order("name"),
      supabase
        .from("quickbooks_connections")
        .select("org_id,company_name,status,environment,last_synced_at,last_error")
        .order("updated_at", { ascending: false }),
    ]);

  if (organizationError || connectionError) {
    throw new Error("Unable to load QuickBooks connection status.");
  }

  const connectionMap = new Map((connections ?? []).map((connection) => [connection.org_id, connection]));
  const configured = isQuickBooksConfigured();
  const connectedCount = (connections ?? []).filter((row) => row.status === "active").length;
  const attentionCount = (connections ?? []).filter((row) => row.status === "error").length;

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Integrations</p>
        <h1>QuickBooks Online</h1>
        <p>Monitor accounting-data connections, refresh health, and client financial snapshots.</p>
      </div>

      {!configured ? (
        <p className="notice" role="status">The integration code is ready. Add Intuit credentials to enable client authorization.</p>
      ) : null}

      <section className="dashboard-grid" aria-label="QuickBooks connection summary">
        <div className="dashboard-card">
          <span className="dashboard-card__label">Connected companies</span>
          <strong className="dashboard-card__metric">{connectedCount}</strong>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card__label">Needs attention</span>
          <strong className="dashboard-card__metric">{attentionCount}</strong>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card__label">Active organizations</span>
          <strong className="dashboard-card__metric">{organizations?.length ?? 0}</strong>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Organizations</h2>
          <p>QuickBooks remains the accounting system of record. SBS stores connection status and read-only financial summaries in the portal.</p>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Organization</th>
                <th scope="col">QuickBooks company</th>
                <th scope="col">Status</th>
                <th scope="col">Last sync</th>
                <th scope="col">Manage</th>
              </tr>
            </thead>
            <tbody>
              {(organizations ?? []).map((organization) => {
                const connection = connectionMap.get(organization.id);
                const state = !connection || connection.status === "disconnected"
                  ? "Not connected"
                  : connection.status === "active"
                    ? "Connected"
                    : "Needs attention";

                return (
                  <tr key={organization.id}>
                    <td><strong>{organization.name}</strong></td>
                    <td>{connection?.company_name || "—"}</td>
                    <td><span className="status-chip">{state}</span></td>
                    <td>
                      {connection?.last_synced_at
                        ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.last_synced_at))
                        : "—"}
                    </td>
                    <td><Link className="text-action" href={`/admin/organizations/${organization.id}/quickbooks`}>Manage</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
