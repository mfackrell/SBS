"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createThreadSchema,
  markThreadReadSchema,
  sendMessageSchema,
} from "@/lib/contracts/messages";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireOrgMember } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createThread(formData: FormData) {
  const parsed = createThreadSchema.safeParse({
    orgId: formData.get("org_id"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    returnBase: formData.get("return_base"),
  });

  if (!parsed.success) {
    redirect("/login?error=not-authorized");
  }

  const context = await requireOrgMember(parsed.data.orgId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_portal_thread", {
    p_org_id: parsed.data.orgId,
    p_subject: parsed.data.subject,
    p_initial_body: parsed.data.body,
  });

  if (error || typeof data !== "string") {
    redirect(`${parsed.data.returnBase}?error=create-failed`);
  }

  await emitInternalEvent({
    name: "thread_created",
    orgId: parsed.data.orgId,
    actorUserId: context.user.id,
    entityType: "thread",
    entityId: data,
  });

  revalidatePath(parsed.data.returnBase);
  redirect(`${parsed.data.returnBase}/${data}`);
}

export async function sendMessage(input: {
  threadId: string;
  body: string;
  returnPath: string;
}) {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Enter a message." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false as const, error: "Authentication required." };
  }

  const { data, error } = await supabase.rpc("send_portal_message", {
    p_thread_id: parsed.data.threadId,
    p_body: parsed.data.body,
  });

  if (error || typeof data !== "string") {
    return { ok: false as const, error: "The message could not be sent." };
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("org_id")
    .eq("id", parsed.data.threadId)
    .maybeSingle();

  await emitInternalEvent({
    name: "message_sent",
    orgId: thread?.org_id ?? null,
    actorUserId: authData.user.id,
    entityType: "message",
    entityId: data,
    metadata: { thread_id: parsed.data.threadId },
  });

  revalidatePath(parsed.data.returnPath);
  revalidatePath("/app/dashboard");
  return { ok: true as const };
}

export async function markThreadRead(threadId: string) {
  const parsed = markThreadReadSchema.safeParse({ threadId });
  if (!parsed.success) return;

  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  const { data, error } = await supabase.rpc("mark_portal_thread_read", {
    p_thread_id: parsed.data.threadId,
  });

  if (!error && typeof data === "number" && data > 0) {
    const { data: thread } = await supabase
      .from("threads")
      .select("org_id")
      .eq("id", parsed.data.threadId)
      .maybeSingle();

    await emitInternalEvent({
      name: "thread_read",
      orgId: thread?.org_id ?? null,
      actorUserId: authData.user.id,
      entityType: "thread",
      entityId: parsed.data.threadId,
      metadata: { messages_marked_read: data },
    });
  }
}
