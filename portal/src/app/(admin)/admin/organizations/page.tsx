import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";

type OrganizationsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id,name,status,created_at")
    .order("name");

  if (error) {
    throw new Error("Unable to load organizations.");
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="portal-eyebrow">Organizations</p>
          <h1>Client organizations</h1>
          <p>Create and manage the organizations that define tenant access in the portal.</p>
        </div>
      </div>

      <section className="admin-panel" aria-labelledby="create-org-title">
        <div className="panel-heading">
          <h2 id="create-org-title">Create organization</h2>
          <p>The staff user creating the organization becomes an owner for that organization.</p>
        </div>
        <form className="inline-form" action={createOrganization}>
          <div className="field">
            <label htmlFor="organization-name">Organization name</label>
            <input id="organization-name" name="name" required minLength={2} maxLength={160} />
          </div>
          <button className="button" type="submit">Create organization</button>
        </form>
        {params.error ? <p className="form-error" role="alert">The organization could not be created. Check the name and your permissions.</p> : null}
      </section>

      <section className="admin-panel" aria-labelledby="org-list-title">
        <div className="panel-heading">
          <h2 id="org-list-title">Organizations you manage</h2>
        </div>

        {organizations?.length ? (
          <div className="record-list">
            {organizations.map((organization) => (
              <Link className="record-row" href={`/admin/organizations/${organization.id}`} key={organization.id}>
                <span>
                  <strong>{organization.name}</strong>
                  <small>Created {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(organization.created_at))}</small>
                </span>
                <span className="status-chip">{organization.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No organizations yet</strong>
            <p>Create the first organization above.</p>
          </div>
        )}
      </section>
    </>
  );
}
