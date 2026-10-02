import { requireClientUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  pending_records: "Pending records",
  in_progress: "In progress",
  in_review: "In review",
  delivered: "Delivered",
};

export default async function ClientCloseStatusPage() {
  await requireClientUser();
  const supabase = await createServerSupabaseClient();

  const { data: periods, error } = await supabase
    .from("close_periods")
    .select("id,org_id,period_label,period_start,period_end,status,notes,updated_at,organizations(name)")
    .order("period_start", { ascending: false })
    .limit(24);

  if (error) throw new Error("Unable to load close status.");

  const periodIds = (periods ?? []).map((period) => period.id);
  const { data: events, error: eventError } = periodIds.length
    ? await supabase
        .from("close_period_events")
        .select("id,close_period_id,from_status,to_status,notes_snapshot,created_at")
        .in("close_period_id", periodIds)
        .order("created_at")
    : { data: [], error: null };

  if (eventError) throw new Error("Unable to load close-status history.");

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Monthly close</p>
        <h1>Close status</h1>
        <p>Track the current workflow stage and status history for each monthly close. Timing depends on records received and review needs.</p>
      </div>

      {(periods ?? []).length ? (
        <div className="close-status-list">
          {(periods ?? []).map((period) => {
            const timeline = (events ?? []).filter((event) => event.close_period_id === period.id);

            return (
              <article className="close-status-card" key={period.id}>
                <header>
                  <div>
                    <span className="document-kind">{period.organizations?.name ?? "Your organization"}</span>
                    <h2>{period.period_label}</h2>
                    <p>{period.period_start} through {period.period_end}</p>
                  </div>
                  <span className="status-chip">{statusLabels[period.status] ?? period.status}</span>
                </header>

                {period.notes ? <p className="close-status-card__notes">{period.notes}</p> : null}

                <ol className="close-timeline" aria-label={`${period.period_label} close status history`}>
                  {timeline.map((event) => (
                    <li key={event.id}>
                      <span className="close-timeline__marker" aria-hidden="true" />
                      <div>
                        <strong>{statusLabels[event.to_status] ?? event.to_status}</strong>
                        <time dateTime={event.created_at}>
                          {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}
                        </time>
                        {event.notes_snapshot ? <p>{event.notes_snapshot}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No close periods yet</strong>
          <p>Your monthly close status will appear here when SBS creates the first period.</p>
        </div>
      )}
    </>
  );
}
