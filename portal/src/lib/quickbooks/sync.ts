import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { quickBooksGet } from "./client";
import {
  extractQuickBooksSnapshot,
  type QuickBooksReport,
} from "./reports";

type CompanyInfoResponse = {
  CompanyInfo?: {
    CompanyName?: string;
    FiscalYearStartMonth?: string;
  };
};

const monthIndexes: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(asOf: Date) {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
}

function fiscalYearStart(asOf: Date, monthName?: string) {
  const startMonth = monthIndexes[(monthName ?? "january").toLowerCase()] ?? 0;
  const year = asOf.getUTCMonth() < startMonth
    ? asOf.getUTCFullYear() - 1
    : asOf.getUTCFullYear();
  return new Date(Date.UTC(year, startMonth, 1));
}

function safeSyncError() {
  return "QuickBooks data refresh needs attention. Reconnect QuickBooks if the issue continues.";
}

export async function syncQuickBooksOrg(orgId: string, actorUserId?: string | null) {
  const admin = createAdminSupabaseClient();

  try {
    const { data: connection, error: connectionError } = await admin
      .from("quickbooks_connections")
      .select("id,realm_id,status")
      .eq("org_id", orgId)
      .maybeSingle();

    if (connectionError || !connection || connection.status === "disconnected") {
      throw new Error("QuickBooks is not connected for this organization.");
    }

    const companyInfo = await quickBooksGet<CompanyInfoResponse>(
      orgId,
      `companyinfo/${encodeURIComponent(connection.realm_id)}`,
    );

    const asOf = new Date();
    const fiscalStart = fiscalYearStart(
      asOf,
      companyInfo.CompanyInfo?.FiscalYearStartMonth,
    );
    const monthStart = startOfMonth(asOf);
    const asOfDate = isoDate(asOf);
    const fiscalStartDate = isoDate(fiscalStart);
    const monthStartDate = isoDate(monthStart);
    const reportDateParams = { report_date: asOfDate, accounting_method: "Accrual" };

    const [profitAndLossYtd, profitAndLossMtd, balanceSheet, agedReceivables, agedPayables] =
      await Promise.all([
        quickBooksGet<QuickBooksReport>(orgId, "reports/ProfitAndLoss", {
          start_date: fiscalStartDate,
          end_date: asOfDate,
          accounting_method: "Accrual",
        }),
        quickBooksGet<QuickBooksReport>(orgId, "reports/ProfitAndLoss", {
          start_date: monthStartDate,
          end_date: asOfDate,
          accounting_method: "Accrual",
        }),
        quickBooksGet<QuickBooksReport>(orgId, "reports/BalanceSheet", {
          end_date: asOfDate,
          accounting_method: "Accrual",
        }),
        quickBooksGet<QuickBooksReport>(orgId, "reports/AgedReceivables", reportDateParams),
        quickBooksGet<QuickBooksReport>(orgId, "reports/AgedPayables", reportDateParams),
      ]);

    const metrics = extractQuickBooksSnapshot({
      profitAndLossYtd,
      profitAndLossMtd,
      balanceSheet,
      agedReceivables,
      agedPayables,
    });

    const sourceUpdatedAt = new Date().toISOString();
    const { error: snapshotError } = await admin
      .from("quickbooks_financial_snapshots")
      .upsert(
        {
          org_id: orgId,
          as_of_date: asOfDate,
          fiscal_ytd_start: fiscalStartDate,
          currency: metrics.currency.slice(0, 3).toUpperCase(),
          accounting_method: "Accrual",
          revenue_mtd: metrics.revenueMtd,
          gross_profit_mtd: metrics.grossProfitMtd,
          net_income_mtd: metrics.netIncomeMtd,
          revenue_ytd: metrics.revenueYtd,
          gross_profit_ytd: metrics.grossProfitYtd,
          operating_income_ytd: metrics.operatingIncomeYtd,
          net_income_ytd: metrics.netIncomeYtd,
          cash_balance: metrics.cashBalance,
          total_assets: metrics.totalAssets,
          total_liabilities: metrics.totalLiabilities,
          accounts_receivable: metrics.accountsReceivable,
          accounts_payable: metrics.accountsPayable,
          source_updated_at: sourceUpdatedAt,
        },
        { onConflict: "org_id,as_of_date" },
      );

    if (snapshotError) {
      throw new Error(`Unable to store QuickBooks financial snapshot: ${snapshotError.message}`);
    }

    const { error: updateError } = await admin
      .from("quickbooks_connections")
      .update({
        company_name: companyInfo.CompanyInfo?.CompanyName ?? null,
        status: "active",
        last_synced_at: sourceUpdatedAt,
        sync_requested_at: null,
        last_error: null,
      })
      .eq("org_id", orgId);

    if (updateError) {
      throw new Error(`Unable to update QuickBooks connection status: ${updateError.message}`);
    }

    await writeAuditLog({
      orgId,
      actorUserId: actorUserId ?? null,
      eventType: "quickbooks.synced",
      entityType: "quickbooks_connection",
      entityId: connection.id,
      metadata: { as_of_date: asOfDate, accounting_method: "Accrual" },
    });

    return { asOfDate, companyName: companyInfo.CompanyInfo?.CompanyName ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_quickbooks_sync_error";

    await admin
      .from("quickbooks_connections")
      .update({ status: "error", last_error: safeSyncError() })
      .eq("org_id", orgId);

    await writeAuditLog({
      orgId,
      actorUserId: actorUserId ?? null,
      eventType: "quickbooks.sync_failed",
      entityType: "quickbooks_connection",
      metadata: { reason: reason.slice(0, 300) },
    });

    throw error;
  }
}
