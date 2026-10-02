"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { profileUpdateSchema } from "@/lib/contracts/profile";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("full_name"),
    phone: formData.get("phone"),
  });

  const returnPath = String(formData.get("return_path") ?? "/app/settings");
  const safeReturnPath =
    returnPath === "/admin/settings" ? "/admin/settings" : "/app/settings";

  if (!parsed.success) {
    redirect(`${safeReturnPath}?error=invalid-profile`);
  }

  const context = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
    })
    .eq("user_id", context.user.id);

  if (error) {
    redirect(`${safeReturnPath}?error=profile-update-failed`);
  }

  await writeAuditLog({
    orgId: null,
    actorUserId: context.user.id,
    eventType: "profile.updated",
    entityType: "profile",
    entityId: context.user.id,
    metadata: { phone_present: Boolean(parsed.data.phone) },
  });

  await emitInternalEvent({
    name: "profile_updated",
    orgId: null,
    actorUserId: context.user.id,
    entityType: "profile",
    entityId: context.user.id,
  });

  revalidatePath("/app/settings");
  revalidatePath("/admin/settings");
  redirect(`${safeReturnPath}?notice=profile-updated`);
}

export async function signOut(_formData: FormData) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
