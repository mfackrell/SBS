import { z } from "zod";

export const closeStatusSchema = z.enum([
  "pending_records",
  "in_progress",
  "in_review",
  "delivered",
]);

export const createClosePeriodSchema = z.object({
  orgId: z.string().uuid(),
  periodLabel: z.string().trim().min(2).max(120),
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
  notes: z.string().trim().max(4000).optional().default(""),
});

export const updateClosePeriodSchema = z.object({
  orgId: z.string().uuid(),
  closePeriodId: z.string().uuid(),
  status: closeStatusSchema,
  notes: z.string().trim().max(4000).optional().default(""),
});

export type CloseStatus = z.infer<typeof closeStatusSchema>;

export function monthEndFromStart(periodStart: string) {
  const [year, month] = periodStart.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0));
  return end.toISOString().slice(0, 10);
}
