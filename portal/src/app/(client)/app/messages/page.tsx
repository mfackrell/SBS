import { createThread } from "@/app/(shared)/messages/actions";
import { ThreadList } from "@/app/(shared)/messages/thread-list";
import { requireClientUser } from "@/lib/auth/guards";
import { getThreadSummaries } from "@/lib/messages/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ClientMessagesPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ClientMessagesPage({ searchParams }: ClientMessagesPageProps) {
  const context = await requireClientUser();
  const params = await searchParams;
  const clientOrgIds = context.memberships
    .filter((membership) => membership.role === "client")
    .map((membership) => membership.org_id);

  const supabase = await createServerSupabaseClient();
  const { data: organizations, error } = clientOrgIds.length
    ? await supabase.from("organizations").select("id,name").in("id", clientOrgIds).order("name")
    : { data: [], error: null };

  if (error) throw new Error("Unable to load organizations.");

  const threads = await getThreadSummaries();

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Messages</p>
        <h1>Messages</h1>
        <p>Keep questions and monthly-close communication inside your organization workspace.</p>
      </div>

      {params.error ? <p className="form-error alert-box" role="alert">The conversation could not be created.</p> : null}

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Start conversation</h2>
          <p>All active members of the selected organization are added to the conversation when it is created.</p>
        </div>
        <form className="new-thread-form" action={createThread}>
          <input type="hidden" name="return_base" value="/app/messages" />
          <div className="field">
            <label htmlFor="client-thread-org">Organization</label>
            <select id="client-thread-org" name="org_id" required>
              <option value="">Select organization</option>
              {(organizations ?? []).map((organization) => (
                <option value={organization.id} key={organization.id}>{organization.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="client-thread-subject">Subject</label>
            <input id="client-thread-subject" name="subject" required minLength={2} maxLength={180} />
          </div>
          <div className="field new-thread-form__body">
            <label htmlFor="client-thread-body">Message</label>
            <textarea id="client-thread-body" name="body" rows={5} required maxLength={10000} />
          </div>
          <button className="button" type="submit">Start conversation</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-heading"><h2>Conversations</h2></div>
        <ThreadList threads={threads} basePath="/app/messages" />
      </section>
    </>
  );
}
