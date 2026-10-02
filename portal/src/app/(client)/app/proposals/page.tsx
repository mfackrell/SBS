import Link from "next/link";
import { requireClientUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function money(cents: number | null, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.trim(),
  }).format((cents ?? 0) / 100);
}

export default async function ClientProposalsPage() {
  await requireClientUser();
  const supabase = await createServerSupabaseClient();
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("id,status,title,currency,subtotal_cents,version,expires_at,sent_at,created_at,organizations(name)")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load proposals.");

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Proposals</p>
        <h1>Proposals</h1>
        <p>Review proposals sent to your organization and see their current status.</p>
      </div>

      <section className="admin-panel">
        {proposals?.length ? (
          <div className="proposal-card-list">
            {proposals.map((proposal) => (
              <Link className="proposal-card" href={`/app/proposals/${proposal.id}`} key={proposal.id}>
                <div>
                  <span className="status-chip">{proposal.status}</span>
                  <h2>{proposal.title}</h2>
                  <p>{proposal.organizations?.name ?? "Your organization"} · Version {proposal.version}</p>
                </div>
                <div className="proposal-card__amount">
                  <strong>{money(proposal.subtotal_cents, proposal.currency)}</strong>
                  <span>{proposal.expires_at ? `Expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(proposal.expires_at))}` : "No expiration date"}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No proposals yet</strong>
            <p>Proposals sent by Strategic Business Services will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}
