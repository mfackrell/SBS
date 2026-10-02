import Link from "next/link";

type ThreadSummary = {
  thread_id: string;
  org_id: string;
  org_name: string;
  subject: string;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | string;
};

type ThreadListProps = {
  threads: ThreadSummary[];
  basePath: "/app/messages" | "/admin/messages";
};

export function ThreadList({ threads, basePath }: ThreadListProps) {
  if (!threads.length) {
    return (
      <div className="empty-state">
        <strong>No conversations yet</strong>
        <p>Start a conversation using the form above.</p>
      </div>
    );
  }

  return (
    <div className="thread-list">
      {threads.map((thread) => {
        const unread = Number(thread.unread_count) || 0;
        const timestamp = thread.last_message_at ?? thread.created_at;

        return (
          <Link className="thread-row" href={`${basePath}/${thread.thread_id}`} key={thread.thread_id}>
            <div className="thread-row__main">
              <span className="document-kind">{thread.org_name}</span>
              <strong>{thread.subject}</strong>
              <p>{thread.last_message_preview || "No messages yet."}</p>
            </div>
            <div className="thread-row__meta">
              {unread > 0 ? <span className="unread-badge">{unread}</span> : null}
              <time dateTime={timestamp}>
                {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))}
              </time>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
