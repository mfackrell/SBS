import { describe, expect, it } from "vitest";
import {
  extractQuickBooksSnapshot,
  findReportAmount,
  reportGrandTotal,
  type QuickBooksReport,
} from "../../src/lib/quickbooks/reports";

function report(rows: NonNullable<QuickBooksReport["Rows"]>, currency = "USD"): QuickBooksReport {
  return { Header: { Currency: currency }, Rows: rows };
}

const profitAndLoss = report({
  Row: [
    {
      Header: { ColData: [{ value: "Income" }, { value: "" }] },
      Summary: { ColData: [{ value: "Total Income" }, { value: "125,000.50" }] },
    },
    { ColData: [{ value: "Gross Profit" }, { value: "62,500.25" }] },
    { ColData: [{ value: "Net Operating Income" }, { value: "20,000" }] },
    { ColData: [{ value: "Net Income" }, { value: "(1,250.75)" }] },
  ],
});

const balanceSheet = report({
  Row: [
    { Summary: { ColData: [{ value: "Total Bank Accounts" }, { value: "80,000" }] } },
    { Summary: { ColData: [{ value: "TOTAL ASSETS" }, { value: "250,000" }] } },
    { Summary: { ColData: [{ value: "Total Liabilities" }, { value: "90,000" }] } },
  ],
});

const agedReceivables = report({
  Row: [{ Summary: { ColData: [{ value: "TOTAL" }, { value: "45,250" }] } }],
});

const agedPayables = report({
  Row: [{ Summary: { ColData: [{ value: "TOTAL" }, { value: "18,900" }] } }],
});

describe("QuickBooks report parsing", () => {
  it("extracts named report amounts and accounting negatives", () => {
    expect(findReportAmount(profitAndLoss, ["Total Income"])).toBe(125000.5);
    expect(findReportAmount(profitAndLoss, ["Net Income"])).toBe(-1250.75);
  });

  it("extracts dedicated aging totals", () => {
    expect(reportGrandTotal(agedReceivables)).toBe(45250);
    expect(reportGrandTotal(agedPayables)).toBe(18900);
  });

  it("builds a financial snapshot from the five reports", () => {
    const snapshot = extractQuickBooksSnapshot({
      profitAndLossYtd: profitAndLoss,
      profitAndLossMtd: profitAndLoss,
      balanceSheet,
      agedReceivables,
      agedPayables,
    });

    expect(snapshot).toMatchObject({
      currency: "USD",
      revenueMtd: 125000.5,
      grossProfitMtd: 62500.25,
      netIncomeMtd: -1250.75,
      revenueYtd: 125000.5,
      grossProfitYtd: 62500.25,
      operatingIncomeYtd: 20000,
      netIncomeYtd: -1250.75,
      cashBalance: 80000,
      totalAssets: 250000,
      totalLiabilities: 90000,
      accountsReceivable: 45250,
      accountsPayable: 18900,
    });
  });
});
