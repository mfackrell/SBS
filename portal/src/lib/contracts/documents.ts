import { z } from "zod";

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
] as const;

export const documentCategorySchema = z.enum([
  "client_upload",
  "staff_deliverable",
  "other",
]);

const nullableUuid = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().uuid().nullable(),
);

export const documentUploadIntentSchema = z.object({
  orgId: z.string().uuid(),
  requestId: nullableUuid,
  category: documentCategorySchema,
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z.coerce.number().int().positive(),
  replacesDocumentId: nullableUuid,
});

export const documentUploadIntentResponseSchema = z.object({
  ok: z.boolean(),
  intentId: z.string().uuid().nullable(),
  documentId: z.string().uuid().nullable(),
  path: z.string().nullable(),
  token: z.string().nullable(),
  error: z.string().nullable(),
});

export const documentUploadCompleteSchema = z.object({
  intentId: z.string().uuid(),
});

export const signedDocumentUrlRequestSchema = z.object({
  documentId: z.string().uuid(),
});

export const signedDocumentUrlResponseSchema = z.object({
  ok: z.boolean(),
  url: z.string().url().nullable(),
  expiresIn: z.number().int().positive().nullable(),
  error: z.string().nullable(),
});

export const documentRequestCreateSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).optional().default(""),
  dueDate: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ),
});

export const documentRequestStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["open", "submitted", "closed"]),
});

export const deleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
  returnPath: z.string().startsWith("/admin/requests/").max(300),
});

export type DocumentUploadIntent = z.infer<typeof documentUploadIntentSchema>;
