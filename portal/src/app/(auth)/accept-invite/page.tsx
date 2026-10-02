import Link from "next/link";
import { AcceptInviteForm } from "./accept-invite-form";

export const dynamic = "force-dynamic";

type AcceptInvitePageProps = {
  searchParams: Promise<{ invite_id?: string }>;
};

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams;
  const inviteId = typeof params.invite_id === "string" ? params.invite_id : "";

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="accept-title">
        <div className="auth-panel__inner">
          <Link className="portal-brand" href="/login" aria-label="Strategic Business Services client portal">
            <span className="portal-brand__mark" aria-hidden="true">SBS</span>
            <span className="portal-brand__name">Strategic Business Services</span>
          </Link>

          <h1 id="accept-title">Set up your portal access</h1>
          <p className="auth-panel__lede">
            Confirm your name and create a password to finish accepting your invitation.
          </p>

          <AcceptInviteForm inviteId={inviteId} />

          <p className="auth-note">
            Access is tied to the email address that received the invitation. Invitations can be revoked by Strategic Business Services before acceptance.
          </p>
        </div>
      </section>

      <aside className="auth-context" aria-label="Portal access information">
        <div className="auth-context__inner">
          <p className="auth-context__eyebrow">Invite-only access</p>
          <h2>Your workspace stays scoped to your organization.</h2>
          <p>
            Organization membership controls which client data, requests, documents, messages, proposals, and close information an account can access.
          </p>
        </div>
      </aside>
    </main>
  );
}
