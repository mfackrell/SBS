import "server-only";

import { emitInternalEvent } from "@/lib/events/internal";

type VirusScanHookInput = {
  documentId: string;
  orgId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * TODO(Phase 8 / production hardening):
 * Replace this hook with a real malware/virus scanning integration before relying
 * on scanning as a security control. Until then, uploads are restricted by
 * bucket size/MIME allowlists and application validation, but are NOT scanned.
 */
export async function queueVirusScanHook(input: VirusScanHookInput) {
  await emitInternalEvent({
    name: "virus_scan_hook_pending",
    orgId: input.orgId,
    entityType: "document",
    entityId: input.documentId,
    metadata: {
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      scanning_implemented: false,
    },
  });
}
