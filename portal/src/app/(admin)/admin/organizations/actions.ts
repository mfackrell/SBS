"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
});

export async function createOrganization(formData: FormData) {
  await requireStaffUser();

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirect("/admin/organizations?error=invalid-name");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_portal_organization", {
    organization_name: parsed.data.name,
  });

  if (error || typeof data !== "string") {
    redirect("/admin/organizations?error=create-failed");
  }

  revalidatePath("/admin/organizations");
  redirect(`/admin/organizations/${data}?notice=created`);
}
