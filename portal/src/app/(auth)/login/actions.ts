"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";

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

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    redirect("/login?error=invalid-credentials");
  }

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("role,status")
    .eq("user_id", data.user.id)
    .eq("status", "active");

  if (!memberships?.length) {
    await supabase.auth.signOut();
    redirect("/login?error=not-authorized");
  }

  if (memberships.some((membership) => isStaffRole(membership.role))) {
    redirect("/admin/dashboard");
  }

  redirect("/app/dashboard");
}
