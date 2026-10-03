import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function ensureInviteAuthUser(input: {
  email: string;
  fullName?: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`invite_user_lookup_failed:${listError.message}`);
  }

  const existing = users.users.find(
    (user) => user.email?.toLowerCase() === normalizedEmail,
  );

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: false,
    user_metadata: input.fullName ? { full_name: input.fullName.trim() } : {},
  });

  if (createError || !created.user) {
    throw new Error(
      `invite_user_create_failed:${createError?.message ?? "missing_user"}`,
    );
  }

  return created.user;
}
