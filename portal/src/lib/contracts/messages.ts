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
