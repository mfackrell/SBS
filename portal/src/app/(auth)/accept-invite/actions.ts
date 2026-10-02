"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";

const acceptanceSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
});

export async function finalizeInvite(input: { fullName: string }) {
  const parsed = acceptanceSchema.safeParse(input);

  if (!parsed.success) {
    return { error: "Enter your full name." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return { error: "Your invitation session is missing or expired. Open the newest invitation email and try again." };
  }

  const inviteId = authData.user.user_metadata?.portal_invite_id;
  const inviteToken = authData.user.user_metadata?.portal_invite_token;

  if (typeof inviteId !== "string" || typeof inviteToken !== "string") {
    return { error: "This invitation is missing its portal authorization details. Ask Strategic Business Services to resend it." };
  }

  const { data, error } = await supabase.rpc("accept_portal_invite", {
    target_invite_id: inviteId,
    invite_token: inviteToken,
    accepted_full_name: parsed.data.fullName,
  });

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes("expired")) {
      return { error: "This invitation has expired. Ask Strategic Business Services to resend it." };
    }

    if (message.includes("revoked")) {
      return { error: "This invitation has been revoked. Contact Strategic Business Services for a new invitation." };
    }

    if (message.includes("email_mismatch")) {
      return { error: "This invitation belongs to a different email address." };
    }

    if (message.includes("already_active_member")) {
      return { error: "This account already has active access. Sign in from the login page." };
    }

    return { error: "We could not activate this invitation. Contact Strategic Business Services for help." };
  }

  const accepted = Array.isArray(data) ? data[0] : null;
  const acceptedRole = accepted?.accepted_role;

  const admin = createAdminSupabaseClient();
  const cleanMetadata = { ...authData.user.user_metadata };
  delete cleanMetadata.portal_invite_id;
  delete cleanMetadata.portal_invite_token;

  await admin.auth.admin.updateUserById(authData.user.id, {
    user_metadata: cleanMetadata,
  });

  if (typeof acceptedRole === "string" && isStaffRole(acceptedRole)) {
    redirect("/admin/dashboard");
  }

  redirect("/app/dashboard");
}
