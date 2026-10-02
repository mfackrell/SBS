export default function ClientDashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <p>
        Your client workspace is ready for the next implementation phases. Document requests, messages, proposals, close status, and billing references will be added here.
      </p>
      <section className="foundation-card">
        <strong>Access foundation active</strong>
        <p>
          This route requires an authenticated user with an active client organization membership.
        </p>
      </section>
    </>
  );
}
