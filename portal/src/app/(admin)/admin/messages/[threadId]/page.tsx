import { ThreadView } from "@/app/(shared)/messages/thread-view";
import { requireStaffUser } from "@/lib/auth/guards";

type AdminThreadPageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function AdminThreadPage({ params }: AdminThreadPageProps) {
  await requireStaffUser();
  const { threadId } = await params;
  return <ThreadView threadId={threadId} basePath="/admin/messages" staffView />;
}
