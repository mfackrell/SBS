import "server-only";

export type InternalEvent = {
  name: string;
  orgId?: string | null;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Supplemental internal analytics hook.
 * Critical workflow evidence is persisted in Postgres audit_logs and domain tables.
 * This structured event is intentionally provider-neutral and can be routed by the host's logs.
 */
export async function emitInternalEvent(event: InternalEvent) {
  console.info("sbs_internal_event", {
    occurred_at: new Date().toISOString(),
    ...event,
  });
}
