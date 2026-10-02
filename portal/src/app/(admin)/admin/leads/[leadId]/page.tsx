import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffUser } from "@/lib/auth/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { convertLead, updateLeadStatus } from "./actions";

type LeadPageProps = {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  "status-updated": "Lead status updated.",
};

const errors: Record<string, string> = {
  "status-failed": "The lead status could not be updated.",
  "already-converted": "This lead has already been converted.",
  "conversion-failed": "The lead could not be converted.",
};

function valueOrDash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default async function LeadPage({ params, searchParams }: LeadPageProps) {
  await requireStaffUser();
  const { leadId } = await params;
  const messages = await searchParams;
  const admin = createAdminSupabaseClient();

  const [{ data: lead, error: leadError }, { data: events, error: eventsError }] = await Promise.all([
    admin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle(),
    admin
      .from("lead_events")
      .select("id,event_type,payload,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
  ]);

  if (leadError || eventsError) {
    throw new Error("Unable to load lead details.");
  }

  if (!lead) notFound();

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">Lead</p>
          <h1>{lead.name}</h1>
          <p>{lead.company} · {lead.email}</p>
        </div>
        <Link className="text-action" href="/admin/leads">All leads</Link>
      </div>

      {messages.notice && notices[messages.notice] ? <p className="notice" role="status">{notices[messages.notice]}</p> : null}
      {messages.error && errors[messages.error] ? <p className="form-error alert-box" role="alert">{errors[messages.error]}</p> : null}

      <section className="lead-summary">
        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Inquiry</h2>
          </div>
          <dl className="detail-list">
            <div><dt>Status</dt><dd><span className="status-chip">{lead.status.replace("_", " ")}</span></dd></div>
            <div><dt>Phone</dt><dd>{valueOrDash(lead.phone)}</dd></div>
            <div><dt>Website</dt><dd>{lead.website ? <a href={lead.website} rel="noreferrer" target="_blank">{lead.website}</a> : "—"}</dd></div>
            <div><dt>Revenue</dt><dd>{valueOrDash(lead.revenue_range)}</dd></div>
            <div><dt>Business type</dt><dd>{valueOrDash(lead.business_type)}</dd></div>
            <div><dt>Accounting software</dt><dd>{valueOrDash(lead.accounting_software)}</dd></div>
            <div><dt>Monthly transactions</dt><dd>{valueOrDash(lead.monthly_transactions_range)}</dd></div>
            <div><dt>Entities</dt><dd>{valueOrDash(lead.entities_count)}</dd></div>
            <div><dt>Channels</dt><dd>{lead.channels?.length ? lead.channels.join(", ") : "—"}</dd></div>
            <div><dt>Books</dt><dd>{valueOrDash(lead.current_books_state)}</dd></div>
            <div><dt>Start timing</dt><dd>{valueOrDash(lead.start_timeline)}</dd></div>
            <div><dt>Routing</dt><dd>{valueOrDash(lead.routing_outcome)}</dd></div>
            <div><dt>Suggested tier</dt><dd>{valueOrDash(lead.suggested_tier)}</dd></div>
          </dl>
        </article>

        <article className="admin-panel">
          <div className="panel-heading">
            <h2>Attribution</h2>
          </div>
          <dl className="detail-list">
            <div><dt>UTM source</dt><dd>{valueOrDash(lead.utm_source)}</dd></div>
            <div><dt>UTM medium</dt><dd>{valueOrDash(lead.utm_medium)}</dd></div>
            <div><dt>UTM campaign</dt><dd>{valueOrDash(lead.utm_campaign)}</dd></div>
            <div><dt>UTM term</dt><dd>{valueOrDash(lead.utm_term)}</dd></div>
            <div><dt>UTM content</dt><dd>{valueOrDash(lead.utm_content)}</dd></div>
            <div><dt>Landing page</dt><dd className="break-text">{valueOrDash(lead.landing_page)}</dd></div>
            <div><dt>Referrer</dt><dd className="break-text">{valueOrDash(lead.referrer)}</dd></div>
          </dl>
        </article>
      </section>

      {lead.status !== "converted" ? (
        <section className="admin-grid">
          <article className="admin-panel">
            <div className="panel-heading">
              <h2>Lead status</h2>
              <p>Use status to keep the inbox current before conversion.</p>
            </div>
            <div className="button-cluster">
              <form action={updateLeadStatus}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="status" value="contacted" />
                <button className="button button--secondary" type="submit">Mark contacted</button>
              </form>
              <form action={updateLeadStatus}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="status" value="not_fit" />
                <button className="button button--secondary" type="submit">Mark not fit</button>
              </form>
            </div>
          </article>

          <article className="admin-panel">
            <div className="panel-heading">
              <h2>Convert to organization</h2>
              <p>Create the client organization. You can also send the primary contact’s portal invitation now.</p>
            </div>
            <form className="stack-form" action={convertLead}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <div className="field">
                <label htmlFor="organization-name">Organization name</label>
                <input id="organization-name" name="organization_name" defaultValue={lead.company} required minLength={2} maxLength={160} />
              </div>
              <label className="checkbox-field">
                <input type="checkbox" name="invite_primary_contact" value="yes" defaultChecked />
                <span>Invite {lead.name} as the primary client contact</span>
              </label>
              <button className="button" type="submit">Convert lead</button>
            </form>
          </article>
        </section>
      ) : (
        <section className="admin-panel">
          <div className="panel-heading">
            <h2>Converted</h2>
            <p>This lead is locked as converted.</p>
          </div>
          {lead.converted_org_id ? <Link className="text-action" href={`/admin/organizations/${lead.converted_org_id}`}>Open organization</Link> : null}
        </section>
      )}

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Lead history</h2>
        </div>
        {events?.length ? (
          <ol className="event-list">
            {events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.event_type.replaceAll(".", " ")}</strong>
                  <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</span>
                </div>
                {event.payload && Object.keys(event.payload).length ? <code>{JSON.stringify(event.payload)}</code> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state"><strong>No lead events recorded</strong></div>
        )}
      </section>
    </>
  );
}
