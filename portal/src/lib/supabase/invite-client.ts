"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

let inviteClient: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Supabase admin invite links use the implicit auth flow. This client exists
 * only for the invite-acceptance screen so the link can establish the
 * authenticated cookie session used by the server action.
 */
export function createInviteBrowserSupabaseClient() {
  if (inviteClient) return inviteClient;

  const env = getPublicEnv();
  inviteClient = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
      },
    },
  );

  return inviteClient;
}
