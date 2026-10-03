"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgManager } from "@/lib/auth/guards";
import { isOrgRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { getServerEnv } from "@/lib/env/server";
import { sendPortalInviteEmail } from "@/lib/email/invite-email";
import { ensureInviteAuthUser } from "@/lib/invites/auth-user";
import { createInviteToken } from "@/lib/invites/token";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { consumePortalRateLimit } from "@/lib/security/rate-limit";
import { logSecurityFailure } from "@/lib/security/events";

const uuidSchema = z.string().uuid();

const inviteSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email(),
  role: z.enum(["owner", "staff", "client"]),
});

const membershipSchema = z.object({
  orgId: z.string().uuid(),
  membershipId: z.string().uuid(),
  role: z.enum(["owner", "staff", "client"]),
  status: z.enum(["active", "inactive"]),
});

function inviteExpirationIso() {
  const env = getServerEnv();
  return new Date(Date.now() + env.INVITE_EXPIRES_MINUTES * 60_000).toISOString();
}

export async function createInvite(formData: FormData) {
  const parsed = inviteSchema.safeParse({
    orgId: formData.get("org_id"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect("/admin/organizations?error=invalid-invite");
  }

  const context = await requireOrgManager(parsed.data.orgId);

  const inviteAllowed = await consumePortalRateLimit(
    "invite_create",
    `${context.user.id}:${parsed.data.orgId}`,
    { maxAttempts: 10 },
  );

  if (!inviteAllowed) {
    logSecurityFailure("invite_create_rate_limited", { org_id: parsed.data.orgId });
    redirect(`/admin/organizations/${parsed.data.orgId}?error=invite-rate-limit`);
  }

  if (context.orgRole === "staff" && parsed.data.role !== "client") {
    redirect(`/admin/organizations/${parsed.data.orgId}?error=invite-role`);
  }

  const { token, tokenHash } = createInviteToken();
  const expiresAt = inviteExpirationIso();
  const supabase = await createServerSupabaseClient();

  const { data: inviteId, error: inviteError } = await supabase.rpc("create_portal_invite", {
    target_org_id: parsed.data.orgId,
    invite_email: parsed.data.email,
    invite_role: parsed.data.role,
    invite_token_hash: tokenHash,
    invite_expires_at: expiresAt,
  });

  if (inviteError || typeof inviteId !== "string") {
    const message = inviteError?.message ?? "";
    const code = inviteError?.code === "23505"
      ? "invite-exists"
      : message.includes("user_already_member")
        ? "invite-member"
        : "invite-failed";
    logSecurityFailure("invite_create_failed", {
      org_id: parsed.data.orgId,
      reason: message.slice(0, 120),
    });
    redirect(`/admin/organizations/${parsed.data.orgId}?error=${code}`);
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", parsed.data.orgId)
    .maybeSingle();

  if (organizationError || !organization) {
    await supabase.rpc("revoke_portal_invite", { target_invite_id: inviteId });
    redirect(`/admin/organizations/${parsed.data.orgId}?error=invite-delivery`);
  }

  try {
    const invitedUser = await ensureInviteAuthUser({
      email: parsed.data.email,
    });
    const admin = createAdminSupabaseClient();

    await admin
      .from("invites")
      .update({ auth_user_id: invitedUser.id })
      .eq("id", inviteId);

    const delivery = await sendPortalInviteEmail({
      to: parsed.data.email,
      organizationName: organization.name,
      inviteId,
      token,
      role: parsed.data.role,
      expiresAt,
    });

    await writeAuditLog({
      orgId: parsed.data.orgId,
      actorUserId: context.user.id,
      eventType: "invite.delivery_succeeded",
      entityType: "invite",
      entityId: inviteId,
      metadata: {
        email: parsed.data.email,
        provider: delivery.provider,
        provider_message_id: delivery.messageId,
      },
    });
  } catch (error) {
    await supabase.rpc("revoke_portal_invite", { target_invite_id: inviteId });
    const reason = error instanceof Error ? error.message : "email_delivery_failed";
    await writeAuditLog({
      orgId: parsed.data.orgId,
      actorUserId: context.user.id,
      eventType: "invite.delivery_failed",
      entityType: "invite",
      entityId: inviteId,
      metadata: { email: parsed.data.email, reason: reason.slice(0, 200) },
    });
    redirect(`/admin/organizations/${parsed.data.orgId}?error=invite-delivery`);
  }

  revalidatePath(`/admin/organizations/${parsed.data.orgId}`);
  redirect(`/admin/organizations/${parsed.data.orgId}?notice=invite-sent`);
}

export async function resendInvite(formData: FormData) {
  const inviteId = uuidSchema.safeParse(formData.get("invite_id"));
  const orgId = uuidSchema.safeParse(formData.get("org_id"));

  if (!inviteId.success || !orgId.success) {
    redirect("/admin/organizations?error=invalid-invite");
  }

  const context = await requireOrgManager(orgId.data);
  const resendAllowed = await consumePortalRateLimit(
    "invite_resend",
    `${context.user.id}:${orgId.data}`,
    { maxAttempts: 10 },
  );

  if (!resendAllowed) {
    logSecurityFailure("invite_resend_rate_limited", { org_id: orgId.data });
    redirect(`/admin/organizations/${orgId.data}?error=invite-rate-limit`);
  }

  const { token, tokenHash } = createInviteToken();
  const expiresAt = inviteExpirationIso();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("rotate_portal_invite", {
    target_invite_id: inviteId.data,
    invite_token_hash: tokenHash,
    invite_expires_at: expiresAt,
  });

  const invite = Array.isArray(data) ? data[0] : null;

  if (error || !invite || invite.org_id !== orgId.data || typeof invite.email !== "string" || !isOrgRole(invite.role)) {
    redirect(`/admin/organizations/${orgId.data}?error=resend-failed`);
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId.data)
    .maybeSingle();

  if (organizationError || !organization) {
    redirect(`/admin/organizations/${orgId.data}?error=resend-delivery`);
  }

  try {
    const invitedUser = await ensureInviteAuthUser({
      email: invite.email,
    });
    const admin = createAdminSupabaseClient();

    await admin
      .from("invites")
      .update({ auth_user_id: invitedUser.id })
      .eq("id", inviteId.data);

    const delivery = await sendPortalInviteEmail({
      to: invite.email,
      organizationName: organization.name,
      inviteId: invite.id ?? inviteId.data,
      token,
      role: invite.role,
      expiresAt,
    });

    await writeAuditLog({
      orgId: orgId.data,
      actorUserId: context.user.id,
      eventType: "invite.delivery_succeeded",
      entityType: "invite",
      entityId: inviteId.data,
      metadata: {
        email: invite.email,
        action: "resend",
        provider: delivery.provider,
        provider_message_id: delivery.messageId,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "email_delivery_failed";
    await writeAuditLog({
      orgId: orgId.data,
      actorUserId: context.user.id,
      eventType: "invite.delivery_failed",
      entityType: "invite",
      entityId: inviteId.data,
      metadata: { email: invite.email, reason: reason.slice(0, 200), action: "resend" },
    });
    redirect(`/admin/organizations/${orgId.data}?error=resend-delivery`);
  }

  await writeAuditLog({
    orgId: orgId.data,
    actorUserId: context.user.id,
    eventType: "invite.resent",
    entityType: "invite",
    entityId: inviteId.data,
    metadata: { email: invite.email, role: invite.role },
  });

  revalidatePath(`/admin/organizations/${orgId.data}`);
  redirect(`/admin/organizations/${orgId.data}?notice=invite-resent`);
}

export async function revokeInvite(formData: FormData) {
  const inviteId = uuidSchema.safeParse(formData.get("invite_id"));
  const orgId = uuidSchema.safeParse(formData.get("org_id"));

  if (!inviteId.success || !orgId.success) {
    redirect("/admin/organizations?error=invalid-invite");
  }

  await requireOrgManager(orgId.data);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("revoke_portal_invite", {
    target_invite_id: inviteId.data,
  });

  if (error) {
    redirect(`/admin/organizations/${orgId.data}?error=revoke-failed`);
  }

  revalidatePath(`/admin/organizations/${orgId.data}`);
  redirect(`/admin/organizations/${orgId.data}?notice=invite-revoked`);
}

export async function updateMembership(formData: FormData) {
  const parsed = membershipSchema.safeParse({
    orgId: formData.get("org_id"),
    membershipId: formData.get("membership_id"),
    role: formData.get("role"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect("/admin/organizations?error=invalid-membership");
  }

  await requireOrgManager(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("update_portal_membership", {
    target_membership_id: parsed.data.membershipId,
    new_role: parsed.data.role,
    new_status: parsed.data.status,
  });

  if (error) {
    const code = error.message.includes("organization_requires_active_owner")
      ? "last-owner"
      : error.message.includes("staff_can_only_manage_clients")
        ? "membership-permission"
        : "membership-failed";

    redirect(`/admin/organizations/${parsed.data.orgId}?error=${code}`);
  }

  revalidatePath(`/admin/organizations/${parsed.data.orgId}`);
  redirect(`/admin/organizations/${parsed.data.orgId}?notice=membership-updated`);
}
