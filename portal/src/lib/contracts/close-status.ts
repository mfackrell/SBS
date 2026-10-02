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


export const closePeriodRecordSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  period_label: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  status: closeStatusSchema,
  notes: z.string().nullable(),
  updated_at: z.string(),
});

export const closePeriodEventSchema = z.object({
  id: z.string().uuid(),
  close_period_id: z.string().uuid(),
  from_status: closeStatusSchema.nullable(),
  to_status: closeStatusSchema,
  notes_snapshot: z.string().nullable(),
  created_at: z.string(),
});

export const closePeriodListResponseSchema = z.array(closePeriodRecordSchema);

export const closePeriodMutationResponseSchema = z.object({
  ok: z.boolean(),
  closePeriodId: z.string().uuid().nullable(),
  error: z.string().nullable(),
});

export type ClosePeriodRecord = z.infer<typeof closePeriodRecordSchema>;
export type ClosePeriodEvent = z.infer<typeof closePeriodEventSchema>;
export type ClosePeriodListResponse = z.infer<typeof closePeriodListResponseSchema>;
export type ClosePeriodMutationResponse = z.infer<typeof closePeriodMutationResponseSchema>;
