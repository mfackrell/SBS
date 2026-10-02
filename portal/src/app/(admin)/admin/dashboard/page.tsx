import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <>
      <h1>Staff dashboard</h1>
      <p>
        Manage organization access here. Lead intake, proposals, documents, messages, and close workflow are added in later phases.
      </p>

      <section className="foundation-card">
        <strong>Organizations and invitations</strong>
        <p>
          Create client organizations, invite users, and manage organization-scoped membership roles and status.
        </p>
        <p className="card-action"><Link href="/admin/organizations">Manage organizations</Link></p>
      </section>
    </>
  );
}
