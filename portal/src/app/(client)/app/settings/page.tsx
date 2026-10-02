import { SettingsPanel } from "@/app/(shared)/settings/settings-panel";
import { requireClientUser } from "@/lib/auth/guards";

type ClientSettingsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function ClientSettingsPage({ searchParams }: ClientSettingsPageProps) {
  await requireClientUser();
  const params = await searchParams;

  return (
    <>
      <div className="page-heading">
        <p className="portal-eyebrow">Account</p>
        <h1>Settings</h1>
        <p>Manage your portal profile and account session.</p>
      </div>
      <SettingsPanel returnPath="/app/settings" notice={params.notice} error={params.error} />
    </>
  );
}
