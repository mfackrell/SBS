export default function AdminDashboardPage() {
  return (
    <>
      <h1>Staff dashboard</h1>
      <p>
        The administrative workspace is protected for owner and staff memberships. Organization, invite, lead, proposal, document, messaging, and close workflows arrive in later phases.
      </p>
      <section className="foundation-card">
        <strong>Deny-by-default foundation</strong>
        <p>
          Tenant tables are protected by row-level security, with organization membership checks centralized in database helper functions and server guards.
        </p>
      </section>
    </>
  );
}
