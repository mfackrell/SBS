import { SettingsPanel } from "@/app/(shared)/settings/settings-panel";
import { requireStaffUser } from "@/lib/auth/guards";

type AdminSettingsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
  await requireStaffUser();
  const params = await searchParams;

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Staff account</p>
        <h1>Settings</h1>
        <p>Manage your portal profile and account session.</p>
      </div>
      <SettingsPanel returnPath="/admin/settings" notice={params.notice} error={params.error} />
    </>
  );
}
