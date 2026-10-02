import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().max(max).nullable(),
  );

const optionalHttpsUrl = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => value.startsWith("https://"), "Use an HTTPS QuickBooks URL.")
    .nullable(),
);

export const billingProfileUpdateSchema = z.object({
  orgId: z.string().uuid(),
  qboCustomerRef: optionalText(255),
  qboPortalUrl: optionalHttpsUrl,
  notes: optionalText(4000),
});

export const billingProfileRecordSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  qbo_customer_ref: z.string().nullable(),
  qbo_portal_url: z.string().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string(),
});

export const billingProfileGetResponseSchema = z.object({
  ok: z.boolean(),
  profile: billingProfileRecordSchema.nullable(),
  error: z.string().nullable(),
});

export const billingProfileUpdateResponseSchema = z.object({
  ok: z.boolean(),
  profileId: z.string().uuid().nullable(),
  error: z.string().nullable(),
});

export type BillingProfileUpdate = z.infer<typeof billingProfileUpdateSchema>;
export type BillingProfileRecord = z.infer<typeof billingProfileRecordSchema>;
export type BillingProfileGetResponse = z.infer<typeof billingProfileGetResponseSchema>;
export type BillingProfileUpdateResponse = z.infer<typeof billingProfileUpdateResponseSchema>;
