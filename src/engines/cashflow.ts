import { daysBetween } from "./collections";
import { clampMin0, round2 } from "./money";

export interface CashItem {
  amount: number;
  /** ISO date; null = due now / unscheduled. */
  date: string | null;
  label: string;
  kind: "collection" | "subscription" | "supplier" | "partner" | "employee" | "cto";
}

export interface CashWindow {
  days: number;
  expectedIn: number;
  requiredOut: number;
  net: number;
  projectedBalance: number;
  /** Spec §96: Required upcoming cash − expected collections (never negative). */
  fundingGap: number;
  /** Gap after using today's company cash. */
  shortfallAfterCash: number;
}

/**
 * Cash forecast for 7 / 30 / 90 days (spec §95). Unscheduled obligations are
 * treated as due now; overdue receivables are counted as expected but flagged
 * separately by the caller.
 */
export function forecastCash(currentCash: number, inflows: CashItem[], outflows: CashItem[], todayIso: string, horizons = [7, 30, 90]): CashWindow[] {
  const within = (item: CashItem, days: number) => item.date === null || daysBetween(todayIso, item.date) <= days;
  return horizons.map((days) => {
    const expectedIn = round2(inflows.filter((i) => within(i, days)).reduce((a, i) => a + i.amount, 0));
    const requiredOut = round2(outflows.filter((o) => within(o, days)).reduce((a, o) => a + o.amount, 0));
    return {
      days,
      expectedIn,
      requiredOut,
      net: round2(expectedIn - requiredOut),
      projectedBalance: round2(currentCash + expectedIn - requiredOut),
      fundingGap: clampMin0(requiredOut - expectedIn),
      shortfallAfterCash: clampMin0(requiredOut - expectedIn - currentCash),
    };
  });
}
