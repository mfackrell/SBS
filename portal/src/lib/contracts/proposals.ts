import { z } from "zod";

const optionalDate = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);

export const proposalLineItemSchema = z.object({
  label: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).optional().default(""),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_147_483_647),
});

export const proposalCreateSchema = z.object({
  orgId: z.string().uuid(),
  leadId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().uuid().nullable(),
  ),
  title: z.string().trim().min(2).max(180),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  termsText: z.string().max(20_000).default(""),
  expiresOn: optionalDate,
});

export const proposalDraftSchema = z.object({
  proposalId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  termsText: z.string().max(20_000),
  expiresOn: optionalDate,
  lineItems: z.array(proposalLineItemSchema).min(1).max(100),
});

export const proposalAcceptSchema = z.object({
  proposalId: z.string().uuid(),
  acceptedName: z.string().trim().min(2).max(120),
  acceptanceConfirmed: z.literal(true),
});

export const proposalDeclineSchema = z.object({
  proposalId: z.string().uuid(),
  reason: z.string().trim().max(1000).optional().default(""),
});

export const proposalIdSchema = z.string().uuid();

export type ProposalLineItemInput = z.infer<typeof proposalLineItemSchema>;
export type ProposalDraftInput = z.infer<typeof proposalDraftSchema>;
