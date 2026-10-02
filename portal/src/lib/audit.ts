import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type AuditInput = {
  orgId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_logs").insert({
    org_id: input.orgId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("audit_log_write_failed", {
      eventType: input.eventType,
      entityType: input.entityType,
      error: error.message,
    });
  }
}
