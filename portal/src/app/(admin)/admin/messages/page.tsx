import { createThread } from "@/app/(shared)/messages/actions";
import { ThreadList } from "@/app/(shared)/messages/thread-list";
import { requireStaffUser } from "@/lib/auth/guards";
import { getThreadSummaries } from "@/lib/messages/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AdminMessagesPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminMessagesPage({ searchParams }: AdminMessagesPageProps) {
  const context = await requireStaffUser();
  const params = await searchParams;
  const managedOrgIds = context.memberships
    .filter((membership) => membership.role === "owner" || membership.role === "staff")
    .map((membership) => membership.org_id);

  const supabase = await createServerSupabaseClient();
  const { data: organizations, error } = managedOrgIds.length
    ? await supabase.from("organizations").select("id,name").in("id", managedOrgIds).order("name")
    : { data: [], error: null };

  if (error) throw new Error("Unable to load organizations.");

  const threads = await getThreadSummaries();

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Client communication</p>
        <h1>Messages</h1>
        <p>Organization-scoped conversations between SBS staff and active client members.</p>
      </div>

      {params.error ? <p className="form-error alert-box" role="alert">The conversation could not be created.</p> : null}

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Start conversation</h2>
          <p>All active members of the selected organization are added when the conversation is created.</p>
        </div>
        <form className="new-thread-form" action={createThread}>
          <input type="hidden" name="return_base" value="/admin/messages" />
          <div className="field">
            <label htmlFor="admin-thread-org">Organization</label>
            <select id="admin-thread-org" name="org_id" required>
              <option value="">Select organization</option>
              {(organizations ?? []).map((organization) => (
                <option value={organization.id} key={organization.id}>{organization.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="admin-thread-subject">Subject</label>
            <input id="admin-thread-subject" name="subject" required minLength={2} maxLength={180} />
          </div>
          <div className="field new-thread-form__body">
            <label htmlFor="admin-thread-body">Message</label>
            <textarea id="admin-thread-body" name="body" rows={5} required maxLength={10000} />
          </div>
          <button className="button" type="submit">Start conversation</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-heading"><h2>Conversations</h2></div>
        <ThreadList threads={threads} basePath="/admin/messages" />
      </section>
    </>
  );
}
