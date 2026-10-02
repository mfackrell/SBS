import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signOut, updateProfile } from "./actions";

type SettingsPanelProps = {
  returnPath: "/app/settings" | "/admin/settings";
  notice?: string;
  error?: string;
};

const notices: Record<string, string> = {
  "profile-updated": "Profile updated.",
};

const errors: Record<string, string> = {
  "invalid-profile": "Enter a valid full name and phone number.",
  "profile-update-failed": "Your profile could not be updated.",
};

export async function SettingsPanel({
  returnPath,
  notice,
  error,
}: SettingsPanelProps) {
  const context = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,phone")
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to load profile settings.");
  }

  return (
    <>
      {notice && notices[notice] ? <p className="notice" role="status">{notices[notice]}</p> : null}
      {error && errors[error] ? <p className="form-error alert-box" role="alert">{errors[error]}</p> : null}

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Profile</h2>
          <p>Update the name and optional phone number associated with your portal account.</p>
        </div>

        <form className="settings-form" action={updateProfile}>
          <input type="hidden" name="return_path" value={returnPath} />
          <div className="field">
            <label htmlFor="settings-full-name">Full name</label>
            <input
              id="settings-full-name"
              name="full_name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={profile?.full_name ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-phone">Phone (optional)</label>
            <input
              id="settings-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              defaultValue={profile?.phone ?? ""}
            />
          </div>
          <button className="button" type="submit">Save profile</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Account access</h2>
          <p>
            Portal access remains invite-only and organization-scoped. Password reset and MFA policy are deployment decisions documented in the final owner checklist.
          </p>
        </div>
        <form action={signOut}>
          <button className="button button--secondary" type="submit">Sign out</button>
        </form>
      </section>
    </>
  );
}
