"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";
import { consumePortalRateLimit } from "@/lib/security/rate-limit";
import { logSecurityFailure } from "@/lib/security/events";

const acceptanceSchema = z.object({
  inviteId: z.string().uuid(),
  inviteToken: z.string().min(20).max(500),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
});

export async function finalizeInvite(input: {
  inviteId: string;
  inviteToken: string;
  fullName: string;
  password: string;
}) {
  const parsed = acceptanceSchema.safeParse(input);

  if (!parsed.success) {
    return { error: "Check your invitation, name, and password and try again." };
  }

  const allowed = await consumePortalRateLimit(
    "invite_accept_direct",
    parsed.data.inviteId,
    { maxAttempts: 10, windowSeconds: 3600 },
  );

  if (!allowed) {
    logSecurityFailure("invite_accept_direct_rate_limited", {
      invite_id: parsed.data.inviteId,
    });
    return { error: "Too many invitation attempts. Try again after a short delay." };
  }

  const admin = createAdminSupabaseClient();
  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .select("id,email,role,auth_user_id,expires_at,accepted_at,revoked_at")
    .eq("id", parsed.data.inviteId)
    .maybeSingle();

  if (inviteError || !invite) {
    return { error: "This invitation could not be found." };
  }

  if (invite.accepted_at) {
    return { error: "This invitation has already been accepted. Sign in from the login page." };
  }

  if (invite.revoked_at) {
    return { error: "This invitation has been revoked. Contact Strategic Business Services for a new invitation." };
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { error: "This invitation has expired. Ask Strategic Business Services to resend it." };
  }

  let userId = typeof invite.auth_user_id === "string" ? invite.auth_user_id : null;
  let existingMetadata: Record<string, unknown> = {};

  if (userId) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user) {
      return { error: "The invited account could not be loaded." };
    }
    existingMetadata = userData.user.user_metadata ?? {};
  } else {
    const { data: users, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return { error: "The invited account could not be loaded." };
    }

    const existing = users.users.find(
      (user) => user.email?.toLowerCase() === invite.email.toLowerCase(),
    );

    if (existing) {
      userId = existing.id;
      existingMetadata = existing.user_metadata ?? {};
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: invite.email,
        email_confirm: true,
        user_metadata: {
          full_name: parsed.data.fullName,
        },
      });

      if (createError || !created.user) {
        return { error: "The invited account could not be created." };
      }

      userId = created.user.id;
      existingMetadata = created.user.user_metadata ?? {};
    }

    await admin
      .from("invites")
      .update({ auth_user_id: userId })
      .eq("id", invite.id);
  }

  const cleanMetadata: Record<string, unknown> = {
    ...existingMetadata,
    full_name: parsed.data.fullName,
  };
  delete cleanMetadata.portal_invite_id;
  delete cleanMetadata.portal_invite_token;
  delete cleanMetadata.portal_org_id;
  delete cleanMetadata.portal_role;

  const { error: userUpdateError } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: cleanMetadata,
  });

  if (userUpdateError) {
    logSecurityFailure("invite_password_setup_failed", {
      invite_id: invite.id,
      reason: userUpdateError.message.slice(0, 120),
    });
    return { error: "We could not set your password. Please try again." };
  }

  const { data: acceptedData, error: acceptError } = await admin.rpc(
    "accept_portal_invite_server",
    {
      target_invite_id: invite.id,
      invite_token: parsed.data.inviteToken,
      target_user_id: userId,
      accepted_full_name: parsed.data.fullName,
    },
  );

  if (acceptError) {
    logSecurityFailure("invite_accept_direct_failed", {
      invite_id: invite.id,
      reason: acceptError.message.slice(0, 120),
    });

    const message = acceptError.message.toLowerCase();
    if (message.includes("token_mismatch")) {
      return { error: "This invitation link is invalid. Use the newest invitation link." };
    }
    if (message.includes("expired")) {
      return { error: "This invitation has expired. Ask Strategic Business Services to resend it." };
    }
    if (message.includes("email_mismatch") || message.includes("user_mismatch")) {
      return { error: "This invitation belongs to a different account." };
    }

    return { error: "We could not activate this invitation. Contact Strategic Business Services for help." };
  }

  const accepted = Array.isArray(acceptedData) ? acceptedData[0] : null;
  const acceptedRole = accepted?.accepted_role;

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password: parsed.data.password,
  });

  if (signInError) {
    return { error: "Your access was activated, but automatic sign-in failed. Sign in from the login page with the password you just created." };
  }

  if (typeof acceptedRole === "string" && isStaffRole(acceptedRole)) {
    redirect("/admin/dashboard");
  }

  redirect("/app/dashboard");
}
