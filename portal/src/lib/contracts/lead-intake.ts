import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined || value === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const channelSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) return [value];
    return [];
  },
  z.array(z.string().trim().min(1).max(80)).max(12),
);

const consentSchema = z
  .union([z.literal(true), z.literal("true"), z.literal("yes"), z.literal("on")])
  .transform(() => true);

const entitiesSchema = z
  .enum(["1", "2", "3 or more"])
  .transform((value) => (value === "3 or more" ? 3 : Number(value)));

export const leadIntakeRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: optionalText(40),
    company: z.string().trim().min(2).max(180),
    website: optionalText(300),
    annual_revenue_range: z.string().trim().min(1).max(80),
    business_type: z.string().trim().min(1).max(120),
    business_type_other: optionalText(240),
    accounting_software: z.string().trim().min(1).max(80),
    monthly_transactions: z.string().trim().min(1).max(80),
    legal_entities: entitiesSchema,
    sales_channels: channelSchema,
    sales_channels_other: optionalText(120),
    books_state: z.string().trim().min(1).max(120),
    start_timing: z.string().trim().min(1).max(120),
    consent: consentSchema,
    website_confirm: optionalText(300),
    utm_source: optionalText(200),
    utm_medium: optionalText(200),
    utm_campaign: optionalText(200),
    utm_term: optionalText(200),
    utm_content: optionalText(200),
    landing_page: optionalText(1000),
    referrer: optionalText(1000),
    topic: optionalText(120),
    routing_outcome: z.enum(["not_a_fit", "custom_scope", "in_profile"]),
    suggested_tier: z.union([z.enum(["Silver", "Gold", "Platinum"]), z.literal("")]).optional(),
  })
  .passthrough();

export const leadIntakeResponseSchema = z.object({
  ok: z.boolean(),
  lead_id: z.string().uuid().nullable(),
});

export type LeadIntakeRequest = z.infer<typeof leadIntakeRequestSchema>;
export type LeadIntakeResponse = z.infer<typeof leadIntakeResponseSchema>;

export function normalizeLeadForPersistence(input: LeadIntakeRequest, rawSubmission: unknown) {
  const channels = [...input.sales_channels];

  if (input.sales_channels_other && !channels.includes(input.sales_channels_other)) {
    channels.push(input.sales_channels_other);
  }

  return {
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone ?? "",
    company: input.company,
    website: input.website ?? "",
    revenue_range: input.annual_revenue_range,
    business_type: input.business_type,
    business_type_other: input.business_type_other ?? "",
    accounting_software: input.accounting_software,
    monthly_transactions_range: input.monthly_transactions,
    entities_count: input.legal_entities,
    channels,
    current_books_state: input.books_state,
    start_timeline: input.start_timing,
    consent: true,
    utm_source: input.utm_source ?? "",
    utm_medium: input.utm_medium ?? "",
    utm_campaign: input.utm_campaign ?? "",
    utm_term: input.utm_term ?? "",
    utm_content: input.utm_content ?? "",
    landing_page: input.landing_page ?? "",
    referrer: input.referrer ?? "",
    topic: input.topic ?? "",
    routing_outcome: input.routing_outcome,
    suggested_tier: input.suggested_tier ?? "",
    raw_submission: rawSubmission,
  };
}
