import { z } from "zod";

export const createThreadSchema = z.object({
  orgId: z.string().uuid(),
  subject: z.string().trim().min(2).max(180),
  body: z.string().trim().min(1).max(10_000),
  returnBase: z.enum(["/app/messages", "/admin/messages"]),
});

export const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
  returnPath: z.string().regex(/^\/(?:app|admin)\/messages\/[0-9a-f-]{36}$/i),
});

export const markThreadReadSchema = z.object({
  threadId: z.string().uuid(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;


export const messageRecordSchema = z.object({
  id: z.string().uuid(),
  thread_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
});

export const threadSummarySchema = z.object({
  thread_id: z.string().uuid(),
  org_id: z.string().uuid(),
  org_name: z.string(),
  subject: z.string(),
  created_at: z.string(),
  last_message_at: z.string().nullable(),
  last_message_preview: z.string().nullable(),
  unread_count: z.coerce.number().int().min(0),
});

export const threadListResponseSchema = z.array(threadSummarySchema);

export const sendMessageResponseSchema = z.object({
  ok: z.boolean(),
  messageId: z.string().uuid().nullable(),
  error: z.string().nullable(),
});

export const markThreadReadResponseSchema = z.object({
  ok: z.boolean(),
  markedRead: z.number().int().min(0),
  error: z.string().nullable(),
});

export type MessageRecord = z.infer<typeof messageRecordSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
export type MarkThreadReadResponse = z.infer<typeof markThreadReadResponseSchema>;
