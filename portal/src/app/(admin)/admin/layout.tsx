import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/guards";
import { getUnreadMessageCount } from "@/lib/messages/queries";

export default async function AdminAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await requireStaffUser();
  const unreadMessages = await getUnreadMessageCount();

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
          <Link href="/admin/proposals">Proposals</Link>
          <Link href="/admin/requests">Requests</Link>
          <Link href="/admin/messages">Messages{unreadMessages > 0 ? <span className="nav-badge">{unreadMessages}</span> : null}</Link>
          <Link href="/admin/settings">Settings</Link>
        </nav>
        <main className="portal-main" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
