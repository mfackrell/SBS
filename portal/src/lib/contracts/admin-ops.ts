import { z } from "zod";

const nonnegativeCount = z.coerce.number().int().min(0);

export const adminOpsSummarySchema = z.object({
  organizations: z.object({
    active: nonnegativeCount,
    inactive: nonnegativeCount,
  }),
  leads: z.object({
    new: nonnegativeCount,
    contacted: nonnegativeCount,
    converted: nonnegativeCount,
    not_fit: nonnegativeCount,
  }),
  proposals: z.object({
    draft: nonnegativeCount,
    sent: nonnegativeCount,
    viewed: nonnegativeCount,
    accepted: nonnegativeCount,
    declined: nonnegativeCount,
    expired: nonnegativeCount,
  }),
  document_requests: z.object({
    open: nonnegativeCount,
    submitted: nonnegativeCount,
    closed: nonnegativeCount,
  }),
  close_periods: z.object({
    pending_records: nonnegativeCount,
    in_progress: nonnegativeCount,
    in_review: nonnegativeCount,
    delivered: nonnegativeCount,
  }),
});

export type AdminOpsSummary = z.infer<typeof adminOpsSummarySchema>;
