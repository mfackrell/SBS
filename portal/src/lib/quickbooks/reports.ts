export type QuickBooksReport = {
  Header?: {
    Currency?: string;
    Time?: string;
    ReportName?: string;
  };
  Rows?: {
    Row?: QuickBooksReportRow[];
  };
};

export type QuickBooksReportRow = {
  ColData?: Array<{ value?: string }>;
  Header?: { ColData?: Array<{ value?: string }> };
  Summary?: { ColData?: Array<{ value?: string }> };
  Rows?: { Row?: QuickBooksReportRow[] };
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return null;
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const numeric = Number(trimmed.replace(/[,$()%]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return negative ? -numeric : numeric;
}

function rowSegments(row: QuickBooksReportRow) {
  return [row.ColData, row.Header?.ColData, row.Summary?.ColData].filter(
    (segment): segment is Array<{ value?: string }> => Boolean(segment?.length),
  );
}

function segmentAmount(segment: Array<{ value?: string }>) {
  for (let index = segment.length - 1; index >= 1; index -= 1) {
    const parsed = parseMoney(segment[index]?.value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function visitRows(
  rows: QuickBooksReportRow[] | undefined,
  visitor: (segment: Array<{ value?: string }>) => number | null,
): number | null {
  for (const row of rows ?? []) {
    for (const segment of rowSegments(row)) {
      const result = visitor(segment);
      if (result !== null) return result;
    }
    const nested = visitRows(row.Rows?.Row, visitor);
    if (nested !== null) return nested;
  }
  return null;
}

export function findReportAmount(
  report: QuickBooksReport,
  labels: string[],
) {
  const wanted = new Set(labels.map(normalizeLabel));
  return visitRows(report.Rows?.Row, (segment) => {
    const label = normalizeLabel(segment[0]?.value ?? "");
    if (!wanted.has(label)) return null;
    return segmentAmount(segment);
  });
}

export function reportGrandTotal(report: QuickBooksReport) {
  const named = findReportAmount(report, ["TOTAL", "Grand Total"]);
  if (named !== null) return named;

  let lastAmount: number | null = null;
  const walk = (rows: QuickBooksReportRow[] | undefined) => {
    for (const row of rows ?? []) {
      for (const segment of rowSegments(row)) {
        const value = segmentAmount(segment);
        if (value !== null) lastAmount = value;
      }
      walk(row.Rows?.Row);
    }
  };
  walk(report.Rows?.Row);
  return lastAmount;
}

export function extractQuickBooksSnapshot(input: {
  profitAndLossYtd: QuickBooksReport;
  profitAndLossMtd: QuickBooksReport;
  balanceSheet: QuickBooksReport;
  agedReceivables: QuickBooksReport;
  agedPayables: QuickBooksReport;
}) {
  return {
    currency:
      input.profitAndLossYtd.Header?.Currency ||
      input.balanceSheet.Header?.Currency ||
      "USD",
    revenueMtd: findReportAmount(input.profitAndLossMtd, [
      "Total Income",
      "Total Revenue",
    ]),
    grossProfitMtd: findReportAmount(input.profitAndLossMtd, ["Gross Profit"]),
    netIncomeMtd: findReportAmount(input.profitAndLossMtd, ["Net Income"]),
    revenueYtd: findReportAmount(input.profitAndLossYtd, [
      "Total Income",
      "Total Revenue",
    ]),
    grossProfitYtd: findReportAmount(input.profitAndLossYtd, ["Gross Profit"]),
    operatingIncomeYtd: findReportAmount(input.profitAndLossYtd, [
      "Net Operating Income",
      "Operating Income",
    ]),
    netIncomeYtd: findReportAmount(input.profitAndLossYtd, ["Net Income"]),
    cashBalance: findReportAmount(input.balanceSheet, [
      "Total Bank Accounts",
      "Total Cash and Cash Equivalents",
      "Cash and Cash Equivalents",
    ]),
    totalAssets: findReportAmount(input.balanceSheet, ["Total Assets"]),
    totalLiabilities: findReportAmount(input.balanceSheet, ["Total Liabilities"]),
    accountsReceivable: reportGrandTotal(input.agedReceivables),
    accountsPayable: reportGrandTotal(input.agedPayables),
  };
}
