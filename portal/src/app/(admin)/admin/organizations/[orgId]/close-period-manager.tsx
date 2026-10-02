import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClosePeriod, updateClosePeriod } from "./close-actions";

type ClosePeriodManagerProps = {
  orgId: string;
};

const statusLabels: Record<string, string> = {
  pending_records: "Pending records",
  in_progress: "In progress",
  in_review: "In review",
  delivered: "Delivered",
};

export async function ClosePeriodManager({ orgId }: ClosePeriodManagerProps) {
  await requireOrgManager(orgId);
  const supabase = await createServerSupabaseClient();
  const { data: periods, error } = await supabase
    .from("close_periods")
    .select("id,period_label,period_start,period_end,status,notes,updated_at")
    .eq("org_id", orgId)
    .order("period_start", { ascending: false })
    .limit(24);

  if (error) {
    throw new Error("Unable to load close periods.");
  }

  return (
    <section className="admin-panel" aria-labelledby="close-periods-title">
      <div className="panel-heading">
        <h2 id="close-periods-title">Monthly close status</h2>
        <p>Create monthly close periods and update the workflow stage and client-visible notes. The portal does not promise a fixed completion date.</p>
      </div>

      <form className="close-create-form" action={createClosePeriod}>
        <input type="hidden" name="org_id" value={orgId} />
        <div className="field">
          <label htmlFor="close-period-label">Period label</label>
          <input id="close-period-label" name="period_label" placeholder="October 2026" required minLength={2} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="close-period-start">Month</label>
          <input id="close-period-start" name="period_start" type="month" required />
          <span className="field-hint">The server converts this to the full calendar-month period.</span>
        </div>
        <div className="field close-create-form__notes">
          <label htmlFor="close-period-notes">Client-visible notes (optional)</label>
          <textarea id="close-period-notes" name="notes" rows={3} maxLength={4000} />
        </div>
        <button className="button" type="submit">Create close period</button>
      </form>

      {(periods ?? []).length ? (
        <div className="close-manager-list">
          {(periods ?? []).map((period) => (
            <article className="close-manager-row" key={period.id}>
              <header>
                <div>
                  <strong>{period.period_label}</strong>
                  <span>{period.period_start} through {period.period_end}</span>
                </div>
                <span className="status-chip">{statusLabels[period.status] ?? period.status}</span>
              </header>
              <form className="close-update-form" action={updateClosePeriod}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="close_period_id" value={period.id} />
                <div className="field">
                  <label htmlFor={`close-status-${period.id}`}>Status</label>
                  <select id={`close-status-${period.id}`} name="status" defaultValue={period.status}>
                    <option value="pending_records">Pending records</option>
                    <option value="in_progress">In progress</option>
                    <option value="in_review">In review</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
                <div className="field close-update-form__notes">
                  <label htmlFor={`close-notes-${period.id}`}>Client-visible notes</label>
                  <textarea id={`close-notes-${period.id}`} name="notes" rows={3} maxLength={4000} defaultValue={period.notes ?? ""} />
                </div>
                <button className="button button--small" type="submit">Save status</button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No close periods yet</strong>
          <p>Create the first monthly period above.</p>
        </div>
      )}
    </section>
  );
}
