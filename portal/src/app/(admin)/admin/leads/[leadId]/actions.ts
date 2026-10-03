"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireStaffUser } from "@/lib/auth/guards";
import { getServerEnv } from "@/lib/env/server";
import { sendPortalInviteEmail } from "@/lib/email/invite-email";
import { ensureInviteAuthUser } from "@/lib/invites/auth-user";
import { createInviteToken } from "@/lib/invites/token";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const statusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(["new", "contacted", "not_fit"]),
});

const convertSchema = z.object({
  leadId: z.string().uuid(),
  organizationName: z.string().trim().min(2).max(160),
  invitePrimaryContact: z.boolean(),
});

export async function updateLeadStatus(formData: FormData) {
  await requireStaffUser();

  const parsed = statusSchema.safeParse({
    leadId: formData.get("lead_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect("/admin/leads?error=invalid-status");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_portal_lead_status", {
    p_lead_id: parsed.data.leadId,
    p_status: parsed.data.status,
  });

  if (error) {
    redirect(`/admin/leads/${parsed.data.leadId}?error=status-failed`);
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${parsed.data.leadId}`);
  redirect(`/admin/leads/${parsed.data.leadId}?notice=status-updated`);
}

export async function convertLead(formData: FormData) {
  const context = await requireStaffUser();

  const parsed = convertSchema.safeParse({
    leadId: formData.get("lead_id"),
    organizationName: formData.get("organization_name"),
    invitePrimaryContact: formData.get("invite_primary_contact") === "yes",
  });

  if (!parsed.success) {
    redirect("/admin/leads?error=invalid-conversion");
  }

  const admin = createAdminSupabaseClient();
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id,name,email,phone,company,status")
    .eq("id", parsed.data.leadId)
    .maybeSingle();

  if (leadError || !lead) {
    redirect("/admin/leads?error=lead-not-found");
  }

  const supabase = await createServerSupabaseClient();
  const { data: orgId, error: convertError } = await supabase.rpc("convert_portal_lead", {
    p_lead_id: parsed.data.leadId,
    p_organization_name: parsed.data.organizationName,
  });

  if (convertError || typeof orgId !== "string") {
    const code = convertError?.message.includes("lead_already_converted")
      ? "already-converted"
      : "conversion-failed";
    redirect(`/admin/leads/${parsed.data.leadId}?error=${code}`);
  }

  if (!parsed.data.invitePrimaryContact) {
    revalidatePath("/admin/leads");
    revalidatePath("/admin/organizations");
    redirect(`/admin/organizations/${orgId}?notice=lead-converted`);
  }

  const { token, tokenHash } = createInviteToken();
  const env = getServerEnv();
  const expiresAt = new Date(Date.now() + env.INVITE_EXPIRES_MINUTES * 60_000).toISOString();

  const { data: inviteId, error: inviteError } = await supabase.rpc("create_portal_invite", {
    target_org_id: orgId,
    invite_email: lead.email,
    invite_role: "client",
    invite_token_hash: tokenHash,
    invite_expires_at: expiresAt,
  });

  if (inviteError || typeof inviteId !== "string") {
    await writeAuditLog({
      orgId,
      actorUserId: context.user.id,
      eventType: "lead.primary_contact_invite_failed",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { email: lead.email, reason: inviteError?.message ?? "invite_record_failed" },
    });
    redirect(`/admin/organizations/${orgId}?error=lead-invite-failed`);
  }

  let invitedUserId: string;

  try {
    const invitedUser = await ensureInviteAuthUser({
      email: lead.email,
      fullName: lead.name,
    });
    invitedUserId = invitedUser.id;

    await admin
      .from("invites")
      .update({ auth_user_id: invitedUser.id })
      .eq("id", inviteId);

    await sendPortalInviteEmail({
      to: lead.email,
      organizationName: parsed.data.organizationName,
      inviteId,
      token,
      role: "client",
      expiresAt,
    });
  } catch (error) {
    await supabase.rpc("revoke_portal_invite", { target_invite_id: inviteId });
    const reason = error instanceof Error ? error.message : "email_delivery_failed";
    await writeAuditLog({
      orgId,
      actorUserId: context.user.id,
      eventType: "lead.primary_contact_invite_failed",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { email: lead.email, reason: reason.slice(0, 200) },
    });
    redirect(`/admin/organizations/${orgId}?error=lead-invite-delivery`);
  }

  await admin.from("profiles").upsert({
    user_id: invitedUserId,
    full_name: lead.name,
    phone: lead.phone,
  });

  const { error: primaryContactError } = await admin
    .from("organizations")
    .update({ primary_contact_id: invitedUserId })
    .eq("id", orgId);

  if (primaryContactError) {
    await writeAuditLog({
      orgId,
      actorUserId: context.user.id,
      eventType: "organization.primary_contact_update_failed",
      entityType: "organization",
      entityId: orgId,
      metadata: { lead_id: parsed.data.leadId, reason: primaryContactError.message },
    });
  } else {
    await writeAuditLog({
      orgId,
      actorUserId: context.user.id,
      eventType: "organization.primary_contact_set",
      entityType: "organization",
      entityId: orgId,
      metadata: { lead_id: parsed.data.leadId, user_id: invitedUserId },
    });
  }

  revalidatePath("/admin/leads");
  revalidatePath("/admin/organizations");
  redirect(`/admin/organizations/${orgId}?notice=lead-converted-invited`);
}
