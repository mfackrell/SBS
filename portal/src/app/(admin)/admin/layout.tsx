import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";

export default async function AdminAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await requireStaffUser();

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header__inner">
          <Link className="portal-brand" href="/admin/dashboard">
            <span className="portal-brand__mark" aria-hidden="true">SBS</span>
            <span className="portal-brand__name">Strategic Business Services</span>
          </Link>
          <span className="portal-user">{context.user.email}</span>
        </div>
      </header>

      <div className="portal-body">
        <nav className="portal-nav" aria-label="Staff portal">
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link href="/admin/leads">Leads</Link>
          <Link href="/admin/organizations">Organizations</Link>
        </nav>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
