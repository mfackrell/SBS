import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { markThreadRead } from "./actions";
import { MessageComposer } from "./message-composer";
import { relatedName } from "@/lib/data/relations";

type ThreadViewProps = {
  threadId: string;
  basePath: "/app/messages" | "/admin/messages";
  staffView: boolean;
};

export async function ThreadView({ threadId, basePath, staffView }: ThreadViewProps) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) notFound();

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id,org_id,subject,created_at,organizations(name)")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) throw new Error("Unable to load conversation.");
  if (!thread) notFound();

  await markThreadRead(thread.id);

  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("id,sender_id,body,created_at")
    .eq("thread_id", thread.id)
    .order("created_at");

  if (messageError) throw new Error("Unable to load messages.");

  const senderIds = Array.from(new Set((messages ?? []).map((message) => message.sender_id)));
  const { data: profiles } = staffView && senderIds.length
    ? await supabase.from("profiles").select("user_id,full_name").in("user_id", senderIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name]));

  return (
    <>
      <div className="page-heading page-heading--split">
        <div>
          <p className="portal-eyebrow">{relatedName(thread.organizations) ?? "Organization"} · Messages</p>
          <h1>{thread.subject}</h1>
          <p>Plain-text conversation within this organization workspace.</p>
        </div>
        <Link className="text-action" href={basePath}>All conversations</Link>
      </div>

      <section className="message-thread" aria-label="Conversation messages">
        {(messages ?? []).map((message) => {
          const own = message.sender_id === authData.user.id;
          const senderLabel = own
            ? "You"
            : staffView
              ? (profileMap.get(message.sender_id) || "Portal user")
              : "Strategic Business Services";

          return (
            <article className={own ? "message-bubble message-bubble--own" : "message-bubble"} key={message.id}>
              <header>
                <strong>{senderLabel}</strong>
                <time dateTime={message.created_at}>
                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))}
                </time>
              </header>
              <p>{message.body}</p>
            </article>
          );
        })}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Reply</h2>
          <p>Messages are plain text in the MVP.</p>
        </div>
        <MessageComposer threadId={thread.id} returnPath={`${basePath}/${thread.id}`} />
      </section>
    </>
  );
}
