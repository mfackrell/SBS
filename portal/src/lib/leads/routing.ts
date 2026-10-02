export type LeadRoutingInput = {
  annualRevenueRange: string;
  businessType: string;
  monthlyTransactions: string;
  legalEntities: string;
  salesChannelCount: number;
};

export type LeadRoutingResult = {
  outcome: "not_a_fit" | "custom_scope" | "in_profile";
  tier: "" | "Silver" | "Gold" | "Platinum";
};

const transactionCeilings: Record<string, number> = {
  "50–100": 100,
  "100–250": 250,
  "250–500": 500,
  "500–1,000": 1000,
};

export function determineLeadRouting(input: LeadRoutingInput): LeadRoutingResult {
  if (
    input.annualRevenueRange === "Under $500K" ||
    input.businessType === "Other" ||
    input.monthlyTransactions === "Under 50"
  ) {
    return { outcome: "not_a_fit", tier: "" };
  }

  if (
    input.annualRevenueRange === "Over $5M" ||
    input.legalEntities === "3 or more" ||
    input.monthlyTransactions === "Over 1,000"
  ) {
    return { outcome: "custom_scope", tier: "" };
  }

  const transactionCeiling =
    transactionCeilings[input.monthlyTransactions] ?? Number.POSITIVE_INFINITY;

  let tier: LeadRoutingResult["tier"] = "Platinum";

  if (
    transactionCeiling <= 100 &&
    input.legalEntities === "1" &&
    input.salesChannelCount <= 1
  ) {
    tier = "Silver";
  } else if (
    transactionCeiling <= 250 &&
    input.legalEntities === "1" &&
    input.salesChannelCount <= 2
  ) {
    tier = "Gold";
  }

  return { outcome: "in_profile", tier };
}
