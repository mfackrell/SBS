import { requireClientUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeHttpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function ClientBillingPage() {
  await requireClientUser();
  const supabase = await createServerSupabaseClient();

  const { data: profiles, error } = await supabase
    .from("billing_profiles")
    .select("id,org_id,qbo_customer_ref,qbo_portal_url,notes,updated_at,organizations(name)")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load billing references.");
  }

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Billing</p>
        <h1>QuickBooks billing</h1>
        <p>
          View your QuickBooks Online billing reference and open the external billing link provided by Strategic Business Services.
        </p>
      </div>

      <p className="billing-boundary">
        Billing transactions and payment collection are handled outside this portal in QuickBooks Online.
      </p>

      {(profiles ?? []).length ? (
        <div className="billing-card-list">
          {(profiles ?? []).map((profile) => {
            const billingUrl = safeHttpsUrl(profile.qbo_portal_url);

            return (
              <article className="billing-card" key={profile.id}>
                <header>
                  <span className="document-kind">{profile.organizations?.name ?? "Your organization"}</span>
                  <h2>Billing reference</h2>
                </header>

                <dl className="detail-list">
                  <div>
                    <dt>QBO customer reference</dt>
                    <dd>{profile.qbo_customer_ref || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(profile.updated_at))}</dd>
                  </div>
                </dl>

                {profile.notes ? <p className="billing-card__notes">{profile.notes}</p> : null}

                {billingUrl ? (
                  <a className="button billing-card__link" href={billingUrl} target="_blank" rel="noopener noreferrer">
                    Open QuickBooks billing
                  </a>
                ) : (
                  <p className="muted-text">No QuickBooks billing link has been provided yet.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No billing reference yet</strong>
          <p>Strategic Business Services has not added a QuickBooks billing reference for your organization.</p>
        </div>
      )}
    </>
  );
}
