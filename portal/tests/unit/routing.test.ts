import { describe, expect, it } from "vitest";
import { determineLeadRouting } from "@/lib/leads/routing";

describe("lead routing helper", () => {
  it("routes under-profile submissions to not_a_fit", () => {
    expect(
      determineLeadRouting({
        annualRevenueRange: "Under $500K",
        businessType: "Service business",
        monthlyTransactions: "50–100",
        legalEntities: "1",
        salesChannelCount: 0,
      }),
    ).toEqual({ outcome: "not_a_fit", tier: "" });
  });

  it("routes larger scopes to custom_scope", () => {
    expect(
      determineLeadRouting({
        annualRevenueRange: "$1M–$2M",
        businessType: "Ecommerce",
        monthlyTransactions: "250–500",
        legalEntities: "3 or more",
        salesChannelCount: 2,
      }),
    ).toEqual({ outcome: "custom_scope", tier: "" });
  });

  it("suggests Silver and Gold using the marketing-site thresholds", () => {
    expect(
      determineLeadRouting({
        annualRevenueRange: "$500K–$1M",
        businessType: "Service business",
        monthlyTransactions: "50–100",
        legalEntities: "1",
        salesChannelCount: 1,
      }),
    ).toEqual({ outcome: "in_profile", tier: "Silver" });

    expect(
      determineLeadRouting({
        annualRevenueRange: "$1M–$2M",
        businessType: "Ecommerce",
        monthlyTransactions: "100–250",
        legalEntities: "1",
        salesChannelCount: 2,
      }),
    ).toEqual({ outcome: "in_profile", tier: "Gold" });
  });

  it("defaults more complex in-profile submissions to Platinum", () => {
    expect(
      determineLeadRouting({
        annualRevenueRange: "$2M–$5M",
        businessType: "Ecommerce",
        monthlyTransactions: "500–1,000",
        legalEntities: "2",
        salesChannelCount: 3,
      }),
    ).toEqual({ outcome: "in_profile", tier: "Platinum" });
  });
});
