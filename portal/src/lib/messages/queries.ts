import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getThreadSummaries() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("portal_thread_summaries");

  if (error) {
    throw new Error("Unable to load message threads.");
  }

  return data ?? [];
}

export async function getUnreadMessageCount() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_portal_unread_message_count");

  if (error || typeof data !== "number") {
    return 0;
  }

  return data;
}
