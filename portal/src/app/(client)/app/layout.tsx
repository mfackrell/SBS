import Link from "next/link";
import { requireClientUser } from "@/lib/auth/guards";
import { getUnreadMessageCount } from "@/lib/messages/queries";

export default async function ClientAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await requireClientUser();
  const unreadMessages = await getUnreadMessageCount();

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="portal-header">
        <div className="portal-header__inner">
          <Link className="portal-brand" href="/app/dashboard">
            <span className="portal-brand__mark" aria-hidden="true">SBS</span>
            <span className="portal-brand__name">Strategic Business Services</span>
          </Link>
          <span className="portal-user">{context.user.email}</span>
        </div>
      </header>

      <div className="portal-body">
        <nav className="portal-nav" aria-label="Client portal">
          <Link href="/app/dashboard">Dashboard</Link>
          <Link href="/app/proposals">Proposals</Link>
          <Link href="/app/requests">Requests</Link>
          <Link href="/app/documents">Documents</Link>
          <Link href="/app/messages">Messages{unreadMessages > 0 ? <span className="nav-badge">{unreadMessages}</span> : null}</Link>
          <Link href="/app/close-status">Close status</Link>
          <Link href="/app/billing">Billing</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <main className="portal-main" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
