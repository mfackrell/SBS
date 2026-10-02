import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateBillingProfile } from "./billing-actions";

type BillingProfileManagerProps = {
  orgId: string;
};

export async function BillingProfileManager({ orgId }: BillingProfileManagerProps) {
  await requireOrgManager(orgId);
  const supabase = await createServerSupabaseClient();
  const { data: profile, error } = await supabase
    .from("billing_profiles")
    .select("id,qbo_customer_ref,qbo_portal_url,notes,updated_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load billing profile.");
  }

  return (
    <section className="admin-panel" aria-labelledby="billing-profile-title">
      <div className="panel-heading">
        <h2 id="billing-profile-title">QuickBooks billing reference</h2>
        <p>
          Store the QuickBooks Online customer reference and external billing link shown to this organization’s client users. The SBS portal does not process billing transactions.
        </p>
      </div>

      <form className="billing-profile-form" action={updateBillingProfile}>
        <input type="hidden" name="org_id" value={orgId} />
        <div className="field">
          <label htmlFor="qbo-customer-ref">QBO customer reference</label>
          <input
            id="qbo-customer-ref"
            name="qbo_customer_ref"
            defaultValue={profile?.qbo_customer_ref ?? ""}
            maxLength={255}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="qbo-portal-url">QBO billing link</label>
          <input
            id="qbo-portal-url"
            name="qbo_portal_url"
            type="url"
            inputMode="url"
            placeholder="https://..."
            defaultValue={profile?.qbo_portal_url ?? ""}
            maxLength={2000}
          />
          <span className="field-hint">HTTPS links only. The link opens QuickBooks in a separate browser context.</span>
        </div>

        <div className="field billing-profile-form__notes">
          <label htmlFor="qbo-notes">Client-visible billing notes</label>
          <textarea
            id="qbo-notes"
            name="notes"
            rows={4}
            maxLength={4000}
            defaultValue={profile?.notes ?? ""}
          />
        </div>

        <button className="button" type="submit">Save billing reference</button>
      </form>
    </section>
  );
}
