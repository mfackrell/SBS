"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";
import { consumePortalRateLimit } from "@/lib/security/rate-limit";
import { logSecurityFailure } from "@/lib/security/events";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid-input");
  }

  const allowed = await consumePortalRateLimit("login", parsed.data.email, { maxAttempts: 10 });

  if (!allowed) {
    logSecurityFailure("login_rate_limited");
    redirect("/login?error=rate-limited");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    logSecurityFailure("login_failed", { reason: "invalid_credentials" });
    redirect("/login?error=invalid-credentials");
  }

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("role,status")
    .eq("user_id", data.user.id)
    .eq("status", "active");

  if (!memberships?.length) {
    logSecurityFailure("login_failed", { reason: "no_active_membership" });
    await supabase.auth.signOut();
    redirect("/login?error=not-authorized");
  }

  if (memberships.some((membership) => isStaffRole(membership.role))) {
    redirect("/admin/dashboard");
  }

  redirect("/app/dashboard");
}
