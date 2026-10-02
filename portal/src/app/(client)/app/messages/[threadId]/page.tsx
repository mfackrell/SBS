import { ThreadView } from "@/app/(shared)/messages/thread-view";
import { requireClientUser } from "@/lib/auth/guards";

type ClientThreadPageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function ClientThreadPage({ params }: ClientThreadPageProps) {
  await requireClientUser();
  const { threadId } = await params;
  return <ThreadView threadId={threadId} basePath="/app/messages" staffView={false} />;
}
