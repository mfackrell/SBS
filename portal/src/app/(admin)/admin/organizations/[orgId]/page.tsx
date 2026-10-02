import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createInvite, resendInvite, revokeInvite, updateMembership } from "./actions";
import { ClosePeriodManager } from "./close-period-manager";
import { BillingProfileManager } from "./billing-profile-manager";

type OrganizationPageProps = {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const notices: Record<string, string> = {
  created: "Organization created.",
  "invite-sent": "Invitation sent.",
  "invite-resent": "Invitation resent.",
  "invite-revoked": "Invitation revoked.",
  "membership-updated": "Membership updated.",
  "lead-converted": "Lead converted to this organization.",
  "lead-converted-invited": "Lead converted and the primary contact invitation was sent.",
  "close-period-created": "Monthly close period created.",
  "close-period-updated": "Monthly close status updated.",
  "billing-updated": "QuickBooks billing reference updated.",
};

const errors: Record<string, string> = {
  "invite-role": "Staff users may invite clients only. An owner is required to invite staff or another owner.",
  "invite-exists": "A pending invitation already exists for that email address.",
  "invite-member": "That email already belongs to an active member of this organization.",
  "invite-failed": "The invitation could not be created.",
  "invite-delivery": "The invitation record was created but email delivery failed. It has been revoked.",
  "resend-failed": "The invitation could not be prepared for resend.",
  "resend-delivery": "The invitation email could not be resent.",
  "revoke-failed": "The invitation could not be revoked.",
  "last-owner": "Every organization must keep at least one active owner.",
  "membership-permission": "Staff users may manage client memberships only.",
  "membership-failed": "The membership could not be updated.",
  "lead-invite-failed": "The lead was converted, but the primary-contact invitation could not be created.",
  "lead-invite-delivery": "The lead was converted, but the primary-contact invitation email could not be delivered.",
  "close-period-exists": "A close period already exists for that month.",
  "close-period-create-failed": "The monthly close period could not be created.",
  "close-period-update-failed": "The monthly close status could not be updated.",
  "billing-invalid": "Check the QuickBooks customer reference, HTTPS billing link, and billing notes.",
  "billing-update-failed": "The QuickBooks billing reference could not be updated.",
};

function inviteStatus(invite: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}) {
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) return "revoked";
  if (new Date(invite.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}

export default async function OrganizationPage({ params, searchParams }: OrganizationPageProps) {
  const { orgId } = await params;
  const messages = await searchParams;
  const context = await requireOrgManager(orgId);
  const supabase = await createServerSupabaseClient();

  const [{ data: organization }, { data: memberships, error: membershipError }, { data: invites, error: inviteError }] = await Promise.all([
    supabase.from("organizations").select("id,name,status,created_at").eq("id", orgId).maybeSingle(),
    supabase.from("organization_memberships").select("id,user_id,role,status,created_at").eq("org_id", orgId).order("created_at"),
    supabase.from("invites").select("id,email,role,expires_at,accepted_at,revoked_at,created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
  ]);

  if (!organization) notFound();
  if (membershipError || inviteError) throw new Error("Unable to load organization access records.");

  const userIds = (memberships ?? []).map((membership) => membership.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id,full_name,phone").in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const canInviteStaff = context.orgRole === "owner";

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">Organization</p>
          <h1>{organization.name}</h1>
          <p>Manage memberships and invite-only access for this organization.</p>
        </div>
        <Link className="text-action" href="/admin/organizations">All organizations</Link>
      </div>

      {messages.notice && notices[messages.notice] ? <p className="notice" role="status">{notices[messages.notice]}</p> : null}
      {messages.error && errors[messages.error] ? <p className="form-error alert-box" role="alert">{errors[messages.error]}</p> : null}

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="panel-heading">
            <h2>Invite user</h2>
            <p>{canInviteStaff ? "Owners can invite clients, staff, or another owner." : "Staff users can invite clients."}</p>
          </div>

          <form className="stack-form" action={createInvite}>
            <input type="hidden" name="org_id" value={orgId} />
            <div className="field">
              <label htmlFor="invite-email">Email</label>
              <input id="invite-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="invite-role">Role</label>
              <select id="invite-role" name="role" defaultValue="client">
                <option value="client">Client</option>
                {canInviteStaff ? <option value="staff">Staff</option> : null}
                {canInviteStaff ? <option value="owner">Owner</option> : null}
              </select>
            </div>
            <button className="button" type="submit">Send invitation</button>
          </form>
        </div>

        <div className="admin-panel">
          <div className="panel-heading">
            <h2>Access model</h2>
            <p>Membership is organization-scoped. Clients cannot see another organization's records, and staff-level access is validated again on the server.</p>
          </div>
          <dl className="definition-list">
            <div><dt>Your role</dt><dd>{context.orgRole}</dd></div>
            <div><dt>Organization status</dt><dd>{organization.status}</dd></div>
            <div><dt>Active members</dt><dd>{(memberships ?? []).filter((item) => item.status === "active").length}</dd></div>
          </dl>
        </div>
      </section>

      <section className="admin-panel" aria-labelledby="members-title">
        <div className="panel-heading">
          <h2 id="members-title">Members</h2>
          <p>Changing a role or status writes an audit event. The final active owner cannot be removed or demoted.</p>
        </div>

        {memberships?.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const profile = profileMap.get(membership.user_id);
                  const staffCanEdit = context.orgRole === "owner" || membership.role === "client";

                  return (
                    <tr key={membership.id}>
                      <td>
                        <strong>{profile?.full_name || "Portal user"}</strong>
                        <small>{membership.user_id === context.user.id ? "You" : `User ${membership.user_id.slice(0, 8)}`}</small>
                      </td>
                      <td>{membership.role}</td>
                      <td><span className="status-chip">{membership.status}</span></td>
                      <td>
                        {staffCanEdit ? (
                          <form className="row-form" action={updateMembership}>
                            <input type="hidden" name="org_id" value={orgId} />
                            <input type="hidden" name="membership_id" value={membership.id} />
                            <label className="sr-only" htmlFor={`role-${membership.id}`}>Role</label>
                            <select id={`role-${membership.id}`} name="role" defaultValue={membership.role}>
                              <option value="client">Client</option>
                              {context.orgRole === "owner" ? <option value="staff">Staff</option> : null}
                              {context.orgRole === "owner" ? <option value="owner">Owner</option> : null}
                            </select>
                            <label className="sr-only" htmlFor={`status-${membership.id}`}>Status</label>
                            <select id={`status-${membership.id}`} name="status" defaultValue={membership.status}>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                            <button className="button button--small" type="submit">Save</button>
                          </form>
                        ) : (
                          <span className="muted-text">Owner required</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><strong>No memberships</strong></div>
        )}
      </section>

      <BillingProfileManager orgId={orgId} />

      <ClosePeriodManager orgId={orgId} />

      <section className="admin-panel" aria-labelledby="invites-title">
        <div className="panel-heading">
          <h2 id="invites-title">Invitations</h2>
          <p>Pending invitations can be resent with a new one-time portal authorization token or revoked before acceptance.</p>
        </div>

        {invites?.length ? (
          <div className="record-list">
            {invites.map((invite) => {
              const status = inviteStatus(invite);
              const canManageInvite = context.orgRole === "owner" || invite.role === "client";

              return (
                <div className="record-row record-row--static" key={invite.id}>
                  <span>
                    <strong>{invite.email}</strong>
                    <small>{invite.role} · expires {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expires_at))}</small>
                  </span>
                  <span className="record-actions">
                    <span className="status-chip">{status}</span>
                    {canManageInvite && status !== "accepted" ? (
                      <>
                        <form action={resendInvite}>
                          <input type="hidden" name="org_id" value={orgId} />
                          <input type="hidden" name="invite_id" value={invite.id} />
                          <button className="text-button" type="submit">Resend</button>
                        </form>
                        {status !== "revoked" ? (
                          <form action={revokeInvite}>
                            <input type="hidden" name="org_id" value={orgId} />
                            <input type="hidden" name="invite_id" value={invite.id} />
                            <button className="text-button" type="submit">Revoke</button>
                          </form>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No invitations yet</strong>
            <p>Use the invite form above to add a client or team member.</p>
          </div>
        )}
      </section>
    </>
  );
}
