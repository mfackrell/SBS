import "server-only";

export function logSecurityFailure(
  event: string,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
) {
  console.warn("sbs_security_event", {
    event,
    occurred_at: new Date().toISOString(),
    ...metadata,
  });
}
